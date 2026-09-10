/** Ribbon Cat, rare. Wears the bow on the left, and has not explained why. */
export function RibbonCat() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <ellipse cx="50" cy="60" rx="26" ry="22" fill="var(--color-text)" />
      <path d="M28 42 L34 20 L48 34 Z" fill="var(--color-text)" />
      <path d="M72 42 L66 20 L52 34 Z" fill="var(--color-text)" />
      <path d="M36 58 L40 62 M64 58 L60 62" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" />
      <g fill="var(--color-accent)">
        <path d="M32 40 L20 30 L20 50 Z" />
        <path d="M32 40 L20 50 L20 30 Z" opacity="0.75" />
        <circle cx="32" cy="40" r="5" />
      </g>
    </svg>
  );
}
