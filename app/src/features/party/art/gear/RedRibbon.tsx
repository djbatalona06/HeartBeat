/** Helmet, rare. A headband with a bow tied on the left. */
export function RedRibbon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M14 58 A36 26 0 0 1 86 58"
        fill="none" stroke="var(--color-text)" strokeWidth="7" strokeLinecap="round"
      />
      <path d="M30 50 L14 38 L14 62 Z" fill="var(--color-accent)" />
      <path d="M30 50 L14 62 L14 38 Z" fill="var(--color-accent)" opacity="0.75" />
      <circle cx="30" cy="50" r="6" fill="var(--color-accent)" />
    </svg>
  );
}
