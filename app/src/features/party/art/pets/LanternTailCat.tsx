/** Ribbon Cat, godly. Walks ahead on the dark part of the road. */
export function LanternTailCat() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <ellipse cx="42" cy="58" rx="24" ry="20" fill="var(--color-text)" />
      <path d="M24 40 L28 20 L40 32 Z" fill="var(--color-text)" />
      <path d="M60 40 L56 20 L44 32 Z" fill="var(--color-text)" />
      <path
        d="M62 66 Q84 62 86 44"
        fill="none" stroke="var(--color-text)" strokeWidth="6" strokeLinecap="round"
      />
      <circle cx="86" cy="42" r="9" fill="var(--color-accent)" opacity="0.35" />
      <circle cx="86" cy="42" r="4.5" fill="var(--color-accent)" />
    </svg>
  );
}
