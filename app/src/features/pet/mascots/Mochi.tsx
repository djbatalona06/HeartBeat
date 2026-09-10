import { Blush, Eyes, Mouth } from './face';
import type { MascotMood } from './roster';

/**
 * Mochi — a cream ribbon cat under the kitty palette.
 *
 * Original geometry: two ear triangles, an ellipse head, an ellipse body, a
 * four-triangle bow and two line-segment whiskers. Not anybody's character;
 * see NOTICE.md and `mascots/roster.ts`.
 *
 * Mochi is the only mascot with white highlights, and deliberately so. The
 * other four are drawn entirely in theme variables, which is what lets them
 * follow their palette when it changes; a literal white here is a fifth colour
 * that no palette controls. It earns that on one mascot because Mochi's body
 * is `--color-text` — a near-white already — so a highlight is the only way to
 * put a light source on it at all. Anywhere else it would just be a hole.
 */

/** Highlights are a light source, not a tint, so they sit in one place. */
const HIGHLIGHT = '#ffffff';

/**
 * A catchlight only lands on an eye that is a filled shape. `happy` and
 * `sleepy` draw their eyes as open arcs (see `face.tsx`), and a dot inside an
 * arc reads as a stray speck rather than a reflection.
 */
function catchlit(mood: MascotMood): boolean {
  return mood === 'content' || mood === 'sulking';
}

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

      {/* The light sits above and to the left, and everything below agrees with
          that: the head sheen, the bow's knot, and the body's shoulder are all
          on the same side. A highlight that disagrees with its own light source
          is what makes a drawing look plastic. */}
      <ellipse
        cx="36" cy="34" rx="13" ry="7.5"
        transform="rotate(-22 36 34)"
        fill={HIGHLIGHT} opacity="0.5"
      />
      <ellipse
        cx="35" cy="72" rx="8" ry="4"
        transform="rotate(-18 35 72)"
        fill={HIGHLIGHT} opacity="0.28"
      />
      {/* The lit inner edge of the near ear. */}
      <path d="M33 30 L35 19 L43 26 Z" fill={HIGHLIGHT} opacity="0.35" />

      <g stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 42 L19 46" />
        <path d="M4 52 L19 52" />
        <path d="M96 42 L81 46" />
        <path d="M96 52 L81 52" />
      </g>

      {mood === 'sulking' ? null : <Blush cx={50} cy={53} spread={21} r={6} />}
      <Eyes cx={50} cy={43} spread={11} r={5} mood={mood} />
      {catchlit(mood) ? (
        <g fill={HIGHLIGHT} opacity="0.9">
          <circle cx="37.4" cy="41.2" r="1.5" />
          <circle cx="59.4" cy="41.2" r="1.5" />
        </g>
      ) : null}
      <ellipse cx="50" cy="53" rx="3.2" ry="2.4" fill="var(--color-accent)" />
      {/* The nose is the one accent-coloured thing small enough that a
          highlight on it still reads; on the bow it would fill the shape. */}
      <ellipse cx="48.9" cy="52.3" rx="1" ry="0.7" fill={HIGHLIGHT} opacity="0.65" />
      <Mouth cx={50} cy={58} w={16} mood={mood} />

      <g fill="var(--color-accent)">
        <path d="M70 20 L58 14 L58 28 Z" />
        <path d="M74 20 L86 14 L86 28 Z" />
        <circle cx="72" cy="21" r="4.5" />
      </g>
      {/* A ribbon has a sheen where it folds, which is the knot. */}
      <ellipse
        cx="70.6" cy="19.4" rx="2" ry="1.4"
        transform="rotate(-30 70.6 19.4)"
        fill={HIGHLIGHT} opacity="0.55"
      />
      <path d="M62 16.5 L59.4 15.2 L59.4 20 Z" fill={HIGHLIGHT} opacity="0.3" />
    </svg>
  );
}
