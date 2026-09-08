import { Eyes, Mouth } from './face';
import type { MascotMood } from './roster';

/** The head, reused as a clip so the headband sits on it instead of over it. */
const HEAD = { cx: 54, cy: 46, rx: 27, ry: 24 };

/**
 * Foxglove — an ink fox under the shinobi palette.
 *
 * Original geometry: a swept tail path, an ellipse head, two ear triangles and
 * a headband clipped to the skull with two trailing ties. Not anybody's
 * character, and the headband carries no crest or symbol of any kind — it is a
 * plain band of cloth. See NOTICE.md.
 */
export function Foxglove({ mood }: { mood: MascotMood }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="home-mascot-art">
      <defs>
        <clipPath id="foxglove-skull">
          <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
        </clipPath>
      </defs>

      <path
        d="M30 82 C6 76 6 46 26 42 C16 56 20 72 38 76 Z"
        fill="var(--color-accent)"
        opacity="0.85"
      />
      <path d="M26 42 C18 48 15 56 17 62 C13 54 16 46 26 42 Z" fill="var(--color-text)" opacity="0.55" />

      <ellipse cx="54" cy="76" rx="22" ry="16" fill="var(--color-accent)" />
      <ellipse cx="54" cy="81" rx="13" ry="10" fill="var(--color-text)" opacity="0.85" />

      <path d="M31 34 L31 8 L52 24 Z" fill="var(--color-accent)" />
      <path d="M77 34 L77 8 L56 24 Z" fill="var(--color-accent)" />
      <path d="M37 29 L37 17 L47 25 Z" fill="var(--color-base)" opacity="0.45" />
      <path d="M71 29 L71 17 L61 25 Z" fill="var(--color-base)" opacity="0.45" />

      {/* Cloth first, so it trails behind the head rather than across it. */}
      <g fill="var(--color-base)" stroke="var(--color-accent)" strokeWidth="1.1" strokeLinejoin="round">
        <path d="M72 29 L95 34 L93 39 L71 35 Z" />
        <path d="M72 33 L91 45 L88 49 L70 38 Z" />
      </g>

      <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} fill="var(--color-accent)" />
      <ellipse cx="54" cy="56" rx="15" ry="12" fill="var(--color-text)" opacity="0.9" />

      <g clipPath="url(#foxglove-skull)">
        <rect x="25" y="25" width="58" height="10" fill="var(--color-base)" />
        <rect x="25" y="33" width="58" height="1.6" fill="var(--color-accent)" opacity="0.55" />
      </g>

      <Eyes cx={54} cy={45} spread={11} r={5} mood={mood} />
      <path d="M50 52 L58 52 L54 56 Z" fill="var(--color-base)" />
      <Mouth cx={54} cy={59} w={15} mood={mood} />
    </svg>
  );
}
