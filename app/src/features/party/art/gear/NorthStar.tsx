/** Amulet, epic. A five-point star on a chain loop. */
export function NorthStar() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <circle cx="50" cy="20" r="10" fill="none" stroke="var(--color-text-muted)" strokeWidth="3" />
      <path
        d="M50 32 L57 52 L78 52 L61 64 L67 84 L50 72 L33 84 L39 64 L22 52 L43 52 Z"
        fill="var(--color-accent)"
      />
    </svg>
  );
}
