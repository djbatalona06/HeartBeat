import { describe, expect, it } from 'vitest';
import { awaitingUpload, fromWire, isRenderable, toWire } from './photoWire';
import type { WorkoutPhoto } from '../types';

const base: WorkoutPhoto = {
  id: 'p1',
  memberId: 'm1',
  day: '2026-09-06',
  facing: 'back',
  bytes: 1234,
  updatedAt: 500,
};

const KEY = `media/c1/m1/${'a'.repeat(64)}.webp`;

describe('toWire', () => {
  it('sends the key, not the bytes, once the upload has landed', () => {
    const wire = toWire({ ...base, key: KEY, hash: 'a'.repeat(64), dataUri: 'data:image/webp;base64,AAA' });
    expect(wire).toEqual({ facing: 'back', key: KEY, hash: 'a'.repeat(64), bytes: 1234, updatedAt: 500 });
    // The whole point: a day of proof is no longer a third of a megabyte.
    expect(wire.dataUri).toBeUndefined();
  });

  it('still sends the bytes while an upload is pending', () => {
    const wire = toWire({ ...base, key: KEY, pendingUpload: true, dataUri: 'data:image/webp;base64,AAA' });
    // A photo taken on a plane should still reach the other phone.
    expect(wire.dataUri).toBe('data:image/webp;base64,AAA');
    expect(wire.key).toBeUndefined();
  });

  it('sends the bytes for a row that predates the move to R2', () => {
    expect(toWire({ ...base, dataUri: 'data:image/jpeg;base64,BBB' }).dataUri)
      .toBe('data:image/jpeg;base64,BBB');
  });
});

describe('fromWire', () => {
  it('lands a key without fetching anything', () => {
    const row = fromWire({ facing: 'front', key: KEY, hash: 'a'.repeat(64), bytes: 9, updatedAt: 7 }, 'x', 'm2', '2026-09-06');
    expect(row).toMatchObject({ id: 'x', memberId: 'm2', day: '2026-09-06', facing: 'front', key: KEY });
    // Sync must not block on downloading photographs.
    expect(row.dataUri).toBeUndefined();
  });

  it('keeps bytes sent by a phone still on the older build', () => {
    const row = fromWire({ facing: 'back', dataUri: 'data:image/jpeg;base64,BBB', bytes: 9, updatedAt: 7 }, 'x', 'm2', '2026-09-06');
    // Dropping them would blank a photo that was already showing.
    expect(row.dataUri).toBe('data:image/jpeg;base64,BBB');
    expect(row.key).toBeUndefined();
  });

  it('never trusts the wire for which camera it was', () => {
    const row = fromWire({ facing: 'sideways' as never, bytes: 1, updatedAt: 1 }, 'x', 'm2', 'd');
    expect(row.facing).toBe('back');
  });

  it('round-trips a stored shot through both directions', () => {
    const stored = { ...base, key: KEY, hash: 'a'.repeat(64) };
    const back = fromWire(toWire(stored), stored.id, stored.memberId, stored.day);
    expect(back).toMatchObject({ key: KEY, facing: 'back', bytes: 1234, updatedAt: 500 });
  });
});

describe('isRenderable', () => {
  it('is true with bytes, true with a key, false with neither', () => {
    expect(isRenderable({ ...base, dataUri: 'data:image/webp;base64,A' })).toBe(true);
    expect(isRenderable({ ...base, key: KEY })).toBe(true);
    expect(isRenderable(base)).toBe(false);
  });
});

describe('awaitingUpload', () => {
  it('finds the shots whose bytes never reached R2, oldest first', () => {
    const rows: WorkoutPhoto[] = [
      { ...base, id: 'b', updatedAt: 900, pendingUpload: true, dataUri: 'data:,x' },
      { ...base, id: 'a', updatedAt: 100, pendingUpload: true, dataUri: 'data:,x' },
      { ...base, id: 'done', key: KEY },
    ];
    expect(awaitingUpload(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('skips a pending row with nothing left to upload', () => {
    // Nothing to retry, and retrying it forever would be a loop.
    expect(awaitingUpload([{ ...base, pendingUpload: true }])).toEqual([]);
  });
});
