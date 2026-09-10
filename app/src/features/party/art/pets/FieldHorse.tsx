/** Horse, common. Pulled a cart for eleven years. Plain, sturdy, upright. */
export function FieldHorse() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      <ellipse cx="46" cy="62" rx="26" ry="16" fill="var(--color-text)" />
      <path d="M68 40 L82 30 L80 46 L70 54 Z" fill="var(--color-text)" />
      <ellipse cx="76" cy="38" rx="9" ry="7" fill="var(--color-text)" />
      <path d="M20 54 L20 82 M32 60 L32 86 M60 60 L60 86 M72 58 L72 84"
        stroke="var(--color-text)" strokeWidth="6" strokeLinecap="round" />
      <path d="M64 32 Q58 20 68 16 Q64 26 70 32 Z" fill="var(--color-accent)" opacity="0.8" />
    </svg>
  );
}
