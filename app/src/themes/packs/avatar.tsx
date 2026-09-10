import { Backdrop } from '../backdrop';
import type { Theme } from '../types';

/**
 * Four slow currents braided across the page.
 *
 * Under the Deep Sea palette these stop being one current per element and
 * become one per depth: ink at the bottom of the frame, cerulean through the
 * middle, fresh sky near the top, and a thin white line of surface light. The
 * order is deliberate — drawn top-band to bottom-band, so the pale ones sit
 * where light would actually reach.
 */
const CURRENTS = [
  'rgba(255, 255, 255, 0.14)',
  'rgba(0, 168, 232, 0.20)',
  'rgba(0, 126, 167, 0.20)',
  'rgba(0, 52, 89, 0.28)',
];

function AvatarBackdrop({ calm }: { calm: boolean }) {
  return Backdrop({
    still: calm,
    fps: 20,
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2;
      CURRENTS.forEach((hue, i) => {
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
  blurb: 'Ink black water, four slow currents.',
  isLight: false,
  opaqueSurface: '#003254',
  colors: {
    // Deep Sea, taken in its own order: ink black at the bottom, deep space
    // blue for anything raised off it, and the two brighter blues kept back
    // for the things that are meant to be looked at.
    base: '#00171f',
    surface: 'rgba(0, 52, 89, 0.92)',
    surfaceMuted: 'rgba(0, 70, 116, 0.7)',
    border: 'rgba(0, 168, 232, 0.24)',
    text: '#ffffff',
    textMuted: 'rgba(186, 222, 238, 0.68)',
    accent: '#00a8e8',
    accentText: '#00171f',
    danger: '#ef6461',
    success: '#4fd1a5',
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
    shadow: '0 18px 38px rgba(0, 8, 12, 0.6)',
  },
  Backdrop: AvatarBackdrop,
};
