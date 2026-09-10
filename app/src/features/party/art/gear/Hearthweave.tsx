/** Chestplate, godly. A sweater warm before it is worn — a glow at its heart. */
export function Hearthweave() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M50 16 Q26 16 26 38 L26 82 L74 82 L74 38 Q74 16 50 16 Z"
        fill="var(--color-text)"
      />
      <path d="M38 24 Q50 34 62 24" fill="none" stroke="var(--color-text)" strokeWidth="5" />
      <circle cx="50" cy="56" r="16" fill="var(--color-accent)" opacity="0.3" />
      <circle cx="50" cy="56" r="8" fill="var(--color-accent)" />
    </svg>
  );
}
