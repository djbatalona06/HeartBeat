import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THEME_ID, getTheme } from './index';
import { applyTheme } from './tokens';
import type { Theme } from './types';

interface ThemeContextValue {
  theme: Theme;
  themeId: string;
  setThemeId: (id: string) => void;
  calm: boolean;
  calmMode: boolean;
  setCalmMode: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'heartbeat.theme';

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    // Private mode and blocked site data both throw here rather than returning
    // null, so the default has to come from a catch, not a fallback value.
    return DEFAULT_THEME_ID;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(readStored);
  const [calmMode, setCalmMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const theme = getTheme(themeId);
  const calm = calmMode || reducedMotion;

  useEffect(() => {
    applyTheme(theme, calm);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.colors.base);
  }, [theme, calm]);

  function setThemeId(id: string): void {
    setThemeIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // A theme that cannot be remembered is still a theme that works today.
    }
  }

  const value = useMemo(
    () => ({ theme, themeId, setThemeId, calm, calmMode, setCalmMode }),
    [theme, themeId, calm, calmMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}

export function ThemeBackdrop() {
  const { theme, calm } = useTheme();
  const Painted = theme.Backdrop;
  // key forces a fresh canvas per theme rather than repainting over the old one.
  return <Painted key={theme.id} calm={calm} />;
}
