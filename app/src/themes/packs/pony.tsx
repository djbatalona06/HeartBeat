import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/** A slow pastel aurora, plus a few drifting sparkles. */
function PonyBackdrop({ calm }: { calm: boolean }) {
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
      const g = ctx.createLinearGradient(0, 0, w, h);
      const shift = (Math.sin(t * 0.12) + 1) / 2;
      g.addColorStop(0, `rgba(190, 150, 240, ${0.1 + shift * 0.06})`);
      g.addColorStop(0.5, `rgba(255, 160, 205, ${0.08 + shift * 0.05})`);
      g.addColorStop(1, `rgba(150, 205, 245, ${0.1 - shift * 0.04})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const s of sparkles) {
        const a = 0.14 + Math.sin(t * 1.4 + s.phase) * 0.12;
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff0fb';
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
  blurb: 'Pastel aurora and a scatter of sparkles.',
  isLight: false,
  opaqueSurface: '#2b2145',
  colors: {
    base: '#1e1733',
    surface: 'rgba(43, 33, 69, 0.92)',
    surfaceMuted: 'rgba(58, 45, 90, 0.7)',
    border: 'rgba(214, 170, 245, 0.22)',
    text: '#f8f1ff',
    textMuted: 'rgba(214, 198, 238, 0.66)',
    accent: '#d6aaf5',
    accentText: '#1e1733',
    danger: '#ff7d9c',
    success: '#87e0b8',
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
    shadow: '0 18px 40px rgba(8, 5, 18, 0.55)',
  },
  Backdrop: PonyBackdrop,
};
