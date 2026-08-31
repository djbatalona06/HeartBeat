import { Blush, Eyes, Mouth } from './face';
import type { MascotMood } from './roster';

/**
 * Mochi — a cream ribbon cat under the kitty palette.
 *
 * Original geometry: two ear triangles, an ellipse head, an ellipse body, a
 * four-triangle bow and two line-segment whiskers. Not anybody's character;
 * see NOTICE.md and `mascots/roster.ts`.
 */
export function Mochi({ mood }: { mood: MascotMood }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="home-mascot-art">
      <ellipse cx="50" cy="80" rx="23" ry="17" fill="var(--color-text)" />
      <ellipse cx="36" cy="93" rx="8" ry="4.5" fill="var(--color-text)" />
      <ellipse cx="64" cy="93" rx="8" ry="4.5" fill="var(--color-text)" />

      <path d="M26 38 L33 10 L53 28 Z" fill="var(--color-text)" />
      <path d="M74 38 L67 10 L47 28 Z" fill="var(--color-text)" />
      <path d="M32 33 L36 18 L47 27 Z" fill="var(--color-accent)" opacity="0.7" />
      <path d="M68 33 L64 18 L53 27 Z" fill="var(--color-accent)" opacity="0.7" />

      <ellipse cx="50" cy="46" rx="30" ry="25" fill="var(--color-text)" />

      <g stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 42 L19 46" />
        <path d="M4 52 L19 52" />
        <path d="M96 42 L81 46" />
        <path d="M96 52 L81 52" />
      </g>

      {mood === 'sulking' ? null : <Blush cx={50} cy={53} spread={21} r={6} />}
      <Eyes cx={50} cy={43} spread={11} r={5} mood={mood} />
      <ellipse cx="50" cy="53" rx="3.2" ry="2.4" fill="var(--color-accent)" />
      <Mouth cx={50} cy={58} w={16} mood={mood} />

      <g fill="var(--color-accent)">
        <path d="M70 20 L58 14 L58 28 Z" />
        <path d="M74 20 L86 14 L86 28 Z" />
        <circle cx="72" cy="21" r="4.5" />
      </g>
    </svg>
  );
}
