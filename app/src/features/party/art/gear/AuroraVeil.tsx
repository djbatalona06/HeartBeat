/** Helmet, godly. A veil of three wavy bands draped from a headband. */
export function AuroraVeil() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M18 44 A32 22 0 0 1 82 44"
        fill="none" stroke="var(--color-text)" strokeWidth="5" strokeLinecap="round"
      />
      <path
        d="M22 46 Q30 64 20 82 Q34 70 40 50"
        fill="none" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" opacity="0.9"
      />
      <path
        d="M42 44 Q50 66 44 86 Q58 72 60 46"
        fill="none" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" opacity="0.65"
      />
      <path
        d="M62 46 Q72 64 66 82 Q80 68 78 46"
        fill="none" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" opacity="0.9"
      />
    </svg>
  );
}
