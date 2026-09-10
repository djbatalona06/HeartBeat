/** Fairy, common. Lives in the porch light and is the reason it flickers. */
export function LanternFairy() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <path d="M38 36 Q18 44 22 64 Q30 52 42 50 Z" fill="var(--color-text)" opacity="0.85" />
      <path d="M62 36 Q82 44 78 64 Q70 52 58 50 Z" fill="var(--color-text)" opacity="0.85" />
      <ellipse cx="50" cy="46" rx="9" ry="11" fill="var(--color-text)" />
      <ellipse cx="50" cy="66" rx="7" ry="16" fill="var(--color-text)" />
      <circle cx="50" cy="80" r="10" fill="var(--color-accent)" opacity="0.4" />
      <circle cx="50" cy="80" r="5" fill="var(--color-accent)" />
    </svg>
  );
}
