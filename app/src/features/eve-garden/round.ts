/**
 * Small, pure rules for keeping a fight moving. Kept out of the page so they
 * can be tested: Vitest runs `*.test.ts` only, and `EveGardenPage` is a `.tsx`.
 */

/** The slice of a battle these rules read. */
export interface TurnView {
  outcome: string;
  turn: string;
}

/**
 * Whether the page itself must play the monster's move.
 *
 * `playRound` plays it after each of the player's swings, but it is not the
 * only way a fight lands on the monster's turn: `Battle.Begin` hands the opening
 * move to the monster when the player is slower and a seeded coin flip says so,
 * and a round that was interrupted leaves it there too. Nothing else advances
 * that turn, and every control is disabled while it is the monster's, so
 * without this the fight sat on "Waiting on them." for good — only on the
 * stages where monsters outpace the player, and only on the phones whose seed
 * fell that way.
 */
export function shouldRedriveMonster(battle: TurnView | null, busy: string): boolean {
  return battle !== null && busy === 'idle' && battle.outcome === 'Fighting' && battle.turn === 'Monster';
}

/** How long the monster's opening move waits, so the fight reads as a fight. */
export const REDRIVE_DELAY_MS = 500;

/** The longest an animation may hold the round up. The longest tween is ~1.5 s. */
export const ANIMATION_CAP_MS = 3000;

/**
 * Wait for an animation, but never forever.
 *
 * The scene's promises resolve from a Phaser tween's `onComplete`, so a scene
 * that is destroyed or paused mid-tween never resolves one — and the round,
 * which awaits it, never reached the monster's move.
 */
export async function settle(work: Promise<unknown> | undefined, capMs = ANIMATION_CAP_MS): Promise<void> {
  if (!work) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => { timer = setTimeout(resolve, capMs); });
  try {
    await Promise.race([work.catch(() => undefined), cap]);
  } finally {
    clearTimeout(timer);
  }
}
