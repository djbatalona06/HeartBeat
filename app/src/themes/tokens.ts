import type { Theme } from './types';

/**
 * Themes reach the UI only as CSS custom properties. Components reference
 * `var(--color-accent)` and never import a theme object, so switching theme
 * repaints without re-rendering a single component.
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const c = theme.colors;
  return {
    '--color-base': c.base,
    '--color-surface': c.surface,
    '--color-surface-muted': c.surfaceMuted,
    '--color-border': c.border,
    '--color-text': c.text,
    '--color-text-muted': c.textMuted,
    '--color-accent': c.accent,
    '--color-accent-text': c.accentText,
    '--color-danger': c.danger,
    '--color-success': c.success,
    '--font-display': theme.typography.display,
    '--font-body': theme.typography.body,
    '--font-display-tracking': theme.typography.displayTracking,
    '--font-display-weight': theme.typography.displayWeight,
    '--font-display-transform': theme.typography.displayTransform,
    '--motion-fast': `${theme.motion.fast}ms`,
    '--motion-medium': `${theme.motion.medium}ms`,
    '--motion-easing': theme.motion.easing,
    '--radius': theme.shape.radius,
    '--radius-large': theme.shape.radiusLarge,
    '--border-width': theme.shape.border,
    '--shadow': theme.shape.shadow,
  };
}

export function applyTheme(theme: Theme, calm: boolean): void {
  const root = document.documentElement;
  const vars = themeToCssVars(theme);
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  root.dataset.theme = theme.id;
  root.dataset.calm = calm ? 'true' : 'false';
}

/** Relative luminance per WCAG 2.1, for the contrast test. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const int = parseInt(m[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
