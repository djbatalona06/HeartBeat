/** Chestplate, mythic. There is a good one and there are the others. */
export function TheGoodBlanket() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      {/* Folded, because the good one lives folded. */}
      <path d="M18 40 Q50 28 82 40 L82 56 Q50 44 18 56 Z" fill="var(--color-accent)" opacity="0.75" />
      <path d="M18 56 Q50 44 82 56 L82 72 Q50 60 18 72 Z" fill="var(--color-text)" opacity="0.85" />
      {/* The one frayed corner that is the reason it is the good one. */}
      <path
        d="M78 72 L86 78 M82 70 L88 74"
        stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round"
      />
    </svg>
  );
}
