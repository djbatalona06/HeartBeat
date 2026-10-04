import { describe, expect, it } from 'vitest';
import { ALL_DESTINATIONS } from '../../nav';
import { GUIDES, guideForPath } from './guides';

describe('guides', () => {
  // Every place the nav can take somebody has a guide behind its (i). A new
  // destination without one fails here rather than shipping a page nobody
  // explained.
  it.each(ALL_DESTINATIONS.map((tab) => [tab.to] as const))('%s has a guide', (to) => {
    expect(guideForPath(to)).toBeDefined();
  });

  it.each(['raidSheet', 'vitals', 'charges', 'gear'] as const)('the %s panel has a guide', (id) => {
    expect(GUIDES[id]).toBeDefined();
  });

  // Idiot-proof means short: a guide that needs scrolling has stopped being
  // the quick answer it is for.
  it.each(Object.entries(GUIDES))('%s is short enough to read at a glance', (_id, guide) => {
    expect(guide.title.trim()).not.toBe('');
    expect(guide.steps.length).toBeGreaterThanOrEqual(2);
    expect(guide.steps.length).toBeLessThanOrEqual(4);
    for (const step of guide.steps) expect(step.length, step).toBeLessThanOrEqual(110);
    expect(guide.game.trim()).not.toBe('');
    expect(guide.game.length, guide.game).toBeLessThanOrEqual(240);
  });

  it('answers nothing for a path with no page', () => {
    expect(guideForPath('/nowhere')).toBeUndefined();
  });
});
