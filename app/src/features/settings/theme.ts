/**
 * Two places remember which theme this phone wears, and this is where they are
 * made to agree.
 *
 * ThemeProvider keeps the choice in `localStorage['heartbeat.theme']`, because
 * the first paint cannot wait on an async IndexedDB read — a themed app that
 * flashes the default palette for 200ms on every cold start is worse than one
 * with no themes. `Settings.themeId` is the durable copy: it is a row in the
 * same database as everything else the app remembers, so it survives site data
 * being cleared out from under localStorage and comes back with a restore.
 *
 * Neither is dropped, then. Both are written on every change, and this decides
 * which one speaks when they disagree.
 *
 * The one subtlety is that `loadSettings` spreads DEFAULT_SETTINGS underneath
 * the stored row, so a themeId that was never chosen reads back as 'kitty'
 * rather than as undefined — indistinguishable from someone who likes kitty.
 * That is why a saved value equal to the default never overrides a real choice
 * held in storage: the ambiguous one yields to the unambiguous one.
 *
 * DOM-free apart from the two storage helpers, which are the only functions in
 * here vitest does not call.
 */

/** Must stay identical to STORAGE_KEY in themes/ThemeProvider.tsx. */
export const THEME_STORAGE_KEY = 'heartbeat.theme';

export interface ThemeChoice {
  /** The theme that should be showing. */
  themeId: string;
  /** True when localStorage is behind and should be caught up. */
  writeStorage: boolean;
  /** True when the settings row is behind and should be caught up. */
  writeSettings: boolean;
}

export interface ThemeSources {
  /** What localStorage holds, or null when it holds nothing or threw. */
  stored: string | null;
  /** What the settings row holds — already defaulted, so rarely undefined. */
  saved: string | undefined;
  /** Every theme id the build actually ships. */
  known: readonly string[];
  /** The id DEFAULT_SETTINGS carries, and so the ambiguous one. */
  fallback: string;
}

export function reconcileTheme({ stored, saved, known, fallback }: ThemeSources): ThemeChoice {
  const storedOk = stored !== null && known.includes(stored);
  const savedOk = saved !== undefined && known.includes(saved);

  // Nothing usable anywhere: fall back, and write it down so the next read is
  // not a fallback but an answer.
  if (!storedOk && !savedOk) {
    return { themeId: fallback, writeStorage: true, writeSettings: true };
  }
  if (!storedOk) return { themeId: saved as string, writeStorage: true, writeSettings: false };
  if (!savedOk) return { themeId: stored, writeStorage: false, writeSettings: true };
  if (stored === saved) return { themeId: stored, writeStorage: false, writeSettings: false };

  // They disagree. A saved value equal to the default might be a choice or
  // might be the default showing through, so the definite one wins; otherwise
  // the durable copy does.
  if (saved === fallback) return { themeId: stored, writeStorage: false, writeSettings: true };
  return { themeId: saved as string, writeStorage: true, writeSettings: false };
}

export function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Private mode and blocked site data throw here rather than returning null.
    return null;
  }
}

export function writeStoredTheme(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // A theme that cannot be remembered is still a theme that works today —
    // and the settings row is the copy that was going to outlive this one.
  }
}
