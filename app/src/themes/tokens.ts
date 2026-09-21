import type { Theme, ThemeMode, ThemeVariant } from './types';

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

  // The shell's own measurements, as tokens rather than numbers buried in one
  // rule. A screen that needs to know how much room it actually has — the home
  // screen places its ring inside whatever is left — should be able to read it
  // instead of copying `92px` and drifting the next time this changes.
  '--shell-max': '560px',
  '--shell-gutter': '18px',
  '--shell-top': 'var(--space-5)',
  '--shell-bottom': 'var(--space-5)',
  /** The tab bar's own height, before the phone's safe area is added under it.
      A token because `.shell` has to leave exactly this much clear at the
      bottom, and `.menu-panel` has to sit exactly this far above it. */
  '--tabbar-h': '62px',
  /** What a page must leave clear at the bottom: the bar, plus room to breathe.
      Replaced `--shell-left`, which was the same idea for the left-edge rail —
      see the note at the top of nav.ts for why the rail became a bar. */
  '--shell-bottom-clear': 'calc(var(--tabbar-h) + var(--space-5))',

  // The gap between stacked cards. Finch's breathing room is mostly this one
  // number, and it is the first thing to raise when a screen feels crowded.
  '--stack': '18px',

  /**
   * Depth, as one scale rather than a number per rule.
   *
   * These codify what the stylesheet already does instead of renumbering it:
   * content sits at 1, the fixed chrome at the low single digits, and the two
   * overlays that must cover the tab bar were already at 40 and 45. Writing
   * them down is what stops the next overlay being `z-index: 9999` because
   * nobody could tell what it had to beat.
   *
   * `--z-scene` is 0 on purpose: the theme backdrop and, later, the garden on
   * the home screen are painted *behind* everything and never compete with it.
   */
  '--z-scene': '0',
  '--z-content': '1',
  '--z-chrome': '6',
  '--z-overlay': '40',
  '--z-sheet': '45',
  '--z-toast': '50',
};

/**
 * Themes reach the UI only as CSS custom properties. Components reference
 * `var(--color-accent)` and never import a theme object, so switching theme
 * repaints without re-rendering a single component.
 *
 * The shared tokens go in first, so a pack that genuinely needs to override one
 * still can — but has to say so.
 */
/**
 * The one token that is not a colour and still has a ground baked into it.
 *
 * Every pack's shadow is black at 0.5-0.6 alpha, which reads as depth over ink
 * and as a smudge over white. It lives on `theme.shape` rather than on the
 * palette because it is a shape decision, and the correction is identical for
 * all five packs — so one value here rather than a tenth per-pack token.
 *
 * It has to be emitted from this function rather than overridden in the
 * stylesheet: `applyTheme` writes every token as an inline style on the root
 * element, and an inline style beats any `:root[data-mode='light']` rule.
 */
const LIGHT_SHADOW = '0 14px 30px rgba(24, 20, 34, 0.1)';

/** The same correction as a bare colour, for `--shadow-color`. */
const LIGHT_SHADOW_COLOR = 'rgba(24, 20, 34, 0.1)';

/** A theme's dark palette, in the shape its light one already has. */
export function darkVariantOf(theme: Theme): ThemeVariant {
  return { isLight: theme.isLight, opaqueSurface: theme.opaqueSurface, colors: theme.colors };
}

/** The palette showing in `mode`. The one place the two are chosen between. */
export function variantOf(theme: Theme, mode: ThemeMode): ThemeVariant {
  return mode === 'light' ? theme.light : darkVariantOf(theme);
}

/**
 * How much of the ground a scrim and a glass card actually cover, in percent.
 *
 * Exported so the contrast guard can do the compositing arithmetic against the
 * same numbers the stylesheet paints with. Lowering either of these without
 * running `veil.test.ts` is how text over the home garden stops being legible
 * at four in the afternoon on one theme and nobody notices for a month.
 */
export const SCRIM_STRENGTH = 72;
export const GLASS_STRENGTH = 82;

