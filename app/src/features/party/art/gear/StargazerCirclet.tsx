/** Helmet, epic. A thin circlet band, three small stars above it. */
export function StargazerCirclet() {
  const star = (cx: number, cy: number, r: number) => (
    <path
      key={cx}
      d={`M${cx} ${cy - r} L${cx + r * 0.3} ${cy - r * 0.3} L${cx + r} ${cy} L${cx + r * 0.3} ${cy + r * 0.3} L${cx} ${cy + r} L${cx - r * 0.3} ${cy + r * 0.3} L${cx - r} ${cy} L${cx - r * 0.3} ${cy - r * 0.3} Z`}
      fill="var(--color-accent)"
    />
  );
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path
        d="M16 60 A34 24 0 0 1 84 60"
        fill="none" stroke="var(--color-text)" strokeWidth="5" strokeLinecap="round"
      />
      {star(30, 32, 5)}
      {star(50, 22, 6.5)}
      {star(70, 32, 5)}
    </svg>
  );
}
