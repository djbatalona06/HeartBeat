/** Weapon, epic. A lance that points at the thing you have been avoiding. */
export function CometLance() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <path d="M50 8 L58 26 L42 26 Z" fill="var(--color-accent)" />
      <rect x="47" y="26" width="6" height="58" rx="2" fill="var(--color-text)" />
      <path
        d="M50 30 Q30 46 20 66 Q36 58 50 42"
        fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" opacity="0.7"
      />
    </svg>
  );
}
