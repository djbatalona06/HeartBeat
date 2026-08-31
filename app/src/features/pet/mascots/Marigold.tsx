import { Blush, Eyes, Mouth } from './face';
import type { MascotMood } from './roster';

/** Where the pores go. Fixed, so the sponge is the same sponge every render. */
const PORES = [
  { cx: 28, cy: 26, r: 4 },
  { cx: 71, cy: 30, r: 5.5 },
  { cx: 24, cy: 58, r: 5 },
  { cx: 76, cy: 62, r: 4 },
  { cx: 34, cy: 74, r: 3.5 },
  { cx: 62, cy: 76, r: 4.5 },
];

/** Bubbles let go on the way up. */
const BUBBLES = [
  { cx: 20, cy: 12, r: 3.5 },
  { cx: 82, cy: 9, r: 4.5 },
  { cx: 71, cy: 4, r: 2.5 },
];

/**
 * Marigold — a yellow sea sponge under the sponge palette.
 *
 * Original geometry: one rounded rectangle, six pore circles, two stub legs
 * and three bubbles. Not anybody's character; see NOTICE.md.
 */
export function Marigold({ mood }: { mood: MascotMood }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="home-mascot-art">
      <g fill="var(--color-text)" opacity="0.3">
        {BUBBLES.map((b) => (
          <circle key={`${b.cx}-${b.cy}`} cx={b.cx} cy={b.cy} r={b.r} />
        ))}
      </g>

      <g stroke="var(--color-accent)" strokeWidth="6" strokeLinecap="round">
        <path d="M38 80 L36 94" />
        <path d="M62 80 L64 94" />
      </g>

      <rect x="17" y="16" width="66" height="68" rx="17" fill="var(--color-accent)" />

      <g fill="var(--color-base)" opacity="0.16">
        {PORES.map((p) => (
          <circle key={`${p.cx}-${p.cy}`} cx={p.cx} cy={p.cy} r={p.r} />
        ))}
      </g>

      {mood === 'sulking' ? null : <Blush cx={50} cy={58} spread={22} r={6.5} />}
      <Eyes cx={50} cy={44} spread={13} r={6} mood={mood} />
      <Mouth cx={50} cy={62} w={24} mood={mood} />
    </svg>
  );
}
