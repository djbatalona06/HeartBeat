import type { ComponentType } from 'react';

export interface ThemeColors {
  /** Page background, behind the animated backdrop. */
  base: string;
  /** Card and surface fill. Must read as raised against `base`. */
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  /** Primary colour: buttons, active states, progress. */
  accent: string;
  accentText: string;
  danger: string;
  success: string;
}

export interface ThemeTypography {
  display: string;
  /** Kept separate so a decorative display face never hurts reading. */
  body: string;
  displayTracking: string;
  displayWeight: string;
  displayTransform: 'none' | 'uppercase';
}

export interface ThemeMotion {
  fast: number;
  medium: number;
  easing: string;
}

export interface ThemeShape {
  radius: string;
  radiusLarge: string;
  border: string;
  shadow: string;
}

export interface BackdropProps {
  /** True when effects should be damped: calm mode or reduced-motion. */
  calm: boolean;
  /** True when the light palette is showing, so a pack can pick tones that
   *  survive being drawn over white. A pale sparkle on a white page is not a
   *  subtle sparkle, it is an invisible one. */
  light: boolean;
}

/** Which of a theme's two palettes is showing. */
export type ThemeMode = 'light' | 'dark';

/**
 * One palette of a theme, and the two facts about it that are not colours.
 *
 * Every theme has two. `Theme.colors` is the dark one, kept at the top level
 * rather than moved in here so that nothing which already reads a theme had to
 * change to gain a light mode.
 */
export interface ThemeVariant {
  isLight: boolean;
  /** The opaque colour behind semi-transparent surfaces, for contrast maths. */
  opaqueSurface: string;
  colors: ThemeColors;
}

export interface Theme {
  id: string;
  name: string;
  /** One line shown in the theme picker. */
  blurb: string;
  /** True when surfaces are light, so paired colours can pick a variant. */
  isLight: boolean;
  /** The opaque colour behind semi-transparent surfaces, for contrast maths. */
  opaqueSurface: string;
  colors: ThemeColors;
  /**
   * The same theme with white-dominant surfaces.
   *
   * A second palette rather than a sixth pack, because the ask was that half of
   * *every* theme be white-based — a single white theme would have left the
   * other four exactly as dark as they were. Each keeps its own accent, so this
   * is the same character on a different ground rather than a different theme.
   */
  light: ThemeVariant;
  typography: ThemeTypography;
  motion: ThemeMotion;
  shape: ThemeShape;
  /** Rendered fixed behind all content. Must be cheap and pause when hidden. */
  Backdrop: ComponentType<BackdropProps>;
}
