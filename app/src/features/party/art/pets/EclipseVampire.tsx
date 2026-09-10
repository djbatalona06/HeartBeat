/** Vampire, godly. Waited four hundred years for four minutes. */
export function EclipseVampire() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <circle cx="50" cy="40" r="28" fill="none" stroke="var(--color-accent)" strokeWidth="3.5" opacity="0.85" />
      <circle cx="50" cy="40" r="20" fill="var(--color-text-muted)" opacity="0.25" />
      <path d="M50 26 Q24 34 24 62 Q24 84 50 88 Q76 84 76 62 Q76 34 50 26 Z" fill="var(--color-text)" />
      <path d="M39 46 L36 52 L43 52 Z" fill="var(--color-accent)" />
      <path d="M61 46 L64 52 L57 52 Z" fill="var(--color-accent)" />
    </svg>
  );
}
