import { describe, expect, it } from 'vitest';

import { ICON_NAMES, OPEN_WHILE_UNPAIRED, TABS } from './nav';

/**
 * The nav rail is data, so it can be checked.
 *
 * There used to be two surfaces — a tab bar and a home ring — each with its
 * own hand-maintained six destinations, checked against each other by a test
 * here. One surface now, so there is nothing left to keep in step: what is
 * worth checking is the shapes that would make a rail quietly wrong instead —
 * a repeated label, an icon with no drawing behind it, a tab that leads
 * somewhere the router does not go.
 */
describe('the nav rail', () => {
  it('carries every destination the app has', () => {
    expect(TABS).toHaveLength(9);
  });

  it('gives every tab a label and an icon, and repeats neither', () => {
    for (const tab of TABS) {
      expect(tab.label.length, tab.to).toBeGreaterThan(0);
      expect(ICON_NAMES, tab.to).toContain(tab.icon);
    }
    expect(new Set(TABS.map((t) => t.label)).size).toBe(TABS.length);
    expect(new Set(TABS.map((t) => t.icon)).size).toBe(TABS.length);
  });

  it('goes to nine different places, starting at home', () => {
    expect(new Set(TABS.map((t) => t.to)).size).toBe(TABS.length);
    expect(TABS[0].to).toBe('/');
  });

  it('does not carry Cycle, which can be locked', () => {
    // A page that can be locked should not announce itself alongside every
    // other screen. It is a section of Mood now, not a route.
    expect(TABS.map((t) => t.to)).not.toContain('/cycle');
  });

  it('leaves Settings open on a phone with no partner yet', () => {
    // The gate that would lock it is the pairing form it contains.
    expect(OPEN_WHILE_UNPAIRED).toContain('/settings');
    expect(TABS.map((t) => t.to)).toContain('/settings');
  });

  it('reaches every page worth reaching', () => {
    const reachable = new Set(TABS.map((t) => t.to));
    for (const path of [
      '/', '/tasks', '/mood', '/exercise', '/work', '/settings', '/study', '/party', '/assets',
    ]) {
      expect(reachable, path).toContain(path);
    }
  });
});
