/** Amulet, common. A torn ticket stub, kept on a cord. */
export function TicketStub() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path d="M50 8 L50 24" stroke="var(--color-text-muted)" strokeWidth="2.5" />
      <path
        d="M28 24 L72 24 Q76 24 76 30 L72 36 Q76 40 76 44 L28 44 Q24 40 28 36 L24 32 Q24 28 28 24 Z"
        fill="var(--color-text)"
      />
      <path d="M56 24 L56 44" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="3 3" />
      <path d="M28 44 L34 78 L46 68 L58 80 L68 62 L72 44" fill="var(--color-text)" opacity="0.55" />
    </svg>
  );
}
