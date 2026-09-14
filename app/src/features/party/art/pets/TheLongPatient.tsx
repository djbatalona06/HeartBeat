/** Vampire, mythic. Outlived everyone it was afraid of, by waiting. */
export function TheLongPatient() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      {/* A collar and a coat, and nothing inside them doing anything at all. */}
      <path d="M30 88 Q30 52 50 46 Q70 52 70 88 Z" fill="var(--color-text)" />
      <path d="M50 46 Q34 50 30 66 Q40 56 50 56 Q60 56 70 66 Q66 50 50 46 Z" fill="var(--color-accent)" opacity="0.45" />
      <circle cx="50" cy="34" r="13" fill="var(--color-text)" />
      {/* Two eyes, open. It has been awake the entire time. */}
      <circle cx="45" cy="33" r="2.4" fill="var(--color-accent)" />
      <circle cx="55" cy="33" r="2.4" fill="var(--color-accent)" />
      {/* An hourglass, run out and not turned over. */}
      <path
        d="M42 70 L58 70 L49 79 L58 88 L42 88 L51 79 Z"
        fill="var(--color-bg)" opacity="0.85"
      />
    </svg>
  );
}
