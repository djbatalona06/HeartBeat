import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALIASES, ALL_DESTINATIONS, ICON_NAMES, MENU_GROUPS, OPEN_WHILE_UNPAIRED, PRIMARY_TABS } from './nav';
import { ACTIVITIES } from './features/activities/catalogue';

/**
 * Navigation is data, so it can be checked.
 *
 * There have now been three arrangements of it — a tab bar plus a home ring, a
 * single rail, and this: six tabs plus a menu. The first split failed by
 * drifting, so what is worth proving is mostly about the split itself. The two
 * surfaces must partition the destinations rather than overlap or leak, and
 * every route the router declares must be reachable from one of them — that
 * last one is checked against `App.tsx` on disk rather than a list written out
 * here, because a list written out here is the copy that drifts.
 */
const APP = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8');

/** Every `<Route path="…">` App.tsx declares, minus the catch-all. */
function declaredRoutes(): string[] {
  return [...APP.matchAll(/<Route path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((path) => path !== '*');
}

/** The ones that are deliberately not on a nav surface, and why. */
const NOT_ON_A_SURFACE = new Set([
  // Redirects to the section of Mood the log became. Kept as a route because
  // it is in notification deep links and possibly on somebody's home screen.
  '/cycle',
  // Run before pairing is even the question, by FirstRunGate.
  '/welcome',
  '/onboarding',
]);

describe('the navigation registry', () => {
  it('puts six tabs on the bar, starting at home', () => {
    expect(PRIMARY_TABS).toHaveLength(6);
    expect(PRIMARY_TABS[0].to).toBe('/');
  });

  it('gives every destination a label, a hint and an icon, and repeats no icon on the bar', () => {
    for (const tab of ALL_DESTINATIONS) {
      expect(tab.label.length, tab.to).toBeGreaterThan(0);
      expect(tab.hint.length, tab.to).toBeGreaterThan(0);
      expect(ICON_NAMES, tab.to).toContain(tab.icon);
    }
    // Six icons side by side are the only thing telling them apart at a
    // glance, so on the bar they have to be six different icons. The menu
    // grid carries a label and a hint beside each, so it does not need this.
    expect(new Set(PRIMARY_TABS.map((t) => t.icon)).size).toBe(PRIMARY_TABS.length);
  });

  it('partitions the destinations: nothing on both surfaces, nothing on neither', () => {
    const onBar = PRIMARY_TABS.map((t) => t.to);
    const inMenu = MENU_GROUPS.flatMap((g) => g.tabs).map((t) => t.to);
    for (const path of onBar) expect(inMenu, path).not.toContain(path);
    expect(new Set([...onBar, ...inMenu]).size).toBe(ALL_DESTINATIONS.length);
  });

  it('goes to a different place from every entry', () => {
    expect(new Set(ALL_DESTINATIONS.map((t) => t.to)).size).toBe(ALL_DESTINATIONS.length);
  });

  it('reaches every route the router declares', () => {
    // The failure this catches is a route added to App.tsx and to no surface,
    // which is a page that exists and cannot be opened.
    //
    // A route also counts as reachable when a destination is its *parent* —
    // `/activities/breathe` is reached from `/activities`, which is the whole
    // point of a hub. Without that, the nine activities would each need their
    // own menu tile, which is exactly the clutter the hub exists to avoid; and
    // the check still catches the real failure, because a hub child whose hub
    // is not on a surface has no prefix to match.
    const reachable = ALL_DESTINATIONS.map((t) => t.to);
    const reaches = (path: string) =>
      reachable.some((to) => to === path || (to !== '/' && path.startsWith(`${to}/`)));
    for (const path of declaredRoutes()) {
      if (NOT_ON_A_SURFACE.has(path)) continue;
      expect(reaches(path), `${path} is a route with no way to it`).toBe(true);
    }
  });

  it('puts every activity on the hub, and every hub tile on a real route', () => {
    // The hub is the surface for these, so `catalogue.ts` is what has to agree
    // with the router — the same drift this whole file exists to prevent, one
    // level down.
    const declared = new Set(declaredRoutes());
    for (const activity of ACTIVITIES) {
      expect(declared, `${activity.to} is on the hub with no route behind it`).toContain(activity.to);
      expect(activity.name.length, activity.to).toBeGreaterThan(0);
      expect(activity.hint.length, activity.to).toBeGreaterThan(0);
      expect(ICON_NAMES, activity.to).toContain(activity.icon);
    }
    for (const path of declaredRoutes()) {
      if (!path.startsWith('/activities/')) continue;
      expect(ACTIVITIES.map((a) => a.to), `${path} is a route the hub does not offer`).toContain(path);
    }
  });

  it('leaves First Aid open on a phone with no partner', () => {
    // It writes nothing and reads nothing, so there is no couple for it to
    // need — and a page meant for somebody's worst hour cannot sit behind a
    // pairing gate.
    expect(OPEN_WHILE_UNPAIRED).toContain('/activities/first-aid');
    expect(ACTIVITIES.find((a) => a.to === '/activities/first-aid')?.openWhileUnpaired).toBe(true);
  });

  it('leads nowhere the router does not go', () => {
    // And the mirror of it: a tab pointing at a route nobody declared.
    const declared = new Set(declaredRoutes());
    for (const tab of [...ALL_DESTINATIONS, ...ALIASES]) {
      expect(declared, `${tab.to} is on a surface with no route behind it`).toContain(tab.to);
    }
  });

  it('does not put Cycle on a surface, because it can be locked', () => {
    // A page that can be locked should not announce itself alongside every
    // other screen. It is a section of Mood now, and only an alias by name.
    expect(ALL_DESTINATIONS.map((t) => t.to)).not.toContain('/cycle');
    expect(ALIASES.map((a) => a.label)).toContain('Cycle');
  });

  it('leaves Settings open on a phone with no partner yet', () => {
    // The gate that would lock it is the pairing form it contains.
    expect(OPEN_WHILE_UNPAIRED).toContain('/settings');
    expect(ALL_DESTINATIONS.map((t) => t.to)).toContain('/settings');
  });
});
