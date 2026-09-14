/** Horse, mythic. Carried you both, separately, years before you met. */
export function TheOldGrey() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pet-art">
      {/* A working horse's line: deep chest, low head, nothing heroic about it. */}
      <path
        d="M22 74 Q20 52 34 46 Q48 40 62 44 Q76 48 78 62 Q80 74 74 78"
        fill="var(--color-text)" opacity="0.9"
      />
      <path d="M62 44 Q74 34 82 36 Q86 38 84 44 Q78 48 70 48 Z" fill="var(--color-text)" />
      <path d="M78 36 L80 26 L86 34 Z" fill="var(--color-text)" />
      {/* Four legs, because it has stood on all of them for a very long time. */}
      <path
        d="M30 70 L28 88 M42 72 L41 88 M62 72 L64 88 M72 68 L76 86"
        fill="none" stroke="var(--color-text)" strokeWidth="5" strokeLinecap="round"
      />
      {/* Grey at the muzzle — the whole of what makes it the old grey. */}
      <circle cx="84" cy="42" r="5" fill="var(--color-surface-muted)" />
      <path
        d="M40 44 Q50 34 60 42"
        fill="none" stroke="var(--color-surface-muted)" strokeWidth="4" strokeLinecap="round"
      />
    </svg>
  );
}
