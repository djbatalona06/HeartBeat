import { Backdrop } from '../backdrop';
import { pointer } from '../pointer';
import type { Theme } from '../types';

/**
 * Bows drifting upward like petals, linked into a constellation.
 *
 * The drift is the original: deterministic, derived from `t`, no stored
 * velocities. The linking and the pointer repulsion are borrowed from the Yawn
 * landing page's particle field, but kept stateless the same way — repulsion is
 * a displacement computed fresh each frame from where the finger is, so a bow
 * springs back on its own when the finger leaves and there is no physics to
 * drift out of sync.
 */

/** Beyond this, two bows are not related enough to draw a line between. */
const LINK_DISTANCE = 118;

/** How close a finger has to be to push a bow aside. */
const PUSH_RADIUS = 130;
const PUSH_STRENGTH = 34;

const BOWS = Array.from({ length: 22 }, (_, i) => ({
  x: ((i * 97) % 100) / 100,
  phase: (i * 1.7) % 6.28,
  speed: 0.02 + ((i * 13) % 7) / 260,
  size: 7 + ((i * 5) % 9),
}));

/**
 * The bows twice.
 *
 * On the dark ground a pale pink at 16% reads as a bow catching light. On white
 * the same pink at the same alpha is not a subtle bow, it is nothing at all —
 * so the light set trades the tint for the theme's deeper rose and roughly
 * doubles the alpha. The geometry below never learns which set it is using.
 */
const KITTY_INK = {
  dark: { bow: '#ff8fb0', knot: '#d81f45', link: '#ff8fb0', bowAlpha: 0.16, linkAlpha: 0.1 },
  light: { bow: '#e8517c', knot: '#a8123a', link: '#d8608a', bowAlpha: 0.3, linkAlpha: 0.16 },
};

function KittyBackdrop({ calm, light }: { calm: boolean; light: boolean }) {
  const ink = light ? KITTY_INK.light : KITTY_INK.dark;
  return Backdrop({
    still: calm,
    fps: 24,
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);

      // Positions first, so the links can be drawn under the bows themselves.
      const at: Array<{ x: number; y: number; size: number; phase: number }> = [];
      for (const b of BOWS) {
        let y = h - (((t * b.speed * h) + b.phase * 140) % (h + 90)) + 45;
        let x = b.x * w + Math.sin(t * 0.5 + b.phase) * 22;

        // Calm mode keeps the constellation but not the chasing.
        if (!calm && pointer.active) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.001 && dist < PUSH_RADIUS) {
            const push = (1 - dist / PUSH_RADIUS) * PUSH_STRENGTH;
            x += (dx / dist) * push;
            y += (dy / dist) * push;
          }
        }
        at.push({ x, y, size: b.size, phase: b.phase });
      }

      ctx.strokeStyle = ink.link;
      ctx.lineWidth = 1;
      for (let i = 0; i < at.length; i += 1) {
        for (let j = i + 1; j < at.length; j += 1) {
          const dist = Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y);
          if (dist >= LINK_DISTANCE) continue;
          // Fading with distance is what stops this reading as a wireframe.
          ctx.globalAlpha = (1 - dist / LINK_DISTANCE) * ink.linkAlpha;
          ctx.beginPath();
          ctx.moveTo(at[i].x, at[i].y);
          ctx.lineTo(at[j].x, at[j].y);
          ctx.stroke();
        }
      }

      for (const b of at) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.sin(t * 0.35 + b.phase) * 0.4);
        ctx.globalAlpha = ink.bowAlpha;
        ctx.fillStyle = ink.bow;
        ctx.beginPath();
        ctx.ellipse(-b.size * 0.7, 0, b.size * 0.7, b.size * 0.5, -0.4, 0, Math.PI * 2);
        ctx.ellipse(b.size * 0.7, 0, b.size * 0.7, b.size * 0.5, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, b.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = ink.knot;
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
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
  /**
   * Kitty on white, which is what she has always actually been — the mascot's
   * own instruction was white highlights, and the dark ground was this app's
   * idea rather than hers. The pink is untouched; only what sits behind it
   * moved.
   */
  light: {
    isLight: true,
    opaqueSurface: '#ffffff',
    colors: {
      base: '#fff5f8',
      surface: 'rgba(255, 255, 255, 0.94)',
      surfaceMuted: 'rgba(255, 226, 236, 0.75)',
      border: 'rgba(197, 46, 101, 0.2)',
      text: '#3a1020',
      textMuted: '#79415a',
      accent: '#ff8fb0',
      accentText: '#2a0f1c',
      danger: '#c01f2e',
      success: '#0d7a49',
    },
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
