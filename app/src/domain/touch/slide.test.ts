import { describe, expect, it } from 'vitest';
import { slideDirection, tabIndex } from './slide';

const TABS = ['/', '/tasks', '/quests', '/shop', '/partner', '/assets'];

describe('slideDirection', () => {
  it('slides forward to a tab on the right and back to one on the left', () => {
    expect(slideDirection('/', '/quests', TABS)).toBe('forward');
    expect(slideDirection('/assets', '/tasks', TABS)).toBe('back');
  });

  it('does not slide for the same tab, or a screen the bar cannot place', () => {
    expect(slideDirection('/tasks', '/tasks', TABS)).toBeNull();
    expect(slideDirection('/settings', '/tasks', TABS)).toBeNull();
  });

  it('places a sub-page under its tab, but never under Home by prefix', () => {
    expect(tabIndex('/shop/anything', TABS)).toBe(3);
    expect(tabIndex('/settings', TABS)).toBe(-1);
  });
});
