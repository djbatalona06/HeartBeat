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
  typography: ThemeTypography;
  motion: ThemeMotion;
  shape: ThemeShape;
  /** Rendered fixed behind all content. Must be cheap and pause when hidden. */
  Backdrop: ComponentType<BackdropProps>;
}
