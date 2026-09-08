/**
 * The crop rectangle and the size budget for a partner photo.
 */
import { describe, expect, it } from 'vitest';
import {
  PHOTO_BUDGET_BYTES,
  PHOTO_MAX_PX,
  coverBox,
  formatKb,
  isImageDataUri,
  photoBytes,
  withinBudget,
} from './photo';

const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('coverBox', () => {
  it('takes the centre square of a landscape photo', () => {
    expect(coverBox(4000, 3000)).toEqual({ sx: 500, sy: 0, edge: 3000, target: PHOTO_MAX_PX });
  });

  it('takes the centre square of a portrait one', () => {
    expect(coverBox(3000, 4000)).toEqual({ sx: 0, sy: 500, edge: 3000, target: PHOTO_MAX_PX });
  });

  it('crops nothing off a square', () => {
    const box = coverBox(1000, 1000);
    expect(box.sx).toBe(0);
    expect(box.sy).toBe(0);
    expect(box.edge).toBe(1000);
  });

  it('never enlarges a photo that is already smaller than the target', () => {
    expect(coverBox(120, 90).target).toBe(90);
  });

  it('survives a degenerate size rather than dividing by zero', () => {
    expect(coverBox(0, 0)).toEqual({ sx: 0, sy: 0, edge: 1, target: 1 });
  });
});

describe('withinBudget', () => {
  it('accepts a thumbnail', () => {
    expect(withinBudget(TINY_JPEG)).toBe(true);
  });

  it('refuses one byte over the ceiling', () => {
    expect(withinBudget('x'.repeat(PHOTO_BUDGET_BYTES))).toBe(true);
    expect(withinBudget('x'.repeat(PHOTO_BUDGET_BYTES + 1))).toBe(false);
  });

  it('measures the stored string, which is what the row costs', () => {
    expect(photoBytes(TINY_JPEG)).toBe(TINY_JPEG.length);
  });
});

describe('isImageDataUri', () => {
  it('accepts the three encodings a canvas produces', () => {
    expect(isImageDataUri(TINY_JPEG)).toBe(true);
    expect(isImageDataUri('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isImageDataUri('data:image/webp;base64,UklGRg==')).toBe(true);
  });

  it('rejects anything that is not one', () => {
    expect(isImageDataUri('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isImageDataUri('https://example.com/face.jpg')).toBe(false);
    expect(isImageDataUri('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isImageDataUri('')).toBe(false);
  });
});

describe('formatKb', () => {
  it('rounds to whole kilobytes', () => {
    expect(formatKb(64 * 1024)).toBe('64 KB');
    expect(formatKb(1536)).toBe('2 KB');
  });

  it('never says a stored photo is zero', () => {
    expect(formatKb(80)).toBe('1 KB');
  });
});
