/** Horse, epic. Crossed an estuary at the exact minute the water allowed it. */
export function Tidewalker() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <ellipse cx="46" cy="54" rx="25" ry="15" fill="var(--color-text)" />
      <path d="M67 34 L82 24 L79 40 L68 47 Z" fill="var(--color-text)" />
      <ellipse cx="76" cy="32" rx="8" ry="6" fill="var(--color-text)" />
      <path d="M24 46 L18 76 M36 54 L30 80 M58 54 L64 80 M70 50 L78 76"
        stroke="var(--color-text)" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M12 82 Q26 74 40 82 T68 82 T96 82"
        fill="none" stroke="var(--color-accent)" strokeWidth="3.5" opacity="0.8"
      />
    </svg>
  );
}
