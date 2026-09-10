/** Ribbon Cat, epic. Sat on the letter while it was being written and is in it now. */
export function InkCat() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <ellipse cx="50" cy="58" rx="25" ry="21" fill="var(--color-text)" />
      <path d="M30 40 L34 20 L46 32 Z" fill="var(--color-text)" />
      <path d="M70 40 L66 20 L54 32 Z" fill="var(--color-text)" />
      <circle cx="26" cy="76" r="4" fill="var(--color-accent)" opacity="0.8" />
      <circle cx="70" cy="80" r="3" fill="var(--color-accent)" opacity="0.6" />
      <circle cx="60" cy="30" r="2.5" fill="var(--color-accent)" opacity="0.7" />
      <path d="M50 58 Q54 70 46 78" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
