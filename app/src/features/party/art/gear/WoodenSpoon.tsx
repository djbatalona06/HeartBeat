/** Weapon, common. A wooden spoon, undefeated in the kitchen. */
export function WoodenSpoon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <ellipse cx="50" cy="26" rx="16" ry="20" fill="var(--color-text)" />
      <rect x="45" y="42" width="10" height="46" rx="4" fill="var(--color-text)" />
      <ellipse cx="50" cy="26" rx="9" ry="12" fill="var(--color-accent)" opacity="0.35" />
    </svg>
  );
}
