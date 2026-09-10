/** Chestplate, common. A hoodie with a pouch pocket and drawstrings. */
export function BorrowedHoodie() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M50 16 Q30 16 26 34 L18 42 L26 48 L26 84 L74 84 L74 48 L82 42 L74 34 Q70 16 50 16 Z"
        fill="var(--color-text)"
      />
      <path d="M38 34 Q50 44 62 34" fill="none" stroke="var(--color-accent)" strokeWidth="3" opacity="0.8" />
      <path d="M36 60 L44 70 M64 60 L56 70" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="38" y="68" width="24" height="14" rx="3" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" />
    </svg>
  );
}
