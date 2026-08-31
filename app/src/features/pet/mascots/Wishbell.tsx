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

/**
 * Wishbell — a lilac unicorn under the pony palette.
 *
 * Original geometry: an ellipse head, a triangle horn with two stripes, two
 * ear triangles, a three-band mane and a computed five-point star mark. Not
 * anybody's character; see NOTICE.md and `mascots/roster.ts`.
 */
export function Wishbell({ mood }: { mood: MascotMood }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="home-mascot-art">
      <path d="M43 32 L50 2 L57 32 Z" fill="var(--color-text)" />
      <g stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.7">
        <path d="M46 20 L54 20" />
        <path d="M47.5 26 L52.5 26" />
      </g>

      <path d="M30 34 L26 10 L45 26 Z" fill="var(--color-accent)" />
      <path d="M70 34 L74 10 L55 26 Z" fill="var(--color-accent)" />

      <path d="M20 32 C2 46 4 76 18 94 C8 68 12 46 32 30 Z" fill="var(--color-danger)" opacity="0.85" />
      <path d="M27 27 C9 42 10 72 22 90 C14 66 18 44 38 27 Z" fill="var(--color-accent)" />
      <path d="M34 24 C18 40 18 68 28 86 C23 64 27 42 45 26 Z" fill="var(--color-success)" opacity="0.75" />

      <ellipse cx="52" cy="52" rx="26" ry="24" fill="var(--color-accent)" />
      <ellipse cx="52" cy="65" rx="16" ry="12" fill="var(--color-text)" opacity="0.2" />

      {/* A forelock, so the mane reads as hair and not as a scarf. */}
      <path d="M38 30 C46 26 56 27 62 33 C54 30 46 30 38 36 Z" fill="var(--color-danger)" opacity="0.8" />

      <path d={starPath(70, 63, 8)} fill="var(--color-text)" opacity="0.8" />

      {mood === 'sulking' ? null : <Blush cx={52} cy={60} spread={19} r={6} />}
      <Eyes cx={52} cy={49} spread={12} r={5.5} mood={mood} />
      <g fill="var(--color-base)" opacity="0.55">
        <ellipse cx="47" cy="64" rx="2" ry="2.6" />
        <ellipse cx="57" cy="64" rx="2" ry="2.6" />
      </g>
      <Mouth cx={52} cy={70} w={15} mood={mood} />

      <path d={starPath(16, 22, 5)} fill="var(--color-text)" opacity="0.35" />
      <path d={starPath(88, 30, 4)} fill="var(--color-text)" opacity="0.3" />
    </svg>
  );
}
