import { hash, roll } from '../hash';
import type { DayKey } from '../types';
import { quotesFor } from './quotes';
import { lanesFor, type LaneInput, type SupportLane } from './lanes';
import type { Quote } from './quotes';

/**
 * A line the two of you are on the same page of.
 *
 * ## What `pickForDay` already did, and what it did not
 *
 * `pickForDay` hashes the day key, so both phones already land on the same
 * quote with nothing synced between them — that is its whole point and it is
 * kept. What it cannot do is tell two *couples* apart. Every couple in the
 * world reading the general lane on the same day gets the same line, and with
 * four or five quotes to a lane the rotation is short and globally in lockstep.
 *
 * So this seeds on the couple as well: `hash(`${coupleId}:${day}`)` through
 * `roll`, which is the mixer `raidStats.ts` and `gear.ts` already use for
 * "stable across devices and releases, different per id". Both phones still
 * agree, because both know the coupleId; different couples no longer read in
 * chorus.
 *
 * `pickForDay` is untouched and keeps its five callers. A second seeding rule
 * living beside it rather than replacing it is deliberate — every existing
 * pick still resolves to exactly what it always did.
 *
 * ## The lock, which decides which lane a line may come from
 *
 * The cycle lanes say cycle things. `CycleLock` guarantees that **nothing
 * behind it is rendered while locked** — not hidden with CSS, not mounted and
 * covered — so a line drawn from `cycle-self` or `cycle-partner` outside that
 * section would walk the one thing the lock exists to keep round the front of
 * it.
 *
 * That is why the lane is chosen by *where the card is*, not by who is
 * looking. `openLanes` is what may be shown anywhere; `lockedLanes` is what
 * may only be shown inside the section. `cyclenudge.ts` already holds this
 * line for push: the partner's copy never names the cycle.
 */

/**
 * One item from a pool, chosen by the couple and the day together.
 *
 * Arithmetic, like `pickForDay`, and for the same reason: no round trip, no
 * stored choice, and reopening a screen does not reshuffle the line you were
 * reading.
 */
export function pickForCouple<T>(
  coupleId: string,
  day: DayKey,
  pool: readonly T[],
): T | undefined {
  if (pool.length === 0) return undefined;
  const index = Math.floor(roll(hash(`${coupleId}:${day}`), 0) * pool.length);
  // `roll` returns [0, 1), so this cannot reach `length` — clamped anyway,
  // because an off-by-one here is an undefined on somebody's screen.
  return pool[Math.min(pool.length - 1, index)];
}

/** The lanes safe to draw from outside `CycleLock`. Never a cycle lane. */
export function openLanes(input: LaneInput): SupportLane[] {
  return lanesFor(input).filter((lane) => lane !== 'cycle-self' && lane !== 'cycle-partner');
}

/** The lanes that may only be drawn from inside the section the lock gates. */
export function lockedLanes(input: LaneInput): SupportLane[] {
  return lanesFor(input).filter((lane) => lane === 'cycle-self' || lane === 'cycle-partner');
}

/**
 * The line for this couple, this day, and these lanes.
 *
 * The lane is picked first and the quote second, both from the same seed but
 * different steps of it — so a couple whose lanes change (somebody answers the
 * gender question, a partner starts tracking) gets a different line rather
 * than the same one relabelled.
 *
 * Returns nothing for an empty lane list, which is what an unpaired phone
 * inside the locked section looks like.
 */
export function sharedQuote(
  coupleId: string,
  day: DayKey,
  lanes: readonly SupportLane[],
): Quote | undefined {
  if (lanes.length === 0) return undefined;
  const seed = hash(`${coupleId}:${day}`);
  const lane = lanes[Math.min(lanes.length - 1, Math.floor(roll(seed, 1) * lanes.length))];
  const pool = quotesFor(lane);
  if (pool.length === 0) return undefined;
  return pool[Math.min(pool.length - 1, Math.floor(roll(seed, 2) * pool.length))];
}

/**
 * The one line of small print this feature carries.
 *
 * Said wherever a cycle-adjacent phrase is, because a warm sentence about a
 * rough day sitting next to a cycle calendar is exactly the context in which
 * somebody might read more into it than is there.
 */
export const ADVISORY = 'Advisory only. Not contraception.';
