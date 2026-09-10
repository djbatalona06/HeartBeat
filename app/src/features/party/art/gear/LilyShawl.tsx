/** Chestplate, rare. A cream shawl with a stitched four-petal flower. */
export function LilyShawl() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M50 18 Q22 26 22 52 Q22 76 50 84 Q78 76 78 52 Q78 26 50 18 Z"
        fill="var(--color-text)"
      />
      <g fill="var(--color-accent)">
        <ellipse cx="50" cy="44" rx="7" ry="12" />
        <ellipse cx="50" cy="44" rx="7" ry="12" transform="rotate(90 50 44)" />
      </g>
      <circle cx="50" cy="44" r="4" fill="var(--color-text)" />
    </svg>
  );
}
