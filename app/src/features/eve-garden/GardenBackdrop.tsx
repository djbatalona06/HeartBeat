import { sunAt } from '../../domain/scene/schedule';
import { plotsAt, type Garden } from '../../domain/rpg/plots';
import { GardenFlora } from './GardenFlora';

/**
 * Eve's Garden, behind the fight.
 *
 * ## What this replaced
 *
 * A rock wasteland. The stage was sixteen-pixel tiles on a flat ground and
 * nothing behind them, so a screen called a garden read as a quarry — and no
 * amount of work inside the tile grid was going to fix that, because the
 * problem was the eighty percent of the frame that had nothing in it.
 *
 * ## Why it is an SVG behind the canvas rather than more Phaser
 *
 * The canvas is already transparent so the theme backdrop can show through
 * (see `scene/game.ts`), which means there is a free layer *behind* the fight
 * and this is it. Drawing hills and trees as Phaser images would mean baking
 * five more textures per theme, re-baking them on every palette change, and
 * paying for it in WebGL memory on a phone — to draw things that never move and
 * never take a hit.
 *
 * As a DOM layer they cost nothing, repaint on a theme change for free because
 * every fill is a custom property, and the parallax is four CSS transforms.
 *
 * ## The five zones
 *
 * The garden has places in it rather than being one field: the habitat where
 * the companion idles, the plots where furniture stands, the fountain that is
 * the tether made visible, the gate back to the arch, and the alcove where the
 * chests are. This draws the *place*; the things standing in each are the
 * canvas's business and the page's.
 */

export interface GardenBackdropProps {
  /** Local hour, 0-23. */
  hour: number;
  dark: boolean;
  /**
   * The couple's aggregate mood, 0-1, where 0 is a hard week.
   *
   * It changes the weather and the warmth and **never the difficulty**. A low
   * reading brings soft rain and a cooler light, which is atmosphere; making a
   * bad week also a harder fight would be exactly the Habitica cron damage this
   * app's types were shaped to make impossible.
   */
  mood: number;
  /** How full the tether is, 0-1. The fountain fills with it. */
  resonance: number;
  /** What is growing in the plots. */
  garden: Garden;
  /** The shared pet's level, which is what decides how much ground there is. */
  petLevel: number;
  /**
   * How the drawing meets a box that is not its shape.
   *
   * The garden is authored at 400×240 — a landscape stage, because that is
   * what it was: a band behind a fight. `'cover'` fills the box and crops
   * whatever does not fit, which is right when the box is roughly that shape.
   *
   * A phone is not that shape. At 390×844 covering means scaling three and a
   * half times and showing the middle eighth: no hills, no tree line, no sun,
   * a fountain the size of a building. The screenshot is unambiguous and no
   * test would ever have caught it.
   *
   * So `'ground'` fits the whole drawing and sits it on the floor of the box,
   * the way a landscape hangs on a wall rather than being stretched over it.
   * The sky above is whatever is behind — and the garden's own sky starts at
   * an opaque `--color-base`, so a page painted in the same colour joins it
   * without a seam.
   */
  fit?: 'cover' | 'ground';
}

