import type { Theme } from './types';

/**
 * The shared design language — Finch's *shape*, borrowed on purpose.
 *
 * Finch reads the way it does because of generous padding, a big friendly type
 * scale, and tap targets you can hit without looking. None of that is a colour,
 * so none of it belongs in a theme pack: it lives here, and every pack inherits
 * it and keeps its own palette.
 *
 * Two things stay out of this layer deliberately. Per-pack radii are character,
 * not inconsistency — shinobi being sharp and pony being round is the point of
 * having five packs at all. And Finch's own density is not copied: its screens
 * are widely and fairly critiqued as cluttered, so what is taken is the shape
 * and the breathing room, not the number of things on a page.
 */
export const SHARED_TOKENS: Record<string, string> = {
  // A 4px scale. Everything in the stylesheet is one of these, so the rhythm
  // is a decision made once rather than a guess made per component.
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-5': '24px',
  '--space-6': '32px',
  '--space-7': '44px',

  // Big, friendly, and fluid. The floor matters more than the ceiling: nothing
  // that carries meaning is allowed below 12px.
  '--text-xs': '12px',
  '--text-sm': '13.5px',
  '--text-base': '15.5px',
  '--text-lg': 'clamp(17px, 4.4vw, 19px)',
  '--text-xl': 'clamp(21px, 5.4vw, 25px)',
  '--text-2xl': 'clamp(26px, 7vw, 34px)',
  '--text-3xl': 'clamp(32px, 9vw, 44px)',
  '--line-tight': '1.15',
  '--line-body': '1.55',

  // 48px, above Apple's 44pt floor. A one-handed tap on a phone in bed is the
  // posture this app is actually used in.
  '--tap': '48px',

  // One soft curve, used by everything that moves. Overshoot on purpose: it is
  // what makes a bar filling read as a reward rather than a progress report.
  '--ease-soft': 'cubic-bezier(0.34, 1.4, 0.5, 1)',
  '--motion-slow': '520ms',
};

/**
 * Themes reach the UI only as CSS custom properties. Components reference
 * `var(--color-accent)` and never import a theme object, so switching theme
 * repaints without re-rendering a single component.
 *
 * The shared tokens go in first, so a pack that genuinely needs to override one
 * still can — but has to say so.
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const c = theme.colors;
  return {
    ...SHARED_TOKENS,
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
