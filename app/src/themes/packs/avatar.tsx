import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/** Four slow currents, one per element, braided across the page. */
function AvatarBackdrop({ calm }: { calm: boolean }) {
  const hues = ['rgba(110, 190, 235, 0.20)', 'rgba(240, 160, 70, 0.16)',
                'rgba(140, 210, 150, 0.16)', 'rgba(190, 160, 235, 0.14)'];

  return Backdrop({
    still: calm,
    fps: 20,
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2;
      hues.forEach((hue, i) => {
        ctx.beginPath();
        ctx.strokeStyle = hue;
        for (let x = 0; x <= w; x += 8) {
          const y =
            h * (0.2 + i * 0.2) +
            Math.sin(x / 180 + t * 0.28 + i * 1.4) * 46 +
            Math.sin(x / 70 - t * 0.16 + i) * 14;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    },
  });
}

export const avatarTheme: Theme = {
  id: 'avatar',
  name: 'The Last Airbender',
  blurb: 'Four elements, four slow currents.',
  isLight: false,
  opaqueSurface: '#1b2733',
  colors: {
    base: '#111a24',
    surface: 'rgba(27, 39, 51, 0.92)',
    surfaceMuted: 'rgba(38, 54, 70, 0.7)',
    border: 'rgba(110, 190, 235, 0.2)',
    text: '#eef6fb',
    textMuted: 'rgba(190, 212, 228, 0.64)',
    accent: '#6ebeeb',
    accentText: '#111a24',
    danger: '#ef7b6b',
    success: '#7fd6a0',
  },
  typography: {
    display: "'Outfit', system-ui, sans-serif",
    body: "'Outfit', system-ui, sans-serif",
    displayTracking: '0.03em',
    displayWeight: '400',
    displayTransform: 'none',
  },
  motion: { fast: 180, medium: 380, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  shape: {
    radius: '12px',
    radiusLarge: '20px',
    border: '1px',
    shadow: '0 18px 38px rgba(4, 10, 16, 0.55)',
  },
  Backdrop: AvatarBackdrop,
};
