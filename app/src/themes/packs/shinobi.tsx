import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/** Leaves on a spiral draft, the way paper falls in a courtyard. */
function ShinobiBackdrop({ calm }: { calm: boolean }) {
  const leaves = Array.from({ length: 26 }, (_, i) => ({
    x: ((i * 73) % 100) / 100,
    phase: (i * 1.31) % 6.28,
    speed: 0.05 + ((i * 3) % 8) / 200,
    size: 5 + ((i * 7) % 8),
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
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#f0803c';
        ctx.beginPath();
        ctx.ellipse(0, 0, l.size, l.size * 0.44, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
  });
}

export const shinobiTheme: Theme = {
  id: 'shinobi',
  name: 'Naruto',
  blurb: 'Ink and ember, leaves on the wind.',
  isLight: false,
  opaqueSurface: '#241a16',
  colors: {
    base: '#17110e',
    surface: 'rgba(36, 26, 22, 0.92)',
    surfaceMuted: 'rgba(52, 38, 31, 0.7)',
    border: 'rgba(240, 128, 60, 0.22)',
    text: '#fdf3ec',
    textMuted: 'rgba(232, 208, 190, 0.64)',
    accent: '#f0803c',
    accentText: '#17110e',
    danger: '#e35d5d',
    success: '#77d99a',
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
    shadow: '0 16px 34px rgba(0, 0, 0, 0.55)',
  },
  Backdrop: ShinobiBackdrop,
};
