/** Fairy, epic. Has counted them, and will not tell you the number. */
export function StargazerFairy() {
  const dot = (cx: number, cy: number, r: number) => (
    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="var(--color-accent)" />
  );
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <path d="M34 32 Q14 40 20 60 Q28 48 40 46 Z" fill="var(--color-text)" opacity="0.85" />
      <path d="M66 32 Q86 40 80 60 Q72 48 60 46 Z" fill="var(--color-text)" opacity="0.85" />
      <ellipse cx="50" cy="42" rx="8" ry="10" fill="var(--color-text)" />
      <ellipse cx="50" cy="62" rx="7" ry="18" fill="var(--color-text)" />
      {dot(18, 20, 2.5)}
      {dot(80, 24, 2)}
      {dot(88, 50, 2.5)}
      {dot(14, 60, 2)}
      {dot(74, 78, 2.5)}
    </svg>
  );
}
