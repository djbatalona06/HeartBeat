import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/**
 * Bubbles rising through lamplit water.
 *
 * Recoloured from the original sunlit blue to the Black & Gold palette: the
 * water is Prussian blue now rather than daylight, so a bubble reads as a
 * gold rim catching a light above it. The geometry is unchanged — only the
 * three colours are, which is the whole point of keeping the drawing and the
 * palette in separate layers.
 */
function SpongeBackdrop({ calm }: { calm: boolean }) {
  const bubbles = Array.from({ length: 30 }, (_, i) => ({
    x: ((i * 61) % 100) / 100,
    phase: (i * 2.3) % 6.28,
    speed: 0.03 + ((i * 7) % 9) / 300,
    r: 3 + ((i * 11) % 13),
  }));

  return Backdrop({
    still: calm,
    fps: 24,
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      for (const b of bubbles) {
        const y = h - (((t * b.speed * h) + b.phase * 160) % (h + 120)) + 60;
        const x = b.x * w + Math.sin(t * 0.8 + b.phase) * 16;
        ctx.beginPath();
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(252, 163, 17, 0.26)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // The catchlight stays white rather than gold: it is the light itself,
        // not the thing the light is landing on.
        ctx.beginPath();
        ctx.arc(x - b.r * 0.3, y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.fill();
      }
    },
  });
}

export const spongeTheme: Theme = {
  id: 'sponge',
  name: 'SpongeBob',
  blurb: 'Gold on deep navy, bubbles rising.',
  isLight: false,
  opaqueSurface: '#121e38',
  colors: {
    // Black & Gold Elegance, mapped whole: black is the page, Prussian blue
    // the raised surface, gold the one thing that asks to be pressed.
    base: '#000000',
    surface: 'rgba(20, 33, 61, 0.92)',
    surfaceMuted: 'rgba(30, 46, 82, 0.7)',
    border: 'rgba(252, 163, 17, 0.22)',
    text: '#ffffff',
    textMuted: 'rgba(229, 229, 229, 0.62)',
    accent: '#fca311',
    accentText: '#000000',
    danger: '#e5484d',
    success: '#3fbf7f',
  },
  typography: {
    display: "'Outfit', system-ui, sans-serif",
    body: "'Outfit', system-ui, sans-serif",
    displayTracking: '0.01em',
    displayWeight: '600',
    displayTransform: 'none',
  },
  motion: { fast: 140, medium: 280, easing: 'cubic-bezier(0.34, 1.4, 0.5, 1)' },
  shape: {
    radius: '16px',
    radiusLarge: '26px',
    border: '1px',
    shadow: '0 16px 36px rgba(0, 0, 0, 0.6)',
  },
  Backdrop: SpongeBackdrop,
};
