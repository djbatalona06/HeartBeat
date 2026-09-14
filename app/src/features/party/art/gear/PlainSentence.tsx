/** Weapon, mythic. Said once, without hedging. Nothing hits harder. */
export function PlainSentence() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      {/* One line, and then a full stop. That is the whole weapon. */}
      <path
        d="M16 50 L74 50"
        stroke="var(--color-text)" strokeWidth="8" strokeLinecap="round"
      />
      <circle cx="86" cy="50" r="6" fill="var(--color-accent)" />
      {/* No flourish above or below it, which is the point being made. */}
      <path
        d="M16 34 L44 34 M16 66 L44 66"
        stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" opacity="0.28"
      />
    </svg>
  );
}
