/** Weapon, godly. Not a weapon. A spiral of wind, winning fights anyway. */
export function SecondWind() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M50 50 C50 30 70 26 74 42 C77 54 64 60 56 52 C50 46 54 36 62 38"
        fill="none" stroke="var(--color-accent)" strokeWidth="5" strokeLinecap="round"
      />
      <path
        d="M50 50 Q30 54 24 70 M50 50 Q28 46 16 54"
        fill="none" stroke="var(--color-text)" strokeWidth="4" strokeLinecap="round" opacity="0.8"
      />
    </svg>
  );
}