/**
 * How far the accent travels when the pet's mood moves it, in percent.
 *
 * ## The accent is never replaced, only leaned
 *
 * The obvious spelling is a hue rotation — `hsl(var(--accent-h), 70%, 55%)`,
 * one variable, happy is gold and sleepy is blue. It is the wrong shape here
 * for two reasons, and both of them are load-bearing.
 *
 * It would **erase the packs**. Five themes exist so that shinobi's rust and
 * pony's lilac are different apps to be in; a hue driven by a bird's mood is a
 * sixth palette that overrules all five, and on four of them it would simply be
 * wrong. So the pack's own accent stays exactly what the pack said it was, and
 * the mood leans it a bounded distance toward another colour *already in that
 * same palette*. Every theme moves in its own direction.
 *
 * It would also **escape the contrast proof**. `tokens.test.ts` shows that
 * `accentText` clears AA on `accent` for ten palettes; an accent computed at
 * runtime from a hue nobody checked is ten palettes' worth of unproven
 * contrast, and the failure mode is a button legible at noon and not at 3am.
 * `mixAccent` below is the one implementation, so the test walks the real
 * arithmetic rather than an approximation of it.
 *
 * The two poles are chosen for what they mean, not for being warm and cool:
 *
 * - **happy** leans toward `success`, the palette's own word for a good
 *   outcome. It reads as the accent brightening rather than as a new colour.
 * - **sleepy** leans toward `base`, the page's ground. The accent recedes
 *   *into* the page — which is what dozing looks like, and is why this is not
 *   simply a lower opacity: opacity over a live garden is unpredictable, a mix
 *   toward the ground is not.
 *
 * `content` is the untouched accent, so the resting state of the app is the
 * theme exactly as designed. A mood layer whose neutral is not the original is
 * a permanent tint wearing a mood's name.
 *
 * Percentages rather than a ratio because they are emitted as tokens and spent
 * inside `color-mix`, which wants a percentage. 85 on both: the floor across
 * all ten palettes at that strength is 5.22:1, comfortably over AA's 4.5, and
 * the move is still visible. Lowering either without running the test is how a
 * button stops being readable on one theme at night.
 */
export const MOOD_WARM_STRENGTH = 85;
export const MOOD_DIM_STRENGTH = 85;

export function themeToCssVars(theme: Theme, mode: ThemeMode = 'dark'): Record<string, string> {
  const c = variantOf(theme, mode).colors;
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
    '--shadow': mode === 'light' ? LIGHT_SHADOW : theme.shape.shadow,
    '--shadow-color': mode === 'light' ? LIGHT_SHADOW_COLOR : theme.shape.shadowColor,

    /**
     * How much film grain, which is a different number in each mode.
     *
     * Grain is light dust over a dark ground and dirt over a white one, so the
     * light palettes take roughly two thirds of what the dark ones do. It is
     * emitted here rather than set under `:root[data-mode='light']` for the
     * same reason `--shadow` is: `applyTheme` writes every token as an inline
     * style on the root element, and an inline style beats any attribute rule.
     *
     * Deliberately low, and deliberately not a blend mode. `mix-blend-mode:
     * overlay` — the usual recipe — changes luminance per pixel, which is the
     * exact axis `veil.test.ts` guards without knowing blend modes exist, so
     * it would walk text under AA silently. A flat low-alpha wash cannot.
     */
    '--grain-opacity': mode === 'light' ? '0.035' : '0.055',

    /**
     * The overlay layer, which every component used to mix for itself.
     *
     * All three are `color-mix` over palette tokens rather than fixed rgba, so
     * they follow the theme the way everything else does — a scrim that was
     * `rgba(0, 0, 0, 0.5)` is a smudge over a white page and invisible over a
     * dark one, which is the same mistake `--shadow` above already corrects.
     *
     * `--glass` carries real weight now: it is what keeps a card legible over
     * the live garden on the home screen, where the ground behind it moves and
     * cannot be reasoned about at authoring time.
     *
     * The two strengths are named constants rather than literals because
     * `veil.test.ts` composites the garden's own paints through them and
     * asserts the text on top still clears AA. A number that lives in two
     * places is a number that gets tuned in one of them.
     */
    '--scrim': `color-mix(in srgb, ${c.base} ${SCRIM_STRENGTH}%, transparent)`,
    '--glass': `color-mix(in srgb, ${c.surface} ${GLASS_STRENGTH}%, transparent)`,
    '--hairline': `color-mix(in srgb, ${c.text} 14%, transparent)`,

    /**
     * How far the mood may lean the accent, as the stylesheet spends it.
     *
     * Emitted rather than written into `styles.css` as `85%` for the reason
     * `--scrim` and `--glass` are: the number is asserted in `tokens.test.ts`,
     * and a number that lives in two places is a number that gets tuned in one
     * of them. The mix itself stays in CSS — see `--color-accent-live` — so
     * that it re-resolves against whatever palette is showing without the
     * theme engine having to be told the mood changed.
     */
    '--mood-warm': `${MOOD_WARM_STRENGTH}%`,
    '--mood-dim': `${MOOD_DIM_STRENGTH}%`,
  };
}

