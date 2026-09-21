import { PRIZE_KIND_NAMES, type PrizeKind } from '../../domain/rpg/chests';
import { TIER_NAMES, tierRank } from '../../domain/rpg/tiers';
import type { ChestOutcome, ChestPrizeOutcome } from '../../db/repository/chests';

/**
 * What an opening is told to the person who paid for it.
 *
 * Its own module, and pure, because this is the one part of a chest with an
 * opinion in it. Every line here has to say what somebody actually got without
 * ever reading as a shrug — "seven hundred coins must never buy a shrug" is the
 * rule `repository/chests.ts` enforces in storage, and this is the same rule
 * in language. A duplicate is phrased as the thing it did (refined, closer,
 * coins back), never as the thing it was not.
 */

/**
 * Where a new thing went.
 *
 * The fallback used to be the kind's own name, which sat directly under
 * `prizeKindLine` already saying it: "Legendary · companion" over
 * "Companion". Two lines and one fact. This says the thing the app otherwise
 * makes somebody hunt for — the same job the shop's "Bought. Place it on the
 * Birb tab." already does.
 */
const LANDED: Record<PrizeKind, string> = {
  gear: 'In the bag.',
  companion: 'Hatched.',
  decor: 'In the birbhouse.',
  dye: 'Ready to wear.',
  flora: 'Ready to plant.',
};

/** One item, in a line. */
export function prizeLine(prize: ChestPrizeOutcome): string {
  if (prize.refined !== undefined) return `Refined to +${prize.refined}.`;
  if (prize.bonded !== undefined) return `Closer by ${prize.bonded}.`;
  if (prize.refunded !== undefined) return `Already yours — ${prize.refunded} coins back.`;
  return LANDED[prize.kind];
}

/** What the item is, under its name: "Rare gear", "Legendary companion". */
export function prizeKindLine(prize: ChestPrizeOutcome): string {
  return `${TIER_NAMES[prize.tier]} · ${PRIZE_KIND_NAMES[prize.kind].toLowerCase()}`;
}

/**
 * The whole opening, in one sentence.
 *
 * The reveal shows the items themselves, so this is for the places that have
 * only a line to give: the garden's note under the drawer, and the toast if a
 * reveal is ever dismissed before it is read. It names the **best** thing in
 * the chest rather than the first, because that is what somebody would say.
 */
export function openingLine(outcome: Extract<ChestOutcome, { ok: true }>): string {
  const { prizes, refunded } = outcome;
  if (prizes.length === 0) {
    // Structurally unreachable -- `openChestFor` grants or refunds every item.
    // Said plainly rather than left as an empty string, because the one thing
    // this must never do is report nothing.
    return refunded > 0 ? `Nothing new in that one. ${refunded} coins back.` : 'Empty.';
  }

  const best = prizes.reduce(
    (top, prize) => (tierRank(prize.tier) > tierRank(top.tier) ? prize : top),
    prizes[0],
  );
  const rest = prizes.length - 1;
  const tail = rest > 0 ? ` and ${rest} more.` : '.';
  return `${best.name} — ${prizeKindLine(best).toLowerCase()}${tail}`;
}

/** The line about the insurance, or nothing when it did not come into it. */
export function floorLine(outcome: Extract<ChestOutcome, { ok: true }>): string | null {
  if (!outcome.floor) return null;
  return outcome.lifted
    ? `The floor paid out: ${TIER_NAMES[outcome.floor].toLowerCase()} or better, as promised.`
    : 'The floor was in force and did not need to be.';
}
