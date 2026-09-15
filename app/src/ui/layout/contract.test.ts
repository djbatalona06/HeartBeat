import { describe, expect, it } from 'vitest';
import {
  MAX_PANES, MAX_VIEWPORTS, clampPaneIndex, exceedsPaneLimit, exceedsScrollLimit,
  overBudgetWarning, paneAfterKey,
} from './contract';

describe('the pane ceiling', () => {
  it('allows exactly three and refuses a fourth', () => {
    expect(MAX_PANES).toBe(3);
    expect(exceedsPaneLimit(3)).toBe(false);
    expect(exceedsPaneLimit(4)).toBe(true);
  });

  it('does not complain about a pager with nothing in it', () => {
    // A screen still loading its data has zero panes for a frame or two, and
    // warning then would fire on screens that are perfectly within budget.
    expect(exceedsPaneLimit(0)).toBe(false);
  });
});

describe('the scroll ceiling', () => {
  it('allows exactly three viewports and refuses more', () => {
    expect(MAX_VIEWPORTS).toBe(3);
    expect(exceedsScrollLimit(1800, 600)).toBe(false);
    expect(exceedsScrollLimit(1801, 600)).toBe(true);
  });

  /**
   * The bug this prevents: `scrollHeight / 0` is `Infinity`, which is over any
   * ceiling. A hidden tab, a `ResizeObserver` that fires before layout, and
   * jsdom all report a zero-height viewport — so without this guard every
   * screen in the app warns the first time any of those happens, and the
   * warning stops meaning anything.
   */
  it('stays quiet when the viewport has no height yet', () => {
    expect(exceedsScrollLimit(5000, 0)).toBe(false);
    expect(exceedsScrollLimit(5000, -1)).toBe(false);
    expect(exceedsScrollLimit(5000, Number.NaN)).toBe(false);
  });
});

describe('clampPaneIndex', () => {
  it('keeps an index inside the panes that exist', () => {
    expect(clampPaneIndex(-1, 3)).toBe(0);
    expect(clampPaneIndex(0, 3)).toBe(0);
    expect(clampPaneIndex(2, 3)).toBe(2);
    expect(clampPaneIndex(3, 3)).toBe(2);
    expect(clampPaneIndex(99, 3)).toBe(2);
  });

  it('answers 0 for an empty pager rather than -1', () => {
    // `count - 1` is -1 when there are no panes, and a caller doing
    // `panes[index]` with -1 gets `undefined` — but a caller doing
    // `panes.at(index)` gets the *last* element, which is worse than nothing.
    expect(clampPaneIndex(0, 0)).toBe(0);
    expect(clampPaneIndex(5, 0)).toBe(0);
  });

  it('survives a non-finite index', () => {
    expect(clampPaneIndex(Number.NaN, 3)).toBe(0);
    expect(clampPaneIndex(Infinity, 3)).toBe(0);
  });

  it('truncates a fractional index rather than rounding past the end', () => {
    // A scroll position mid-swipe divides into a fraction; 2.9 of 3 panes is
    // still pane 2, and rounding would report a pane that does not exist.
    expect(clampPaneIndex(2.9, 3)).toBe(2);
    expect(clampPaneIndex(0.9, 3)).toBe(0);
  });
});

describe('paneAfterKey', () => {
  it('moves one pane per arrow', () => {
    expect(paneAfterKey('ArrowRight', 0, 3)).toBe(1);
    expect(paneAfterKey('ArrowLeft', 1, 3)).toBe(0);
  });

  /**
   * Clamps rather than wraps, deliberately. A right-swipe off the last pane
   * landing back on the first reads as the screen having jumped — with three
   * panes there is never enough travel for it to feel like a carousel.
   */
  it('stops at both ends instead of wrapping', () => {
    expect(paneAfterKey('ArrowRight', 2, 3)).toBe(2);
    expect(paneAfterKey('ArrowLeft', 0, 3)).toBe(0);
  });

  it('ignores every other key', () => {
    for (const key of ['Enter', 'Tab', 'a', 'ArrowUp', 'ArrowDown', ' ']) {
      expect(paneAfterKey(key, 1, 3), key).toBe(1);
    }
  });
});

describe('overBudgetWarning', () => {
  it('says nothing about a screen within its budget', () => {
    expect(overBudgetWarning('MoodPage', { panes: 2 })).toBeNull();
    expect(overBudgetWarning('MoodPage', { scrollHeight: 1200, viewportHeight: 600 })).toBeNull();
    expect(overBudgetWarning('MoodPage', {})).toBeNull();
  });

  it('names the screen, the count and the ceiling', () => {
    const warning = overBudgetWarning('PartyPage', { panes: 5 });
    expect(warning).toContain('PartyPage');
    expect(warning).toContain('5');
    expect(warning).toContain('3');
  });

  it('reports how tall a too-long screen actually is', () => {
    const warning = overBudgetWarning('PartyPage', { scrollHeight: 3000, viewportHeight: 600 });
    expect(warning).toContain('5.0 viewports');
  });

  /**
   * The wording is a rule, not decoration: this is a design budget, and a
   * warning that only says "too long" gets silenced instead of acted on. Each
   * message has to say what to do about it.
   */
  it('tells the reader what to do, not just that they are over', () => {
    expect(overBudgetWarning('X', { panes: 4 })).toMatch(/split it into two screens/i);
    expect(overBudgetWarning('X', { scrollHeight: 3000, viewportHeight: 600 }))
      .toMatch(/not being read/i);
  });

  it('leads with the pane ceiling when a screen is over both', () => {
    // Both at once means the screen is far too big; naming the panes first is
    // the more actionable half, since splitting panes fixes the height too.
    const warning = overBudgetWarning('X', { panes: 9, scrollHeight: 9000, viewportHeight: 600 });
    expect(warning).toContain('panes');
  });
});
