import { sunAt } from '../../../domain/scene/schedule';

/**
 * The threshold: two trees, the light between them, and the tether.
 *
 * One inline SVG, drawn from the theme's own tokens, and the only reason it is
 * a component rather than a background image is that every line of it has to
 * change colour when the theme does. It is deliberately *not* a Phaser scene:
 * the gate is a menu, and standing up a WebGL context to draw two trees behind
 * five buttons would cost a phone real resources for a screen nobody fights on.
 *
 * Three layers, back to front, and they drift at three speeds — see
 * `.gate-scene` in styles.css. That parallax is the whole of what makes a flat
 * drawing read as somewhere you are standing.
 */

export interface GateBackdropProps {
  /** Local hour, 0-23. Decides where the light is and how warm it is. */
  hour: number;
  /** True when the garden is wearing its dark face. */
  dark: boolean;
  /** How full the tether is, 0-1. Drawn as the glow along the thread. */
  resonance: number;
}

export function GateBackdrop({ hour, dark, resonance }: GateBackdropProps) {
  const sun = sunAt(hour);
  const night = dark || sun.night;
  const glow = Math.min(1, Math.max(0, resonance));

  return (
    <svg
      className="gate-backdrop"
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="gate-sky" cx="50%" cy="72%" r="78%">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={night ? 0.18 : 0.32} />
          <stop offset="100%" stopColor="var(--color-base)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gate-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={night ? 0.5 : 0.9} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gate-tether" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.15" />
          <stop offset="50%" stopColor="var(--color-accent)" stopOpacity={0.3 + glow * 0.6} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* -- far: sky, sun, hills ------------------------------------------- */}
      <g className="gate-layer gate-layer-far">
        <rect x="0" y="0" width="400" height="260" fill="url(#gate-sky)" />
        <circle cx={sun.x} cy={sun.y} r="52" fill="url(#gate-sun)" />
        <circle
          cx={sun.x}
          cy={sun.y}
          r={night ? 9 : 14}
          fill="var(--color-accent)"
          opacity={night ? 0.7 : 0.9}
        />
        <path
          d="M0 196 Q70 158 140 192 Q210 224 288 186 Q346 158 400 190 L400 260 L0 260 Z"
          fill="var(--color-surface-muted)"
          opacity="0.55"
        />
      </g>

      {/* -- middle: the two trees ------------------------------------------ */}
      <g className="gate-layer gate-layer-mid">
        <GateTree x={62} scale={1} />
        <GateTree x={338} scale={0.94} flip />
        {/* The light coming through the leaves. Three shafts, because two reads
            as a mistake and four reads as a pattern. */}
        <g opacity={night ? 0.1 : 0.22}>
          <path d="M126 46 L156 236 L132 236 Z" fill="var(--color-accent)" />
          <path d="M196 34 L212 236 L188 236 Z" fill="var(--color-accent)" />
          <path d="M272 48 L268 236 L292 236 Z" fill="var(--color-accent)" />
        </g>
      </g>

      {/* -- near: the ground, and the tether running along it --------------- */}
      <g className="gate-layer gate-layer-near">
        <path
          d="M0 226 Q100 210 200 216 Q300 222 400 208 L400 260 L0 260 Z"
          fill="var(--color-surface)"
          opacity="0.9"
        />
        {/* What the trees actually throw. Two soft pools, leaning away from
            wherever the sun is — which is why they are computed from `sun.x`
            rather than drawn once and left. A tree with no shadow reads as a
            sticker on the sky. */}
        <g opacity={night ? 0.12 : 0.2}>
          <ellipse
            cx={62 + (200 - sun.x) * 0.16} cy="240"
            rx={54} ry={11}
            fill="var(--color-base)"
          />
          <ellipse
            cx={338 + (200 - sun.x) * 0.16} cy="234"
            rx={50} ry={10}
            fill="var(--color-base)"
          />
        </g>
        <path
          className="gate-tether"
          d="M-10 238 Q100 220 200 232 Q300 244 410 224"
          fill="none"
          stroke="url(#gate-tether)"
          strokeWidth={3 + glow * 3}
          strokeLinecap="round"
        />
        {/* Grass: six tufts, hand-placed rather than repeated on a grid, so the
            near layer does not read as wallpaper. */}
        <path
          d="M28 240 l4 -12 M34 242 l-2 -14 M148 234 l3 -11 M154 236 l-2 -13
             M262 240 l4 -12 M354 232 l-3 -12"
          stroke="var(--color-text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
      </g>
    </svg>
  );
}

/** One tree: a trunk that leans, two boughs, and three masses of leaf. */
function GateTree({ x, scale = 1, flip = false }: { x: number; scale?: number; flip?: boolean }) {
  const mirror = `translate(${x} 236) scale(${flip ? -scale : scale} ${scale}) translate(${-x} -236)`;
  return (
    <g transform={mirror}>
      <path
        d={`M${x - 9} 236 Q${x - 4} 170 ${x - 14} 120 L${x + 8} 118 Q${x + 4} 172 ${x + 11} 236 Z`}
        fill="var(--color-text-muted)"
        opacity="0.85"
      />
      <path
        d={`M${x - 6} 158 Q${x - 34} 146 ${x - 48} 120 M${x + 4} 146 Q${x + 30} 138 ${x + 44} 116`}
        stroke="var(--color-text-muted)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
      <ellipse cx={x - 34} cy={100} rx="46" ry="34" fill="var(--color-surface-muted)" />
      <ellipse cx={x + 30} cy={90} rx="42" ry="32" fill="var(--color-surface-muted)" />
      <ellipse cx={x - 2} cy={62} rx="52" ry="38" fill="var(--color-surface-muted)" />
      {/* A rim of light on the canopy, which is what stops three flat ellipses
          reading as three flat ellipses. */}
      <ellipse cx={x - 2} cy={58} rx="52" ry="38" fill="var(--color-accent)" opacity="0.12" />
    </g>
  );
}
