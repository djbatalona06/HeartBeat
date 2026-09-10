/** Vampire, common. Afraid of the sun in principle, mostly afraid of mornings. */
export function CandleVampire() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <path d="M50 22 Q22 30 22 60 Q22 84 50 88 Q78 84 78 60 Q78 30 50 22 Z" fill="var(--color-text)" />
      <path d="M38 42 L34 50 L42 50 Z" fill="var(--color-accent)" />
      <path d="M62 42 L58 50 L66 50 Z" fill="var(--color-accent)" />
      <rect x="46" y="64" width="8" height="16" rx="2" fill="var(--color-text-muted)" />
      <path
        d="M50 46 C42 54 42 62 50 66 C46 60 48 56 50 52 C52 56 54 60 50 66 C58 62 58 54 50 46 Z"
        fill="var(--color-accent)"
      />
    </svg>
  );
}
