import { describe, expect, it } from 'vitest';
import {
  MAX_CANVAS_PIXELS, PHOTO_BUDGET_BYTES, QUALITY_LADDER, TARGET_LONG_EDGE,
  base64BytesFor, base64PayloadBytes, describeBytes, exceedsCanvasArea, facingLabel,
  fitLongEdge, fitPixelBudget, pickWithinBudget, scaleSteps, shrinkLongEdge, withinBudget,
} from './photo';

/**
 * These sums are the difference between a proof photo and a blank rectangle.
 *
 * A 48-megapixel iPhone frame handed straight to a canvas paints nothing on
 * Safari and throws nothing either, so there is no failure to observe at run
 * time — only a white square in the log, weeks later. The pixel ceiling, the
 * two-step ladder and the byte accounting are all checked here because the
 * device that punishes getting them wrong is not the device running CI.
 */

/** A 48 MP frame from a recent iPhone: 8064 × 6048, well past Safari's ceiling. */
const IPHONE_48MP = { width: 8064, height: 6048 };
/** A 12 MP frame, which fits a canvas but is still far too big to store. */
const IPHONE_12MP = { width: 4032, height: 3024 };
const ALREADY_SMALL = { width: 800, height: 600 };

const dataUri = (payloadBytes: number) => `data:image/jpeg;base64,${'A'.repeat(payloadBytes)}`;

describe('fitLongEdge', () => {
  it('brings a landscape frame down to the target on its long side', () => {
    expect(fitLongEdge(IPHONE_12MP, 1100)).toEqual({ width: 1100, height: 825 });
  });

  it('measures the long side, not the width, so portrait shots survive', () => {
    expect(fitLongEdge({ width: 3024, height: 4032 }, 1100)).toEqual({ width: 825, height: 1100 });
  });

  it('leaves a small image alone rather than upscaling it into bytes', () => {
    expect(fitLongEdge(ALREADY_SMALL, 1100)).toEqual(ALREADY_SMALL);
  });

  it('never rounds a side away to zero', () => {
    const tiny = fitLongEdge({ width: 4000, height: 1 }, 100);
    expect(tiny.height).toBeGreaterThanOrEqual(1);
  });

  it('defaults to the target the screen actually uses', () => {
    expect(Math.max(...Object.values(fitLongEdge(IPHONE_12MP)))).toBe(TARGET_LONG_EDGE);
  });
});

describe('exceedsCanvasArea', () => {
  // The whole reason this file exists: this frame is the silent-blank-canvas
  // case on iOS, and nothing at run time reports it.
  it('catches a 48 megapixel frame', () => {
    expect(exceedsCanvasArea(IPHONE_48MP)).toBe(true);
  });

  it('passes a 12 megapixel frame, which Safari does paint', () => {
    expect(exceedsCanvasArea(IPHONE_12MP)).toBe(false);
  });
});

