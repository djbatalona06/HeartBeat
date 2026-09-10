/** Fairy, godly. Appears only when two people are already looking up together. */
export function AuroraFairy() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <path
        d="M8 30 Q30 20 50 30 T92 30"
        fill="none" stroke="var(--color-accent)" strokeWidth="4" opacity="0.55"
      />
      <path
        d="M8 40 Q30 30 50 40 T92 40"
        fill="none" stroke="var(--color-accent)" strokeWidth="4" opacity="0.35"
      />
      <path d="M32 46 Q14 54 20 72 Q28 62 40 60 Z" fill="var(--color-text)" opacity="0.9" />
      <path d="M68 46 Q86 54 80 72 Q72 62 60 60 Z" fill="var(--color-text)" opacity="0.9" />
      <ellipse cx="50" cy="56" rx="8" ry="10" fill="var(--color-text)" />
      <ellipse cx="50" cy="76" rx="7" ry="16" fill="var(--color-text)" />
    </svg>
  );
}
