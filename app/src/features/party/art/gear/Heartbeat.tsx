/** Amulet, godly. A heart with a pulse line through it, on a cord. */
export function Heartbeat() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path d="M50 8 L50 26" stroke="var(--color-text-muted)" strokeWidth="2.5" />
      <path
        d="M50 82 C20 58 22 34 40 32 C46 31 50 36 50 42 C50 36 54 31 60 32 C78 34 80 58 50 82 Z"
        fill="var(--color-text)"
      />
      <path
        d="M28 54 L40 54 L45 44 L52 64 L58 50 L62 54 L72 54"
        fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