describe('fitPixelBudget', () => {
  it('brings an oversized frame under the ceiling', () => {
    const safe = fitPixelBudget(IPHONE_48MP);
    expect(safe.width * safe.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it('keeps the aspect ratio while doing it', () => {
    const safe = fitPixelBudget(IPHONE_48MP);
    expect(safe.width / safe.height).toBeCloseTo(IPHONE_48MP.width / IPHONE_48MP.height, 2);
  });

  it('leaves a frame that already fits exactly as it was', () => {
    expect(fitPixelBudget(IPHONE_12MP)).toEqual(IPHONE_12MP);
  });
});

describe('scaleSteps', () => {
  it('takes two steps down from a phone photo rather than one long drop', () => {
    const steps = scaleSteps(IPHONE_12MP, fitLongEdge(IPHONE_12MP));
    expect(steps).toHaveLength(2);
    expect(steps[0].width).toBeGreaterThan(steps[1].width);
  });

  it('ends at the target, whatever route it took', () => {
    const target = fitLongEdge(IPHONE_12MP);
    const steps = scaleSteps(IPHONE_12MP, target);
    expect(steps[steps.length - 1]).toEqual(target);
  });

  it('never asks a canvas for more pixels than it will paint', () => {
    for (const step of scaleSteps(IPHONE_48MP, fitLongEdge(IPHONE_48MP))) {
      expect(exceedsCanvasArea(step)).toBe(false);
    }
  });

  it('halves at most once when the reduction is mild', () => {
    expect(scaleSteps({ width: 1600, height: 1200 }, { width: 1100, height: 825 }))
      .toEqual([{ width: 1100, height: 825 }]);
  });

  it('does nothing at all when the image is already the target size', () => {
    expect(scaleSteps(ALREADY_SMALL, ALREADY_SMALL)).toEqual([ALREADY_SMALL]);
  });
});

describe('base64BytesFor', () => {
  it('charges four bytes for every three, which is the whole trap', () => {
    expect(base64BytesFor(3)).toBe(4);
    expect(base64BytesFor(300)).toBe(400);
  });

  it('pads a partial group up to four, as the encoder does', () => {
    expect(base64BytesFor(1)).toBe(4);
    expect(base64BytesFor(4)).toBe(8);
  });
});

describe('base64PayloadBytes', () => {
  it('measures the payload, not the data: preamble', () => {
    expect(base64PayloadBytes(dataUri(1000))).toBe(1000);
  });

  it('falls back to the whole string when there is no preamble', () => {
    expect(base64PayloadBytes('AAAA')).toBe(4);
  });
});

describe('withinBudget', () => {
  it('accepts a proof at exactly the budget', () => {
    expect(withinBudget(dataUri(PHOTO_BUDGET_BYTES))).toBe(true);
  });

  it('rejects one byte more', () => {
    expect(withinBudget(dataUri(PHOTO_BUDGET_BYTES + 1))).toBe(false);
  });
});

describe('shrinkLongEdge', () => {
  it('takes a fifth off each side, which is a third off the area', () => {
    expect(shrinkLongEdge({ width: 1000, height: 500 })).toEqual({ width: 800, height: 400 });
  });

  it('keeps making progress rather than stalling at one pixel', () => {
    let size = { width: 1100, height: 825 };
    for (let i = 0; i < 4; i += 1) size = shrinkLongEdge(size);
    expect(size.width).toBeLessThan(500);
    expect(size.width).toBeGreaterThan(0);
  });
});

describe('pickWithinBudget', () => {
  it('takes the first candidate that fits, so quality is not thrown away', () => {
    const best = dataUri(PHOTO_BUDGET_BYTES - 10);
    expect(pickWithinBudget([dataUri(PHOTO_BUDGET_BYTES + 500), best, dataUri(100)])).toBe(best);
  });

  it('keeps the smallest rather than dropping the photo when none fit', () => {
    const smallest = dataUri(PHOTO_BUDGET_BYTES + 10);
    expect(pickWithinBudget([dataUri(PHOTO_BUDGET_BYTES + 900), smallest])).toBe(smallest);
  });

  it('has nothing to say about nothing', () => {
    expect(pickWithinBudget([])).toBeNull();
  });
});

describe('the quality ladder', () => {
  it('descends, so each rung is a smaller file than the last', () => {
    for (let i = 1; i < QUALITY_LADDER.length; i += 1) {
      expect(QUALITY_LADDER[i]).toBeLessThan(QUALITY_LADDER[i - 1]);
    }
  });

  it('stays inside the range canvas encoders accept', () => {
    for (const q of QUALITY_LADDER) {
      expect(q).toBeGreaterThan(0);
      expect(q).toBeLessThanOrEqual(1);
    }
  });
});

describe('describeBytes', () => {
  it('reads in kilobytes, which is the unit the screen speaks', () => {
    expect(describeBytes(145 * 1024)).toBe('145 KB');
  });

  it('stays in bytes below a kilobyte rather than saying 0 KB', () => {
    expect(describeBytes(512)).toBe('512 B');
  });
});

describe('facingLabel', () => {
  it('names the two cameras the way the screen does', () => {
    expect(facingLabel('front')).toBe('You');
    expect(facingLabel('back')).toBe('The lift');
  });
});
