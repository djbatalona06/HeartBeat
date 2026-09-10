/** Boots, common. Two mismatched socks, different stripes, side by side. */
export function OddSocks() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path d="M24 20 L44 20 L44 58 Q44 74 30 74 Q18 74 18 60 L18 34 Z" fill="var(--color-text)" />
      <rect x="24" y="30" width="20" height="4" fill="var(--color-accent)" />
      <rect x="24" y="40" width="20" height="4" fill="var(--color-accent)" />
      <path d="M56 20 L76 20 L76 60 Q76 74 64 74 Q50 74 50 58 L50 34 Z" fill="var(--color-text)" />
      <circle cx="63" cy="34" r="3" fill="var(--color-accent)" />
      <circle cx="63" cy="44" r="3" fill="var(--color-accent)" />
      <circle cx="63" cy="54" r="3" fill="var(--color-accent)" />
    </svg>
  );
}
