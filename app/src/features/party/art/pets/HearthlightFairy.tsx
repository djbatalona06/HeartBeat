/** Fairy, mythic. Lives in the pilot light. The reason the house is warm. */
export function HearthlightFairy() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      {/* The flame she lives in, which is small and has never once gone out. */}
      <path
        d="M50 82 Q34 70 38 54 Q41 42 50 32 Q59 42 62 54 Q66 70 50 82 Z"
        fill="var(--color-accent)" opacity="0.28"
      />
      <path d="M50 74 Q42 66 45 56 Q47 48 50 42 Q53 48 55 56 Q58 66 50 74 Z" fill="var(--color-accent)" />
      {/* Wings, folded back against the heat rather than spread for show. */}
      <path
        d="M40 52 Q24 44 26 30 Q38 34 44 46 M60 52 Q76 44 74 30 Q62 34 56 46"
        fill="var(--color-text)" opacity="0.5"
      />
      <circle cx="50" cy="56" r="4" fill="var(--color-bg)" />
    </svg>
  );
}
