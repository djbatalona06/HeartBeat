import type { CSSProperties, ReactNode } from 'react';

/**
 * The centre stage: a box with a shape of its own, whatever is inside it.
 *
 * ## Why an aspect ratio and not a height
 *
 * Because of what goes in it later. Eve's Garden mounts Phaser into a parent
 * and uses `Scale.FIT`, and FIT needs a parent with a resolved size — a flex
 * child that collapses to zero gives it zero to fit into, and the canvas
 * renders at nothing. `aspect-ratio` resolves from the width, which a block
 * element always has, so the height is never in question and never depends on
 * the content that has not loaded yet.
 *
 * That also makes it the seam between a DOM scene and a canvas one: the same
 * box holds either, and whichever is inside inherits a size that was decided
 * before it mounted.
 *
 * The default `11 / 7` is the arena's own ratio (`ARENA_WIDTH` × `ARENA_HEIGHT`
 * in `domain/rpg/arena.ts`), so the garden's canvas fills its stage exactly
 * rather than letterboxing inside it.
 */
export interface HeroStageProps {
  children: ReactNode;
  /** CSS `aspect-ratio`. Defaults to the arena's. */
  ratio?: string;
  className?: string;
  /** Announced to a screen reader; the stage is a picture unless told otherwise. */
  label?: string;
  /** True while the thing inside is still loading. */
  busy?: boolean;
}

export function HeroStage({
  children,
  ratio = '11 / 7',
  className,
  label,
  busy,
}: HeroStageProps) {
  return (
    <div
      className={className ? `hero-stage ${className}` : 'hero-stage'}
      style={{ '--hero-ratio': ratio } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-busy={busy || undefined}
    >
      {children}
    </div>
  );
}
