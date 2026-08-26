import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/** Bows drifting upward like petals. Drawn from two arcs and a knot. */
function KittyBackdrop({ calm }: { calm: boolean }) {
  const bows = Array.from({ length: 22 }, (_, i) => ({
    x: (i * 97) % 100 / 100,
    phase: (i * 1.7) % 6.28,
    speed: 0.02 + ((i * 13) % 7) / 260,
    size: 7 + ((i * 5) % 9),
  }));

  return Backdrop({
    still: calm,
    fps: 24,
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      for (const b of bows) {
        const y = h - (((t * b.speed * h) + b.phase * 140) % (h + 90)) + 45;
        const x = b.x * w + Math.sin(t * 0.5 + b.phase) * 22;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t * 0.35 + b.phase) * 0.4);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#ff8fb0';
        ctx.beginPath();
        ctx.ellipse(-b.size * 0.7, 0, b.size * 0.7, b.size * 0.5, -0.4, 0, Math.PI * 2);
        ctx.ellipse(b.size * 0.7, 0, b.size * 0.7, b.size * 0.5, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, b.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#d81f45';
        ctx.fill();
        ctx.restore();
      }
    },
  });
}

export const kittyTheme: Theme = {
  id: 'kitty',
  name: 'Hello Kitty',
  blurb: 'Ribbon pink, cream paper, a red bow.',
  isLight: false,
  opaqueSurface: '#3a1626',
  colors: {
    base: '#2a0f1c',
    surface: 'rgba(58, 22, 38, 0.92)',
    surfaceMuted: 'rgba(72, 30, 48, 0.7)',
    border: 'rgba(255, 143, 176, 0.22)',
    text: '#fff3f7',
    textMuted: 'rgba(255, 214, 228, 0.66)',
    accent: '#ff8fb0',
    accentText: '#2a0f1c',
    danger: '#ff6b6b',
    success: '#6ee7a8',
  },
  typography: {
    display: "'Outfit', system-ui, sans-serif",
    body: "'Outfit', system-ui, sans-serif",
    displayTracking: '-0.02em',
    displayWeight: '300',
    displayTransform: 'none',
  },
  motion: { fast: 160, medium: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  shape: {
    radius: '14px',
    radiusLarge: '22px',
    border: '1px',
    shadow: '0 18px 40px rgba(10, 3, 7, 0.5)',
  },
  Backdrop: KittyBackdrop,
};