export function GardenBackdrop({
  hour, dark, mood, resonance, garden, petLevel, fit = 'cover',
}: GardenBackdropProps) {
  const sun = sunAt(hour);
  const night = dark || sun.night;
  const warm = Math.min(1, Math.max(0, mood));
  const glow = Math.min(1, Math.max(0, resonance));
  const raining = warm < 0.4;

  return (
    <svg
      className="garden-backdrop"
      viewBox="0 0 400 240"
      preserveAspectRatio={fit === 'ground' ? 'xMidYMax meet' : 'xMidYMid slice'}
      aria-hidden="true"
      data-weather={raining ? 'rain' : 'clear'}
    >
      <defs>
        <linearGradient id="garden-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-base)" />
          <stop
            offset="100%"
            stopColor="var(--color-accent)"
            stopOpacity={night ? 0.12 : 0.1 + warm * 0.3}
          />
        </linearGradient>
        <radialGradient id="garden-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={night ? 0.4 : 0.85} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="garden-fountain" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25 + glow * 0.6} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* -- sky and hills, furthest back and slowest ------------------------ */}
      <g className="garden-layer garden-layer-sky">
        <rect x="0" y="0" width="400" height="240" fill="url(#garden-sky)" />
        <circle cx={sun.x} cy={sun.y * 0.7} r="44" fill="url(#garden-sun)" />
        {night && (
          <g fill="var(--color-text)" opacity="0.5">
            <circle cx="52" cy="34" r="1.4" /><circle cx="118" cy="20" r="1.1" />
            <circle cx="186" cy="42" r="1.5" /><circle cx="248" cy="18" r="1.2" />
            <circle cx="316" cy="38" r="1.3" /><circle cx="364" cy="26" r="1.1" />
          </g>
        )}
        <path
          d="M0 118 Q58 82 120 112 Q186 144 252 106 Q318 70 400 108 L400 240 L0 240 Z"
          fill="var(--color-surface-muted)"
          opacity="0.4"
        />
      </g>

      {/* -- the tree line and the pond, midground --------------------------- */}
      <g className="garden-layer garden-layer-mid">
        <path
          d="M0 146 Q64 118 132 142 Q200 166 268 140 Q334 116 400 140 L400 240 L0 240 Z"
          fill="var(--color-surface-muted)"
          opacity="0.72"
        />
        {[26, 74, 148, 226, 296, 372].map((x, i) => (
          <g key={x} opacity={0.8 - (i % 3) * 0.08}>
            <path
              d={`M${x - 2} 152 L${x - 3} 124 L${x + 3} 124 L${x + 2} 152 Z`}
              fill="var(--color-text-muted)"
            />
            <ellipse cx={x} cy={112} rx={18 - (i % 3) * 3} ry={14} fill="var(--color-surface)" />
            <ellipse
              cx={x} cy={108} rx={18 - (i % 3) * 3} ry={13}
              fill="var(--color-accent)" opacity={night ? 0.05 : 0.12}
            />
          </g>
        ))}

        {/* The pond. Two ellipses and a highlight, which is all a still pond is. */}
        <ellipse cx="318" cy="182" rx="62" ry="20" fill="var(--color-accent)" opacity="0.18" />
        <ellipse cx="318" cy="180" rx="54" ry="15" fill="var(--color-base)" opacity="0.5" />
        <path
          d="M286 176 Q302 172 318 176 M300 186 Q314 182 330 186"
          stroke="var(--color-accent)" strokeWidth="1.5" fill="none" opacity="0.5"
        />
      </g>

      {/* -- the fountain: the tether, made a thing you can stand next to ---- */}
      <g className="garden-layer garden-layer-near">
        <circle cx="200" cy="196" r="46" fill="url(#garden-fountain)" />
        <ellipse cx="200" cy="200" rx="26" ry="9" fill="var(--color-surface)" opacity="0.9" />
        <ellipse cx="200" cy="198" rx="19" ry="6" fill="var(--color-accent)" opacity={0.3 + glow * 0.5} />
        <path
          d="M200 198 L200 176"
          stroke="var(--color-accent)"
          strokeWidth={2 + glow * 3}
          strokeLinecap="round"
          opacity={0.4 + glow * 0.5}
        />

        {/* The thread between the two sides of the garden. It is the couple. */}
        <path
          className="garden-tether"
          d="M-10 214 Q96 196 200 202 Q304 208 410 190"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.5 + glow * 2.5}
          strokeLinecap="round"
          opacity={0.25 + glow * 0.45}
        />

        {/* The plots, and whatever is standing in them. Drawn in the near
            layer so they sit in front of the tree line and move with it. */}
        <GardenFlora garden={garden} plots={plotsAt(petLevel)} />

        {/* Flowers in the near field. Warm weeks open them; a hard week does
            not close them, it only cools the light — see the note on `mood`. */}
        {[18, 58, 96, 260, 342, 384].map((x, i) => (
          <g key={x} transform={`translate(${x} ${218 + (i % 3) * 6})`}>
            <path d="M0 0 L0 -10" stroke="var(--color-text-muted)" strokeWidth="1.5" />
            <circle cx="0" cy="-12" r={2.5 + warm} fill="var(--color-accent)" opacity={0.5 + warm * 0.4} />
          </g>
        ))}
      </g>

      {/* -- weather, in front of everything and never in the way ------------ */}
      {raining && (
        <g className="garden-rain" opacity={0.28}>
          {Array.from({ length: 22 }, (_, i) => {
            const x = (i * 37) % 400;
            return (
              <path
                key={i}
                d={`M${x} ${(i * 53) % 220} l-3 10`}
                stroke="var(--color-accent)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}
