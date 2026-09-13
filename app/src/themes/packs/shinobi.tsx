import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/**
 * Leaves on a spiral draft, the way paper falls in a courtyard.
 *
 * Two ember tones now rather than one, alternating by index: a single flat
 * orange read as confetti, and the Fiery palette carries both a bright
 * Princeton orange and a burnt autumn one that sit a whole shade apart.
 * Alternating them is what makes the fall read as depth.
 */
const EMBERS = ['#fb8b24', '#e36414'];

/** The same two embers, deepened for paper: on white the bright Princeton
 *  orange loses most of its contrast, so the light pair steps toward the
 *  palette's burnt end and the crimson violet the text is drawn in. */
const EMBERS_LIGHT = ['#d2600c', '#9a031e'];

/** Alpha, not colour, is what mostly fails on a white ground — a translucent
 *  leaf over black is dim, over white it is gone. */
const LEAF_ALPHA = { dark: 0.24, light: 0.4 };

function ShinobiBackdrop({ calm, light }: { calm: boolean; light: boolean }) {
  const palette = light ? EMBERS_LIGHT : EMBERS;
  const leaves = Array.from({ length: 26 }, (_, i) => ({
    x: ((i * 73) % 100) / 100,
    phase: (i * 1.31) % 6.28,
    speed: 0.05 + ((i * 3) % 8) / 200,
    size: 5 + ((i * 7) % 8),
    ember: palette[i % palette.length],
  }));

  return Backdrop({
    still: calm,
    fps: 24,
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      for (const l of leaves) {
        const y = ((t * l.speed * h) + l.phase * 150) % (h + 80) - 40;
        const x = l.x * w + Math.sin(t * 0.9 + l.phase) * 40;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 1.1 + l.phase);
        ctx.globalAlpha = light ? LEAF_ALPHA.light : LEAF_ALPHA.dark;
        ctx.fillStyle = l.ember;
        ctx.beginPath();
        ctx.ellipse(0, 0, l.size, l.size * 0.44, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  });
}

export const shinobiTheme: Theme = {
  id: 'shinobi',
  name: 'Naruto',
  blurb: 'Wine and ember, leaves on the wind.',
  isLight: false,
  opaqueSurface: '#5c0e3e',
  colors: {
    // The Fiery palette. Crimson violet is the ground and the surface — one
    // darkened for the page, one at full strength for the cards — so the
    // raise between them is the palette's own step rather than a grey.
    base: '#3a0927',
    surface: 'rgba(95, 15, 64, 0.92)',
    surfaceMuted: 'rgba(122, 26, 50, 0.7)',
    border: 'rgba(251, 139, 36, 0.24)',
    text: '#fff1e6',
    textMuted: 'rgba(245, 205, 190, 0.66)',
    accent: '#fb8b24',
    accentText: '#2a0619',
    // Deep crimson was already in the palette and already means this.
    danger: '#9a031e',
    // The palette's one cool note, warmed just enough to read as "good".
    success: '#3eae9b',
  },
  /**
   * Ink and paper, which is the other half of where this theme comes from: the
   * orange keeps its whole strength, and the crimson violet that was the page
   * becomes the writing on it.
   */
  light: {
    isLight: true,
    opaqueSurface: '#ffffff',
    colors: {
      base: '#fff6f0',
      surface: 'rgba(255, 255, 255, 0.95)',
      surfaceMuted: 'rgba(255, 226, 209, 0.75)',
      border: 'rgba(154, 3, 30, 0.2)',
      text: '#3a0927',
      textMuted: '#7a4450',
      accent: '#fb8b24',
      accentText: '#2a0619',
      danger: '#9a031e',
      success: '#0e6d5e',
    },
  },
  typography: {
    display: "'Outfit', system-ui, sans-serif",
    body: "'Outfit', system-ui, sans-serif",
    displayTracking: '0.06em',
    displayWeight: '600',
    displayTransform: 'uppercase',
  },
  motion: { fast: 130, medium: 260, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
  shape: {
    radius: '8px',
    radiusLarge: '14px',
    border: '1px',
    shadow: '0 16px 34px rgba(20, 2, 12, 0.6)',
  },
  Backdrop: ShinobiBackdrop,
};
