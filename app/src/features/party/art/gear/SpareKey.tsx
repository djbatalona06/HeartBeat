/** Amulet, mythic. Cut for somebody. The meaning is in the cutting. */
export function SpareKey() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path d="M50 14 Q50 24 50 30" stroke="var(--color-text)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="38" cy="38" r="13" fill="none" stroke="var(--color-accent)" strokeWidth="7" />
      <path
        d="M48 44 L76 72"
        stroke="var(--color-accent)" strokeWidth="7" strokeLinecap="round"
      />
      {/* The teeth. Two of them, cut to one door. */}
      <path
        d="M68 64 L62 70 M76 72 L70 78"
        stroke="var(--color-accent)" strokeWidth="6" strokeLinecap="round"
      />
    </svg>
  );
}
