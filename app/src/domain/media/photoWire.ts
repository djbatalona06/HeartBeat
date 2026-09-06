import type { WorkoutPhoto } from '../types';

/**
 * What a day of workout proof looks like on the wire, now that the bytes are
 * not on it.
 *
 * A `photo` entry used to carry two base64 data URIs — around 360 KiB of
 * payload for one day, which is why `PHOTO_PAYLOAD_BYTES` had to be raised to
 * 512 KiB and why the row was heading for D1's size ceiling. It now carries two
 * object keys, so a day of proof is a few hundred bytes like every other kind.
 *
 * **Both shapes have to be readable.** Two phones do not update at the same
 * moment: one can be on a build that still sends `dataUri` while the other is
 * on this one. A reader that only understood keys would show the partner a
 * broken image for however long that lasts, so `fromWire` accepts either and
 * `toWire` keeps sending the bytes until the upload that replaces them lands.
 */

/** One shot as it travels. `dataUri` is only present from an older client. */
export interface WirePhoto {
  facing: WorkoutPhoto['facing'];
  key?: string;
  hash?: string;
  dataUri?: string;
  bytes: number;
  updatedAt: number;
}

/**
 * A shot whose upload has not landed yet still travels as bytes.
 *
 * The alternative is not sending it at all, which would mean a photo taken on a
 * plane never reaches the other phone until someone reopens that day. Sending
 * the old way once is a smaller cost than a proof that silently never arrives.
 */
export function toWire(photo: WorkoutPhoto): WirePhoto {
  const wire: WirePhoto = {
    facing: photo.facing,
    bytes: photo.bytes,
    updatedAt: photo.updatedAt,
  };
  if (photo.key && !photo.pendingUpload) {
    wire.key = photo.key;
    if (photo.hash) wire.hash = photo.hash;
    return wire;
  }
  if (photo.dataUri) wire.dataUri = photo.dataUri;
  return wire;
}

/**
 * Turn a pulled shot into a local row.
 *
 * The bytes are deliberately *not* fetched here — this is pure, and a pull that
 * blocked on downloading two photographs per day would make sync as slow as the
 * slowest connection either phone has ever had. The row lands with a key and no
 * `dataUri`; whatever renders it fetches the bytes when it needs them.
 */
export function fromWire(
  wire: WirePhoto,
  id: string,
  memberId: WorkoutPhoto['memberId'],
  day: WorkoutPhoto['day'],
): WorkoutPhoto {
  return {
    id,
    memberId,
    day,
    facing: wire.facing === 'front' ? 'front' : 'back',
    key: wire.key,
    hash: wire.hash,
    // Only ever set by an older client. Kept, because bytes in hand beat a
    // fetch, and dropping them would blank a photo that was already showing.
    dataUri: wire.dataUri,
    bytes: wire.bytes,
    updatedAt: wire.updatedAt,
  };
}

/** Has this row got something to show, one way or the other? */
export function isRenderable(photo: WorkoutPhoto): boolean {
  return Boolean(photo.dataUri || photo.key);
}

/** Rows whose bytes never reached R2, oldest first, for the sync loop to retry. */
export function awaitingUpload(photos: WorkoutPhoto[]): WorkoutPhoto[] {
  return photos
    .filter((p) => p.pendingUpload && p.dataUri)
    .sort((a, b) => a.updatedAt - b.updatedAt);
}
