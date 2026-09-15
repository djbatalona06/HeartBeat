/** Helmet, mythic. Left on for somebody who is still out. */
export function PorchLight() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      {/* The light itself, and the wide soft ring of it reaching the path. */}
      <circle cx="50" cy="52" r="30" fill="var(--color-accent)" opacity="0.14" />
      <circle cx="50" cy="52" r="19" fill="var(--color-accent)" opacity="0.25" />
      <path d="M38 40 L62 40 L58 66 L42 66 Z" fill="var(--color-accent)" />
      <path d="M40 40 L50 26 L60 40 Z" fill="var(--color-text)" />
      <path d="M50 18 L50 26" stroke="var(--color-text)" strokeWidth="4" strokeLinecap="round" />
      <path d="M34 78 L66 78" stroke="var(--color-text)" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
