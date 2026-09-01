import { useId, useRef, useState } from 'react';
import type { DayKey, MemberId, WorkoutPhoto } from '../../domain/types';
import { putWorkoutPhoto, removeWorkoutPhoto } from '../../db/repository';
import {
  PHOTO_BUDGET_BYTES, QUALITY_LADDER,
  base64PayloadBytes, describeBytes, facingLabel, fitLongEdge, pickWithinBudget, scaleSteps,
  shrinkLongEdge, withinBudget, type Size,
} from './photo';

/**
 * One proof photo, taken on the phone that is holding it.
 *
 * It is a file input rather than `getUserMedia`. A standalone PWA on iOS is not
 * a reliable place to hold a camera stream — permission is asked again on every
 * cold start, and a backgrounded app loses the track — whereas a file input is
 * the system picker, and the system picker has never once failed. `capture` is
 * advisory there: it puts a camera in front of you, it does not skip the
 * picker, which is why nothing in this component's copy promises that it will.
 *
 * All the DOM lives here, and all the arithmetic lives in `photo.ts`, because a
 * canvas cannot be tested in the node environment the suite runs in and the
 * sums are the part that gets subtly wrong.
 */

interface CameraCaptureProps {
  memberId: MemberId;
  day: DayKey;
  facing: WorkoutPhoto['facing'];
  photo?: WorkoutPhoto;
}

/** How many times the whole quality ladder may be retried at a smaller size. */
const MAX_SHRINKS = 3;

interface Proof {
  dataUri: string;
  bytes: number;
}

/** The pixel size of a picked file, read without ever handing it to a canvas. */
function measure(url: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('that image could not be read'));
    image.src = url;
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('that image could not be read'));
    image.src = url;
  });
}

function drawTo(source: CanvasImageSource, size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

/**
 * A picked file, reduced to something worth keeping on a phone.
 *
 * The order matters. The size is read from an `<img>`, which never allocates a
 * canvas; the first reduction is asked of `createImageBitmap`, which resizes
 * during the decode and so never materialises the full frame; and only then
 * does anything reach a canvas, at a size the canvas will actually paint. Hand
 * a 48-megapixel frame straight to `drawImage` on Safari and it paints nothing,
 * quietly, and the photo is a white rectangle nobody notices until later.
 */
async function renderProof(file: File): Promise<Proof> {
  const url = URL.createObjectURL(file);
  try {
    const source = await measure(url);
    const target = fitLongEdge(source);
    const steps = scaleSteps(source, target);

    let drawable: CanvasImageSource | null = null;
    let bitmap: ImageBitmap | null = null;
    let remaining = steps;

    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file, {
          resizeWidth: steps[0].width,
          resizeHeight: steps[0].height,
          resizeQuality: 'high',
        });
        drawable = bitmap;
        remaining = steps.slice(1);
      } catch {
        // Older Safari has createImageBitmap but not its resize options. The
        // <img> path below is slower and hungrier, and it still works.
        bitmap = null;
      }
    }
    if (!drawable) drawable = await loadImage(url);
    // Even when the bitmap already arrived at the target, it has to land on a
    // canvas: a canvas is the only thing here that can encode a JPEG.
    if (remaining.length === 0) remaining = [target];

    try {
      let canvas = drawTo(drawable, remaining[0]);
      for (const size of remaining.slice(1)) canvas = drawTo(canvas, size);

      // The last rung of each attempt, kept so that a photograph nothing could
      // squeeze small enough is still stored rather than refused.
      const fallbacks: string[] = [];
      for (let attempt = 0; attempt <= MAX_SHRINKS; attempt += 1) {
        let smallest = '';
        for (const quality of QUALITY_LADDER) {
          const uri = canvas.toDataURL('image/jpeg', quality);
          smallest = uri;
          if (withinBudget(uri)) return { dataUri: uri, bytes: base64PayloadBytes(uri) };
        }
        fallbacks.push(smallest);
        if (attempt === MAX_SHRINKS) break;
        canvas = drawTo(canvas, shrinkLongEdge({ width: canvas.width, height: canvas.height }));
      }

      const best = pickWithinBudget(fallbacks);
      if (!best) throw new Error('that image could not be read');
      return { dataUri: best, bytes: base64PayloadBytes(best) };
    } finally {
      bitmap?.close();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CameraCapture({ memberId, day, facing, photo }: CameraCaptureProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The input is reset either way: picking the same file twice in a row fires
    // no change event otherwise, and retaking the same shot is a normal thing
    // to want to do.
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const proof = await renderProof(file);
      await putWorkoutPhoto(memberId, day, { facing, dataUri: proof.dataUri, bytes: proof.bytes });
    } catch {
      setError('That photo would not open. Try another one.');
    } finally {
      setBusy(false);
    }
  }

  const label = facingLabel(facing);
  const oversized = photo !== undefined && photo.bytes > PHOTO_BUDGET_BYTES;

  return (
    <div className="proof" data-busy={busy}>
      <span className="proof-label">{label}</span>

      {photo ? (
        <img className="proof-shot" src={photo.dataUri} alt={`Workout proof: ${label.toLowerCase()}`} />
      ) : (
        <label className="proof-slot" htmlFor={inputId}>
          <span className="proof-plus" aria-hidden="true">+</span>
          <span className="proof-slot-text">{busy ? 'Working…' : 'Add a photo'}</span>
        </label>
      )}

      <input
        ref={input}
        id={inputId}
        className="proof-input"
        type="file"
        accept="image/*"
        capture={facing === 'back' ? 'environment' : 'user'}
        onChange={onPicked}
      />

      {photo ? (
        <div className="proof-actions">
          <button type="button" className="proof-action" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Working…' : 'Replace'}
          </button>
          <button
            type="button"
            className="proof-action"
            onClick={() => { void removeWorkoutPhoto(memberId, day, facing); }}
            disabled={busy}
          >
            Remove
          </button>
        </div>
      ) : null}

      {photo ? (
        <span className="proof-size">
          {describeBytes(photo.bytes)}
          {oversized ? ' · kept as is' : null}
        </span>
      ) : null}

      {error ? <span className="proof-error">{error}</span> : null}
    </div>
  );
}
