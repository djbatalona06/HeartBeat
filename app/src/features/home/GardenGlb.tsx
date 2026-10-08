import { useEffect, useRef, useState } from 'react';
import type { GardenHandle } from '../pet/mascots/3d/gardenScene';

/** Data Saver is the user saying "not now" to a download. */
function saveData(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}

/**
 * The theme's tree in 3D, laid over the drawn garden.
 *
 * ## Why it sits over the SVG instead of replacing it
 *
 * The drawn garden stays mounted underneath, which makes it the first paint,
 * the offline view and the fallback when there is no WebGL or the model never
 * arrives. The canvas is invisible until the engine has drawn a real frame,
 * then fades in — so there is never an empty frame, and a failed download is
 * just the garden you already had. The same ordering as `Mascot3D`.
 *
 * three.js is loaded with a dynamic `import()` out of the lazy `mascot3d`
 * chunk, which `vite.config.ts` keeps out of the precache; nothing outside
 * `mascots/3d/` imports it, which is what keeps it off the boot path.
 */
export function GardenGlb({ src }: { src: string }) {
  if (saveData()) return null;
  return <Tree src={src} />;
}

function Tree({ src }: { src: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let gone = false;
    let handle: GardenHandle | null = null;
    import('../pet/mascots/3d/gardenScene')
      .then(({ mountGarden }) => {
        if (gone || !canvas.current) return;
        handle = mountGarden(canvas.current, src, (ok) => {
          if (!gone) setReady(ok);
        });
      })
      .catch(() => {
        // Offline with the chunk never cached: the drawing is the garden.
      });
    return () => {
      gone = true;
      handle?.dispose();
    };
  }, [src]);

  return (
    <canvas
      ref={canvas}
      className="home-scene-3d"
      data-playing={ready ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
}
