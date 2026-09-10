/** Boots, epic. A single striding boot with a motion trail behind it. */
export function Longstride() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M46 16 L64 16 L64 48 L80 58 L80 68 L38 68 L38 52 L46 52 Z"
        fill="var(--color-text)"
      />
      <path d="M18 40 L34 40 M14 50 L30 50 M18 60 L34 60"
        stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}