export function applyTheme(theme: Theme, calm: boolean, mode: ThemeMode = 'dark'): void {
  const root = document.documentElement;
  const vars = themeToCssVars(theme, mode);
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  root.dataset.theme = theme.id;
  root.dataset.calm = calm ? 'true' : 'false';
  // Read by the few rules that need to know — a shadow tuned for a dark ground
  // is invisible on a white one — and by nothing that could have used a token.
  root.dataset.mode = mode;
}

/**
 * The mood the whole app is wearing, as one attribute on the root element.
 *
 * Deliberately *not* folded into `applyTheme`. `applyTheme` writes every token
 * as an inline style, so a mood that went through it would have to be re-sent
 * every time the theme or the palette changed, and whoever knew the mood would
 * have to be wired into whoever knows the theme. Set as an attribute instead,
 * the mix in `styles.css` is a `var()` over the palette that is showing: change
 * theme, change mode, and the leaned accent re-resolves on its own with nothing
 * told about it.
 *
 * It persists after the screen that set it unmounts, which is the intent — the
 * pet's mood is the app's mood, not Home's. The floor is `content`, which is
 * the untouched accent, so an app that never reaches Home is simply the theme.
 */
export function applyMood(mood: string): void {
  document.documentElement.dataset.mood = mood;
}

/**
 * Two colours mixed in sRGB, the way `color-mix(in srgb, a p%, b)` mixes them.
 *
 * A channel-wise lerp on the gamma-encoded bytes, which is what `in srgb`
 * means — not the linearised mix `in srgb-linear` would do. It exists so the
 * contrast test can ask what the stylesheet will actually paint. Both are hex
 * because both poles are: `accent`, `success` and `base` are 6-digit hex in
 * all five packs, while `surfaceMuted` is `rgba()` — which is the reason the
 * dim pole is the page's ground rather than the muted surface.
 */
export function mixHex(a: string, b: string, percent: number): string {
  const parse = (hex: string): number => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
    return parseInt(m[1], 16);
  };
  const [x, y] = [parse(a), parse(b)];
  const f = Math.min(1, Math.max(0, percent / 100));
  const channel = (shift: number): string => {
    const v = Math.round((((x >> shift) & 255) * f) + (((y >> shift) & 255) * (1 - f)));
    return v.toString(16).padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * The accent a palette actually paints with, once the mood has leaned it.
 *
 * The single implementation of what `--color-accent-live` resolves to. The
 * stylesheet spells the same mix in CSS because it has to re-resolve on a theme
 * change without JavaScript; this is what the test measures, and the two are
 * kept honest by `--mood-warm` and `--mood-dim` being emitted from the same
 * constants the stylesheet reads.
 */
export function accentForMood(variant: ThemeVariant, mood: string): string {
  const c = variant.colors;
  if (mood === 'happy') return mixHex(c.accent, c.success, MOOD_WARM_STRENGTH);
  if (mood === 'sleepy') return mixHex(c.accent, c.base, MOOD_DIM_STRENGTH);
  return c.accent;
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
