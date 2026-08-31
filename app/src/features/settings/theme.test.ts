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

  it('falls back and writes both when nothing usable is held anywhere', () => {
    expect(reconcile(null, undefined)).toEqual({
      themeId: FALLBACK,
      writeStorage: true,
      writeSettings: true,
    });
  });
});
