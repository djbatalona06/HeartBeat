import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THEME_ID, getTheme } from './index';
import { applyTheme, variantOf } from './tokens';
import type { Theme, ThemeMode } from './types';

/**
 * What the user chose. `system` is the default and is not a third palette — it
 * is a deferral to `prefers-color-scheme`, resolved into `mode` below.
 */
export type ModePreference = ThemeMode | 'system';

interface ThemeContextValue {
  theme: Theme;
  themeId: string;
  setThemeId: (id: string) => void;
  calm: boolean;
  calmMode: boolean;
  setCalmMode: (on: boolean) => void;
  /** The palette actually showing, once `system` has been resolved. */
  mode: ThemeMode;
  modePreference: ModePreference;
  setModePreference: (next: ModePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'heartbeat.theme';
const MODE_KEY = 'heartbeat.mode';

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    // Private mode and blocked site data both throw here rather than returning
    // null, so the default has to come from a catch, not a fallback value.
    return DEFAULT_THEME_ID;
  }
}

function readStoredMode(): ModePreference {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Same trap as `readStored`: this throws rather than returning null when
    // site data is blocked, so the default has to come out of the catch.
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(readStored);
  const [calmMode, setCalmMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [modePreference, setModePreferenceState] = useState(readStoredMode);
  const [prefersDark, setPrefersDark] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Watched rather than read once, so a phone on an automatic schedule flips
  // the app at sunset without it having to be reopened.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setPrefersDark(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const theme = getTheme(themeId);
  const calm = calmMode || reducedMotion;
  const mode: ThemeMode = modePreference === 'system'
    ? (prefersDark ? 'dark' : 'light')
    : modePreference;

  useEffect(() => {
    applyTheme(theme, calm, mode);
    const meta = document.querySelector('meta[name="theme-color"]');
    // The bar at the top of the phone has to match the page it is sitting on,
    // so this follows the palette showing rather than the theme's dark one.
    if (meta) meta.setAttribute('content', variantOf(theme, mode).colors.base);
  }, [theme, calm, mode]);

  function setThemeId(id: string): void {
    setThemeIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // A theme that cannot be remembered is still a theme that works today.
    }
  }

  function setModePreference(next: ModePreference): void {
    setModePreferenceState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // A mode that cannot be remembered is still a mode that works today.
    }
  }

  const value = useMemo(
    () => ({
      theme, themeId, setThemeId, calm, calmMode, setCalmMode,
      mode, modePreference, setModePreference,
    }),
    [theme, themeId, calm, calmMode, mode, modePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}

export function ThemeBackdrop() {
  const { theme, calm, mode } = useTheme();
  const Painted = theme.Backdrop;
  // key forces a fresh canvas per theme *and per mode* rather than repainting
  // over the old one — the constants a pack draws with change with the mode,
  // and a canvas that kept its old frame would blend the two.
  return <Painted key={`${theme.id}-${mode}`} calm={calm} light={mode === 'light'} />;
}
