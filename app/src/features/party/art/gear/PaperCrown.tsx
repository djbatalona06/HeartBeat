/** Helmet, common. Folded from paper, three uneven points. */
export function PaperCrown() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M20 62 L20 40 L35 55 L50 32 L65 55 L80 40 L80 62 Z"
        fill="var(--color-text)"
      />
      <rect x="20" y="62" width="60" height="8" rx="1.5" fill="var(--color-text)" />
      <path d="M18 40 L24 40 L21 46 Z" fill="var(--color-accent)" opacity="0.7" />
      <path d="M76 40 L82 40 L79 46 Z" fill="var(--color-accent)" opacity="0.7" />
    </svg>
  );
}
