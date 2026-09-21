import { loadoutSheet, type Loadout } from './loadout';
import {
  RAID_STATS, ZERO_RAID_STATS, type RaidSheet, type RaidStats,
} from './raidStats';
import type { GearSlot } from './types';

/**
 * What one swap would do to your seven stats.
 *
 * ## The question this answers
 *
 * `RaidSheet.tsx` says in its own header that "would the other boots be
 * better" is the question it half-answers: it shows one sheet with full
 * provenance, so you can see where every number came from, but not what a
 * different item would make of it. Working that out meant equipping the thing
 * and reading the sheet again, which is a destructive way to ask a question.
 *
 * ## Why it compares you with yourself and not with your partner
 *
 * The obvious reading of a "gear diff" in a two-person app is one member's
 * sheet against the other's, with a team total under it. Two reasons it is
 * not that.
 *
 * The blocking one is that the data is not there: `avatar` and `inventory` are
 * not in `PARTNER_VISIBLE_KINDS` (`domain/sync/holdings.ts`), so a phone never
 * receives the other member's gear at all. A two-person diff would need that
 * list extended first, which is the first time personal inventory would cross
 * between phones.
 *
 * The better one is that this is the more useful question anyway. "Those boots
 * are worth four Fortify to you" is something to act on. A column of your
 * partner's numbers beside yours is a scoreboard between two people who live
 * together, which is the one thing this layer was shaped to make impossible —
 * `schedule.ts` argues it about push, `derive.ts` about badges, and the weekly
 * wager is a shared target rather than a race for the same reason.
 *
 * So the two columns here are **both yours**, and a `delta` is safe and wanted:
 * it ranks two items, never two people.
 *
 * ## The level gate is previewed rather than hidden
 *
 * `gearSources` contributes nothing for an item above its wearer's level, so
 * swapping to something you cannot wear yet shows a column where that slot is
 * empty. That is the honest preview — it answers "not yet" rather than
 * promising stats that would not arrive.
 */

export interface SwapSide {
  sheet: RaidSheet;
  /** Every stat added up, so a column has one number as well as seven. */
  sum: number;
}

export interface SwapDiff {
  slot: GearSlot;
  /** The item moving in, or absent when the slot is being emptied. */
  itemId?: string;
  /** Your sheet as it stands. */
  worn: SwapSide;
  /** Your sheet with the swap made. */
  swapped: SwapSide;
  /** Swapped minus worn, per stat. Positive is a gain. */
  delta: RaidStats;
  /** The net across every stat — one number for "is this an upgrade". */
  netSum: number;
}

function sumOf(stats: RaidStats): number {
  return RAID_STATS.reduce((total, key) => total + stats[key], 0);
}

function sideFor(loadout: Loadout): SwapSide {
  const sheet = loadoutSheet(loadout);
  return { sheet, sum: sumOf(sheet.total) };
}

/**
 * Put `itemId` in `slot` and see what changes. `undefined` empties the slot,
 * which is a real question — a level that fell can make taking something off
 * the better move.
 *
 * Pure, and it does not touch what is equipped: the swapped loadout is a copy.
 */
export function previewSwap(
  loadout: Loadout,
  slot: GearSlot,
  itemId?: string,
): SwapDiff {
  const equipped = { ...(loadout.equipped ?? {}) };
  if (itemId === undefined) delete equipped[slot];
  else equipped[slot] = itemId;

  const worn = sideFor(loadout);
  const swapped = sideFor({ ...loadout, equipped });

  const delta = { ...ZERO_RAID_STATS };
  for (const key of RAID_STATS) {
    delta[key] = swapped.sheet.total[key] - worn.sheet.total[key];
  }

  return {
    slot,
    ...(itemId === undefined ? {} : { itemId }),
    worn,
    swapped,
    delta,
    netSum: swapped.sum - worn.sum,
  };
}
