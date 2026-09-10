/** Horse, rare. Runs the hour before sunrise, mid-stride against a rising arc. */
export function DawnCourser() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <path d="M10 78 A40 40 0 0 1 90 78" fill="none" stroke="var(--color-accent)" strokeWidth="4" opacity="0.5" />
      <ellipse cx="48" cy="58" rx="24" ry="14" fill="var(--color-text)" />
      <path d="M68 38 L84 26 L80 44 L68 50 Z" fill="var(--color-text)" />
      <ellipse cx="78" cy="34" rx="8" ry="6" fill="var(--color-text)" />
      <path d="M24 50 L14 70 M36 66 L30 88 M60 66 L64 88 M74 62 L82 82"
        stroke="var(--color-text)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
