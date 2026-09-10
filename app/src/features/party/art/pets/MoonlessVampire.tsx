/** Vampire, epic. Prefers the nights nobody photographs. */
export function MoonlessVampire() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <circle cx="50" cy="42" r="30" fill="var(--color-text-muted)" opacity="0.18" />
      <path d="M50 24 Q26 32 26 60 Q26 82 50 86 Q74 82 74 60 Q74 32 50 24 Z" fill="var(--color-text)" />
      <path d="M40 44 L37 50 L44 50 Z" fill="var(--color-accent)" />
      <path d="M60 44 L63 50 L56 50 Z" fill="var(--color-accent)" />
    </svg>
  );
}
