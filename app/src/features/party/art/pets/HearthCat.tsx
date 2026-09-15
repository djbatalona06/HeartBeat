/** Ribbon Cat, mythic. Chose the house. Nobody chose it. */
export function HearthCat() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      {/* The hearth it picked, drawn behind it because it got there second. */}
      <path d="M18 88 L18 58 Q50 40 82 58 L82 88 Z" fill="var(--color-surface-muted)" />
      <path d="M40 88 L40 70 Q50 62 60 70 L60 88 Z" fill="var(--color-accent)" opacity="0.3" />
      {/* Curled, which is the only shape it has ever needed. */}
      <ellipse cx="50" cy="74" rx="26" ry="16" fill="var(--color-text)" />
      <path d="M32 66 L34 52 L44 62 Z" fill="var(--color-text)" />
      <path d="M58 62 L68 52 L70 66 Z" fill="var(--color-text)" />
      <path
        d="M74 76 Q84 72 78 62"
        fill="none" stroke="var(--color-text)" strokeWidth="6" strokeLinecap="round"
      />
      {/* Eyes shut. It is not worried about anything. */}
      <path
        d="M42 70 Q45 73 48 70 M54 70 Q57 73 60 70"
        fill="none" stroke="var(--color-bg)" strokeWidth="2.4" strokeLinecap="round"
      />
    </svg>
  );
}
