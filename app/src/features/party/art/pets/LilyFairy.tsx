/** Fairy, rare. Sleeps folded inside a flower that opens for a few hours. */
export function LilyFairy() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <path d="M36 34 Q18 40 24 58 Q32 48 42 46 Z" fill="var(--color-text)" opacity="0.85" />
      <path d="M64 34 Q82 40 76 58 Q68 48 58 46 Z" fill="var(--color-text)" opacity="0.85" />
      <ellipse cx="50" cy="44" rx="8" ry="10" fill="var(--color-text)" />
      <g fill="var(--color-accent)">
        <ellipse cx="50" cy="72" rx="7" ry="18" />
        <ellipse cx="50" cy="72" rx="7" ry="18" transform="rotate(72 50 72)" />
        <ellipse cx="50" cy="72" rx="7" ry="18" transform="rotate(144 50 72)" />
      </g>
      <circle cx="50" cy="72" r="5" fill="var(--color-text)" />
    </svg>
  );
}
