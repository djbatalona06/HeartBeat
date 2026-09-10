import { describe, expect, it } from 'vitest';

import { ICON_NAMES, OPEN_WHILE_UNPAIRED, TABS } from './nav';
import { HOME_DESTINATIONS } from './features/dashboard/layout';

/**
 * The bottom bar is data now, so it can be checked.
 *
 * It used to be an array literal halfway down `App.tsx`, which is why it and
 * the home ring drifted into two hand-maintained copies of the same six
 * destinations with two hand-maintained copies of the same glyph for Move. A
 * test cannot stop that on its own, but it can refuse the shapes that made the
 * drift invisible: a repeated label, an icon with no drawing behind it, a tab
 * that leads somewhere the router does not go.
 */
describe('the tab bar', () => {
  it('is six wide, which is the ceiling on a phone', () => {
    expect(TABS).toHaveLength(6);
  });

  it('gives every tab a label and an icon, and repeats neither', () => {
    for (const tab of TABS) {
      expect(tab.label.length, tab.to).toBeGreaterThan(0);
      expect(ICON_NAMES, tab.to).toContain(tab.icon);
    }
    expect(new Set(TABS.map((t) => t.label)).size).toBe(TABS.length);
    expect(new Set(TABS.map((t) => t.icon)).size).toBe(TABS.length);
  });

  it('goes to six different places, starting at home', () => {
    expect(new Set(TABS.map((t) => t.to)).size).toBe(TABS.length);
    expect(TABS[0].to).toBe('/');
  });

  it('does not carry Cycle, which can be locked', () => {
    // A page that can be locked should not announce itself along the bottom of
    // every other screen. It is a section of Mood now, not a route.
    expect(TABS.map((t) => t.to)).not.toContain('/cycle');
    expect(HOME_DESTINATIONS.map((d) => d.to)).not.toContain('/cycle');
  });

  it('leaves Settings open on a phone with no partner yet', () => {
    // The gate that would lock it is the pairing form it contains.
    expect(OPEN_WHILE_UNPAIRED).toContain('/settings');
    expect(TABS.map((t) => t.to)).toContain('/settings');
  });
});

describe('the two navigation surfaces', () => {
  it('agree on the icon for anywhere they both lead', () => {
    // Move was `▲` in both arrays and had to be changed in both. Whatever the
    // bar and the ring both point at, they should point at it the same way.
    for (const tab of TABS) {
      const door = HOME_DESTINATIONS.find((d) => d.to === tab.to);
      if (!door) continue;
      expect(door.icon, tab.to).toBe(tab.icon);
    }
  });

  it('between them reach every page worth reaching', () => {
    const reachable = new Set([
      ...TABS.map((t) => t.to),
      ...HOME_DESTINATIONS.map((d) => d.to),
    ]);
    // Study had a route and no door at all: its only entrance was a tile on a
    // dashboard that no longer exists. Merging Cycle into Mood freed the slot.
    for (const path of ['/', '/tasks', '/mood', '/exercise', '/work', '/settings', '/study', '/party']) {
      expect(reachable, path).toContain(path);
    }
  });
});
