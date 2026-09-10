/** Boots, godly. Soft rounded slippers, nowhere to be, one small sun above. */
export function SundayMorning() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">
      <circle cx="30" cy="26" r="10" fill="var(--color-accent)" />
      <g stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8">
        <path d="M30 10 L30 14 M30 38 L30 42 M14 26 L18 26 M42 26 L46 26" />
        <path d="M19 15 L22 18 M38 15 L35 18 M19 37 L22 34 M38 37 L35 34" />
      </g>
      <ellipse cx="38" cy="70" rx="20" ry="12" fill="var(--color-text)" />
      <ellipse cx="70" cy="74" rx="20" ry="12" fill="var(--color-text)" />
      <ellipse cx="38" cy="68" rx="8" ry="4" fill="var(--color-accent)" opacity="0.6" />
      <ellipse cx="70" cy="72" rx="8" ry="4" fill="var(--color-accent)" opacity="0.6" />
    </svg>
  );
}
