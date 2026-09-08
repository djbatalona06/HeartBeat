import { Eyes, Mouth } from './face';
import type { MascotMood } from './roster';

/** Weather, drawn as three overlapping circles. */
const PUFFS = [
  { cx: 12, cy: 22, r: 10 },
  { cx: 92, cy: 62, r: 8 },
  { cx: 20, cy: 92, r: 7 },
];

/**
 * Cirrus — a cloud serpent under the airbender palette.
 *
 * Original geometry: a stroked S-curve body, an ellipse head, two fin
 * triangles and a spiral on the brow. The spiral is a spiral: no marking of
 * anyone's is copied. See NOTICE.md.
 */
export function Cirrus({ mood }: { mood: MascotMood }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="home-mascot-art">
      <g fill="var(--color-text)" opacity="0.16">
        {PUFFS.map((p) => (
          <circle key={`${p.cx}-${p.cy}`} cx={p.cx} cy={p.cy} r={p.r} />
        ))}
      </g>

      <path
        d="M50 58 C76 60 80 84 56 90 C38 94 28 82 33 72"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="13"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M50 58 C76 60 80 84 56 90"
        fill="none"
        stroke="var(--color-text)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.28"
      />

      <path d="M28 32 L10 22 L16 40 Z" fill="var(--color-accent)" opacity="0.8" />
      <path d="M72 32 L90 22 L84 40 Z" fill="var(--color-accent)" opacity="0.8" />

      <ellipse cx="50" cy="40" rx="25" ry="22" fill="var(--color-accent)" />

      <path
        d="M50 26 c6 -1 8 5 3.5 7 c-3.5 1.6 -6 -2 -3 -3.4"
        fill="none"
        stroke="var(--color-text)"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.85"
      />

      <Eyes cx={50} cy={41} spread={11} r={5} mood={mood} />
      <Mouth cx={50} cy={52} w={16} mood={mood} />
    </svg>
  );
}
