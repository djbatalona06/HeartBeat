/**
 * Three chests, drawn rather than fetched.
 *
 * Its own file because it has two callers -- the alcove where a chest is
 * bought and the reveal where one is opened -- and the same argument the
 * alcove's own header makes about odds applies to the picture: two drawings of
 * the wooden chest is two chances for the cheap one to look like the dear one.
 *
 * The same lid and the same body each time, because they are three chests and
 * not three unrelated objects; what changes is the banding and how much of the
 * accent is on it. That is what makes the ladder readable at a glance without
 * anybody reading the word "gilded".
 */
export function ChestArt({ id }: { id: string }) {
  const bands = id === 'wooden' ? 1 : id === 'silver' ? 2 : 3;
  return (
    <svg viewBox="0 0 100 80" aria-hidden="true" className="chest-art" data-chest={id}>
      {/* The lid, a half-barrel. */}
      <path d="M12 38 Q50 6 88 38 Z" fill="var(--color-surface-muted)" />
      <path d="M12 38 Q50 6 88 38" fill="none" stroke="var(--color-text)" strokeWidth="3" />
      {/* The body. */}
      <rect x="12" y="38" width="76" height="32" rx="3" fill="var(--color-surface-muted)" />
      <rect
        x="12" y="38" width="76" height="32" rx="3"
        fill="none" stroke="var(--color-text)" strokeWidth="3"
      />
      {/* Banding: one strap for wooden, two for silver, three for gilded. */}
      {Array.from({ length: bands }, (_, i) => {
        const x = 50 + (i - (bands - 1) / 2) * 24;
        return (
          <path
            key={x}
            d={`M${x} 20 Q${x} 30 ${x} 38 L${x} 70`}
            stroke="var(--color-accent)"
            strokeWidth={bands === 3 ? 5 : 4}
            fill="none"
            opacity={0.5 + bands * 0.15}
          />
        );
      })}
      {/* The lock, which is the one place the gilded chest is actually gold. */}
      <rect
        x="44" y="40" width="12" height="12" rx="2"
        fill={bands === 3 ? '#f5c85c' : 'var(--color-accent)'}
      />
    </svg>
  );
}
