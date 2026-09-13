import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/** A slow pastel aurora, plus a few drifting sparkles. */
/**
 * The aurora, and the one stop that has nowhere to go on white.
 *
 * Soft Pastels is five light tints, which is why this theme's dark palette had
 * to invent its two darkest values — and why the backdrop is the one here that
 * needed the most work to survive the inversion: petal frost over white is
 * white. The light set walks all three stops toward the periwinkle end and
 * takes the sparkles down to the ink the text is drawn in, so they read as
 * confetti rather than as glare.
 */
const AURORA = {
  dark: {
    stops: ['255, 214, 255', '200, 182, 255', '187, 208, 255'] as const,
    sparkle: '#ffd6ff',
    sparkleAlpha: 0.14,
    sparkleSwing: 0.12,
  },
  light: {
    stops: ['196, 150, 214', '150, 128, 214', '120, 148, 208'] as const,
    sparkle: '#6b5fa8',
    sparkleAlpha: 0.2,
    sparkleSwing: 0.14,
  },
};

function PonyBackdrop({ calm, light }: { calm: boolean; light: boolean }) {
  const sky = light ? AURORA.light : AURORA.dark;
  const sparkles = Array.from({ length: 34 }, (_, i) => ({
    x: ((i * 53) % 100) / 100,
    y: ((i * 89) % 100) / 100,
    phase: (i * 0.9) % 6.28,
  }));

  return Backdrop({
    still: calm,
    fps: 20,
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      // The Soft Pastels palette read left to right, which is also warm to
      // cool: petal frost, mauve, periwinkle. The shift only moves the
      // opacities, so the gradient breathes without ever changing hue.
      const g = ctx.createLinearGradient(0, 0, w, h);
      const shift = (Math.sin(t * 0.12) + 1) / 2;
      g.addColorStop(0, `rgba(${sky.stops[0]}, ${0.1 + shift * 0.06})`);
      g.addColorStop(0.5, `rgba(${sky.stops[1]}, ${0.09 + shift * 0.05})`);
      g.addColorStop(1, `rgba(${sky.stops[2]}, ${0.1 - shift * 0.04})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const s of sparkles) {
        const a = sky.sparkleAlpha + Math.sin(t * 1.4 + s.phase) * sky.sparkleSwing;
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = sky.sparkle;
        const x = s.x * w;
        const y = s.y * h;
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 1.4, y - 1.4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x + 1.4, y + 1.4);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 1.4, y + 1.4);
        ctx.lineTo(x - 4, y);
        ctx.lineTo(x - 1.4, y - 1.4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  });
}

export const ponyTheme: Theme = {
  id: 'pony',
  name: 'My Little Pony',
  blurb: 'Petal frost and periwinkle, a scatter of sparkles.',
  isLight: false,
  opaqueSurface: '#252145',
  colors: {
    // Soft Pastels is five light tints and no dark, so the two dark values
    // here are the only ones in this file the palette did not supply: a
    // periwinkle taken most of the way to black for the page, and one step up
    // from it for the cards. Everything with a hue is the palette's own.
    base: '#191634',
    surface: 'rgba(38, 34, 70, 0.92)',
    surfaceMuted: 'rgba(52, 46, 92, 0.7)',
    border: 'rgba(200, 182, 255, 0.26)',
    text: '#f6f1ff',
    textMuted: 'rgba(211, 199, 245, 0.68)',
    accent: '#c8b6ff',
    accentText: '#191634',
    danger: '#ff8ba0',
    success: '#93e5c0',
  },
  /**
   * The most faithful of the five, and the one that most wanted doing: Soft
   * Pastels is five light tints and no dark at all, so the dark theme had to
   * invent its two darkest values. This one invents nothing but the ink.
   */
  light: {
    isLight: true,
    opaqueSurface: '#ffffff',
    colors: {
      base: '#fbf7ff',
      surface: 'rgba(255, 255, 255, 0.95)',
      surfaceMuted: 'rgba(231, 198, 255, 0.5)',
      border: 'rgba(98, 82, 158, 0.22)',
      text: '#2a2450',
      textMuted: '#5c5590',
      accent: '#c8b6ff',
      accentText: '#191634',
      danger: '#b32f4c',
      success: '#136f4e',
    },
  },
  typography: {
    display: "'Outfit', system-ui, sans-serif",
    body: "'Outfit', system-ui, sans-serif",
    displayTracking: '-0.01em',
    displayWeight: '500',
    displayTransform: 'none',
  },
  motion: { fast: 170, medium: 340, easing: 'cubic-bezier(0.34, 1.3, 0.5, 1)' },
  shape: {
    radius: '18px',
    radiusLarge: '28px',
    border: '1px',
    shadow: '0 18px 40px rgba(6, 4, 16, 0.58)',
  },
  Backdrop: PonyBackdrop,
};
