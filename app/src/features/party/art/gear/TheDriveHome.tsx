/** Boots, mythic. Knows the turns. Goes quiet at the last one. */
export function TheDriveHome() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      {/* A road that bends twice and arrives. */}
      <path
        d="M20 88 Q34 64 26 48 Q20 32 40 24 Q62 16 74 26"
        fill="none" stroke="var(--color-text)" strokeWidth="7" strokeLinecap="round"
      />
      <path
        d="M20 88 Q34 64 26 48 Q20 32 40 24 Q62 16 74 26"
        fill="none" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round"
        strokeDasharray="4 7"
      />
      {/* The window at the end of it, lit. */}
      <rect x="74" y="20" width="14" height="14" rx="2" fill="var(--color-accent)" />
    </svg>
  );
}
