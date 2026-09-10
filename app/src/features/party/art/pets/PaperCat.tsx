/** Ribbon Cat, common. Drawn in six lines on the back of an envelope. */
export function PaperCat() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <path
        d="M30 78 L30 48 L20 30 L38 40 L50 34 L62 40 L80 30 L70 48 L70 78 Z"
        fill="var(--color-text)"
      />
      <path d="M42 56 L46 60 M58 56 L54 60" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
