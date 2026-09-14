/**
 * Deterministic numbers, for things that must look arbitrary and replay the same.
 *
 * This was `domain/study/quiz.ts`'s private FNV-1a, laying a card's four choices
 * out the same way twice. The overworld encounter needs the identical property
 * for a different reason — a fight has to be re-runnable from its log, so the
 * variance in a swing is a function of the round rather than of the clock — and
 * a second copy of FNV-1a is the kind of duplicate that drifts. So it moved
 * here, and `quiz.ts` re-exports it: one implementation, two callers, and
 * `quiz.test.ts` still importing from `./quiz` is the proof the move changed no
 * behaviour.
 *
 * Neither caller needs this to be unguessable, and it is not. The requirement
 * is repeatability.
 */

/** A stable 32-bit hash (FNV-1a). */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A number in [0, 1) from a seed and a step.
 *
 * `step` is the caller's counter — an encounter passes its round number, so
 * round three of a fight rolls the same whether it is replayed now or from the
 * log tomorrow. Mixing is a second Math.imul rather than anything cleverer,
 * because consecutive steps of a bare FNV hash are visibly correlated and a
 * fight where every swing lands the same is not variance.
 */
export function roll(seed: number, step: number): number {
  let h = (seed ^ Math.imul(step + 1, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
