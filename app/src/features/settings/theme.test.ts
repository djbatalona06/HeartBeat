/**
 * Which of the two stores wins when they disagree, and who gets caught up.
 */
import { describe, expect, it } from 'vitest';
import { reconcileTheme } from './theme';

const KNOWN = ['kitty', 'sponge', 'shinobi', 'avatar', 'pony'] as const;
const FALLBACK = 'kitty';

function reconcile(stored: string | null, saved: string | undefined) {
  return reconcileTheme({ stored, saved, known: KNOWN, fallback: FALLBACK });
}

function reconcilePending(pending: string | null, stored: string | null, saved: string) {
  return reconcileTheme({ stored, pending, saved, known: KNOWN, fallback: FALLBACK });
}

describe('reconcileTheme', () => {
  it('writes nothing when both stores already agree', () => {
    expect(reconcile('pony', 'pony')).toEqual({
      themeId: 'pony',
      writeStorage: false,
      writeSettings: false,
    });
  });

  it('restores the saved choice when site data was cleared under localStorage', () => {
    expect(reconcile(null, 'shinobi')).toEqual({
      themeId: 'shinobi',
      writeStorage: true,
      writeSettings: false,
    });
  });

  it('backfills the settings row for a phone that only ever wrote localStorage', () => {
    expect(reconcile('avatar', undefined)).toEqual({
      themeId: 'avatar',
      writeStorage: false,
      writeSettings: true,
    });
  });

  it('keeps a real choice in storage over a saved value that is only the default', () => {
    expect(reconcile('sponge', FALLBACK)).toEqual({
      themeId: 'sponge',
      writeStorage: false,
      writeSettings: true,
    });
  });

  it('prefers the durable copy when both hold a deliberate, different answer', () => {
    expect(reconcile('sponge', 'pony')).toEqual({
      themeId: 'pony',
      writeStorage: true,
      writeSettings: false,
    });
  });

  it('ignores an id this build no longer ships', () => {
    expect(reconcile('vaporwave', 'pony').themeId).toBe('pony');
    expect(reconcile('pony', 'vaporwave')).toEqual({
      themeId: 'pony',
      writeStorage: false,
      writeSettings: true,
    });
  });

  it('keeps a pick that is still settling, which is how kitty becomes selectable again', () => {
    // The bug this is here for: from any other theme, picking Hello Kitty
    // wrote storage synchronously and the settings row asynchronously. The
    // re-render arrived first, so the row still said 'sponge' — a deliberate,
    // non-default value, which won, and the pick was undone a frame after it
    // was made. Only kitty could lose this way: it is the fallback, so in the
    // other direction the stale row reads as ambiguous and yields.
    expect(reconcilePending('kitty', 'kitty', 'sponge')).toEqual({
      themeId: 'kitty',
      writeStorage: false,
      writeSettings: false,
    });
  });

  it('stops deferring to the pick once the settings row carries it', () => {
    expect(reconcilePending('kitty', 'kitty', 'kitty')).toEqual({
      themeId: 'kitty',
      writeStorage: false,
      writeSettings: false,
    });
  });

  it('ignores a pending id this build does not ship', () => {
    expect(reconcilePending('vaporwave', 'sponge', 'sponge').themeId).toBe('sponge');
  });

  it('is the ordinary reconcile when nothing is in flight', () => {
    expect(reconcilePending(null, 'kitty', 'sponge').themeId).toBe('sponge');
  });

  it('falls back and writes both when nothing usable is held anywhere', () => {
    expect(reconcile(null, undefined)).toEqual({
      themeId: FALLBACK,
      writeStorage: true,
      writeSettings: true,
    });
  });
});
