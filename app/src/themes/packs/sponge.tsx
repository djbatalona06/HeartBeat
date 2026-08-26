import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/** Bubbles rising through sunlit water. */
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
        ctx.strokeStyle = 'rgba(180, 235, 255, 0.3)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x - b.r * 0.3, y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fill();
      }
    },
  });
}

export const spongeTheme: Theme = {
  id: 'sponge',
  name: 'SpongeBob',
  blurb: 'Sunlit water, bubbles, a very yellow accent.',
  isLight: false,
  opaqueSurface: '#0d3a52',
  colors: {
    base: '#062a3d',
    surface: 'rgba(13, 58, 82, 0.92)',
    surfaceMuted: 'rgba(20, 76, 105, 0.7)',
    border: 'rgba(150, 220, 245, 0.2)',
    text: '#f2fbff',
    textMuted: 'rgba(196, 232, 246, 0.66)',
    accent: '#f7d94c',
    accentText: '#062a3d',
    danger: '#ff7a6b',
    success: '#5fe3a1',
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
    shadow: '0 16px 36px rgba(2, 16, 24, 0.5)',
  },
  Backdrop: SpongeBackdrop,
};
