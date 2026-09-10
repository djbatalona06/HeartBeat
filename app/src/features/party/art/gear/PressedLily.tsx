/** Amulet, rare. A flat pressed flower on a cord. */
export function PressedLily() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path d="M50 8 L50 34" stroke="var(--color-text-muted)" strokeWidth="2.5" />
      <g fill="var(--color-text)">
        <ellipse cx="50" cy="52" rx="6" ry="20" />
        <ellipse cx="50" cy="52" rx="6" ry="20" transform="rotate(60 50 52)" />
        <ellipse cx="50" cy="52" rx="6" ry="20" transform="rotate(120 50 52)" />
      </g>
      <circle cx="50" cy="52" r="6" fill="var(--color-accent)" />
    </svg>
  );
}
