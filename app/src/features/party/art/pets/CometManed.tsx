/** Horse, godly. Seen twice in one lifetime — a comet-tail streaming mane. */
export function CometManed() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <ellipse cx="44" cy="58" rx="24" ry="14" fill="var(--color-text)" />
      <path d="M64 38 L80 28 L76 44 L65 50 Z" fill="var(--color-text)" />
      <ellipse cx="74" cy="34" rx="8" ry="6" fill="var(--color-text)" />
      <path d="M22 50 L14 76 M34 62 L28 86 M56 62 L60 86 M68 58 L76 82"
        stroke="var(--color-text)" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M62 30 Q48 18 34 22 M62 30 Q52 12 36 12 M62 30 Q58 10 44 6"
        fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" opacity="0.85"
      />
    </svg>
  );
}
