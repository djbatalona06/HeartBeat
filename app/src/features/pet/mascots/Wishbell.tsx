import { Blush, Eyes, Mouth } from './face';
import type { MascotMood } from './roster';

/** A five-pointed star, computed rather than traced. */
function starPath(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join(' L')} Z`;
}

/** The soft ink line round her head, ears and horn. The shapes are all the
 *  same lilac, so without it the ears and the horn melt into the head. */
const OUTLINE = {
  stroke: 'var(--color-text)',
  strokeOpacity: 0.4,
  strokeWidth: 1.6,
  strokeLinejoin: 'round',
} as const;

/**
 * Wishbell — a lilac unicorn under the pony palette.
 *
 * Original geometry, redrawn: an outlined ellipse head, a pearly horn with a
 * spiral on it, two ears with the inside showing, a two-colour mane that falls
 * on *both* sides and sweeps a forelock over the brow, and a little bell caught
 * in the mane with her star on it — the bell she rings for Bell Ward. The star
 * used to sit on her cheek on top of the blush; it lives on the bell now.
 * Not anybody's character; see NOTICE.md and `mascots/roster.ts`.
 */
export function Wishbell({ mood }: { mood: MascotMood }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="home-mascot-art">
      <path d={starPath(14, 20, 4.5)} fill="var(--color-text)" opacity="0.3" />
      <path d={starPath(88, 16, 3.5)} fill="var(--color-text)" opacity="0.25" />

      {/* The mane, behind the head, falling on both sides. */}
      <path d="M30 38 C14 46 12 68 20 88 C22 80 25 72 30 67 C26 60 27 48 36 42 Z" fill="var(--color-danger)" opacity="0.9" />
      <path d="M33 44 C22 52 22 68 26 80 C28 72 31 66 35 62 Z" fill="var(--color-success)" opacity="0.8" />
      <path d="M70 38 C86 46 88 66 82 84 C80 76 76 70 71 66 C75 58 74 48 64 42 Z" fill="var(--color-success)" opacity="0.8" />
      <path d="M67 44 C78 52 78 66 75 76 C73 70 70 65 66 62 Z" fill="var(--color-danger)" opacity="0.85" />

      <path d="M32 40 L27 16 L45 31 Z" fill="var(--color-accent)" {...OUTLINE} />
      <path d="M32.5 34 L30 21 L40 30 Z" fill="var(--color-danger)" opacity="0.6" />
      <path d="M68 40 L73 16 L55 31 Z" fill="var(--color-accent)" {...OUTLINE} />
      <path d="M67.5 34 L70 21 L60 30 Z" fill="var(--color-danger)" opacity="0.6" />

      <ellipse cx="50" cy="56" rx="25" ry="23" fill="var(--color-accent)" {...OUTLINE} />
      <ellipse cx="50" cy="68" rx="14.5" ry="9.5" fill="var(--color-text)" opacity="0.14" />

      {/* The horn, outlined harder than the head so it reads against any sky. */}
      <path d="M44.5 33 L50 5 L55.5 33 Z" fill="var(--color-accent)" {...OUTLINE} strokeOpacity={0.65} />
      <g stroke="var(--color-text)" strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round">
        <path d="M45.8 27 L54.6 23.5" />
        <path d="M47.1 20 L53.6 17" />
        <path d="M48.4 13 L52.2 11.3" />
      </g>

      {/* A forelock in both colours, so the mane reads as hair and not a scarf. */}
      <path d="M34 42 C38 31 52 27 62 33 C54 32 46 35 41 45 C39 43 36 42 34 42 Z" fill="var(--color-danger)" opacity="0.92" />
      <path d="M48 33 C56 29 64 32 67 39 C61 35 55 35 50 38 Z" fill="var(--color-success)" opacity="0.85" />

      {/* The bell in her mane, with her star on it. */}
      <path d="M18.5 71 C18.5 64 21.5 60.5 25 60.5 C28.5 60.5 31.5 64 31.5 71 L33 73 L17 73 Z" fill="var(--color-text)" opacity="0.85" />
      <circle cx="25" cy="75" r="1.8" fill="var(--color-text)" opacity="0.85" />
      <path d={starPath(25, 67.5, 3.2)} fill="var(--color-accent)" />

      <Blush cx={50} cy={63} spread={17} r={5.5} />
      <Eyes cx={50} cy={54} spread={11} r={5.5} mood={mood} />
      <g fill="var(--color-base)" opacity="0.5">
        <ellipse cx="45.5" cy="68" rx="1.8" ry="2.3" />
        <ellipse cx="54.5" cy="68" rx="1.8" ry="2.3" />
      </g>
      <Mouth cx={50} cy={73} w={13} mood={mood} />
    </svg>
  );
}
