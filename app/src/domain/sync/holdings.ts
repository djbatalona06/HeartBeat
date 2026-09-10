import type { Avatar, Task } from '../rpg/types';
import type { InventoryItem } from '../rpg/inventory';
import type { PetInstance } from '../rpg/pets';
import type { Quest } from '../types';

/**
 * Turning the RPG layer into rows and back.
 *
 * `entries` sync carries everything keyed by a *day*. This is everything keyed
 * by a *row*: gear inventory, hatched companions, the coin-and-XP sheet, tasks,
 * and the weekly quest. All of it lived only on the phone that made it, so a
 * reinstall — or the GitHub recovery added alongside this — brought back the
 * couple's whole history and none of their possessions.
 *
 * Pure. It maps between local rows and the wire and decides which of two
 * versions wins; the Dexie reads and the fetches live in `pwa/holdingsSync.ts`.
 * The split is the usual one in this repository, and here it earns itself
 * twice: the *ownership* rule below is a security property, and a security
 * property that can only be exercised through a network round trip is one that
 * does not get exercised.
 */

export const HOLDING_KINDS = ['inventory', 'pet', 'avatar', 'quest', 'task'] as const;
export type HoldingKind = (typeof HOLDING_KINDS)[number];

/**
 * The one kind that belongs to the couple rather than to one of them.
 *
 * A quest is taken on together, either of you can start or retire it, and both
 * devices have to converge on the same one. Everything else has exactly one
 * writer — your own inventory, your own companions, your own sheet, your own
 * list — which is what makes last-write-wins provably safe for them rather
 * than merely usually right: with a single writer there is no second version
 * to lose. Kept as a list rather than a boolean so adding a second shared kind
 * is a one-line change in the place that already explains the rule.
 */
export const SHARED_KINDS: readonly HoldingKind[] = ['quest'];

export function isShared(kind: HoldingKind): boolean {
  return SHARED_KINDS.includes(kind);
}

/** A local row of any of the five kinds. All of them carry `updatedAt`. */
export type HoldingRow = InventoryItem | PetInstance | Avatar | Quest | Task;

export interface WireHolding {
  /** The local primary key, carried through unchanged. */
  id: string;
  kind: HoldingKind;
  payload: unknown;
  updatedAt: number;
}

export interface PulledHolding extends WireHolding {
  memberId: string;
  /** Resolved server-side, so applying does not need to load our own id. */
  mine: boolean;
}

/**
 * The local primary key for a row of each kind.
 *
 * Not uniform, and that is why this exists rather than reading `row.id`
 * everywhere: an `Avatar` is keyed by `memberId` and has no `id` at all, and a
 * `PetInstance` has both. Reading the wrong one would push a row the server
 * stores under a key the puller can never match to anything local, which
 * presents as "my gear came back and my coins did not".
 */
export function keyOf(kind: HoldingKind, row: HoldingRow): string {
  if (kind === 'avatar') return (row as Avatar).memberId;
  return (row as { id: string }).id;
}

/**
 * A row's last-write time.
 *
 * Four of the five kinds have carried `updatedAt` since they were written.
 * `Quest` did not — it had no reason to until it started syncing — so rows
 * from before that stamp exists read as 0 here rather than as `undefined`
 * propagating into every comparison below and making all of them false in ways
 * that are hard to see.
 *
 * Reading a missing stamp as 0 means a quest finished before this shipped
 * stays on the phone that finished it: `pendingSince` sends rows *newer* than
 * the watermark, and nothing is newer than 0. An active quest is rewritten by
 * every progress measurement, so it picks up a real stamp within a day without
 * anybody doing anything, which is the case that actually matters.
 */
export function stampOf(row: HoldingRow): number {
  return row.updatedAt ?? 0;
}

export function toWire(kind: HoldingKind, row: HoldingRow): WireHolding {
  return { id: keyOf(kind, row), kind, payload: row, updatedAt: stampOf(row) };
}

/**
 * Should this pulled row replace the local one?
 *
 * Two rules, and the order matters.
 *
 * **Ownership first.** A row of a personal kind is only ever written by its
 * own member's device, so a pulled one that is not ours is our *partner's* —
 * their inventory, their sheet — and must never overwrite ours even if it is
 * newer. The server refuses to store such a write, but the client must also
 * refuse to apply one: the pull is a whole-couple feed by design (it is how
 * the partner's own rows reach a device at all), so rows that are not ours
 * arrive on every single sync, legitimately. Treating "arrived" as "applies to
 * me" would have each phone overwriting its own possessions with the other's
 * on every round trip.
 *
 * **Then recency**, which is last-write-wins by the row's own `updatedAt` and
 * not by arrival order — the same rule `/api/entries` follows, for the same
 * reason: two phones syncing after a flight would otherwise let the slower
 * connection win.
 *
 * Strictly greater, never equal. A row that has come back unchanged should be
 * a no-op rather than a write, or every sync would rewrite every row and every
 * live query in the app would re-fire for nothing.
 */
export function shouldApply(
  pulled: PulledHolding,
  local: HoldingRow | undefined,
): boolean {
  if (!isShared(pulled.kind) && !pulled.mine) return false;
  if (!local) return true;
  return pulled.updatedAt > stampOf(local);
}

/**
 * What to send: rows edited since the last push.
 *
 * Strictly greater than the watermark, matching `collectPending` in
 * `pwa/sync.ts`. A row whose `updatedAt` equals the watermark has already been
 * sent — offering it again on every sync forever is the shape of bug that only
 * shows up as a battery complaint.
 */
export function pendingSince(
  kind: HoldingKind,
  rows: readonly HoldingRow[],
  since: number,
): WireHolding[] {
  return rows
    .filter((row) => stampOf(row) > since)
    .map((row) => toWire(kind, row));
}

/**
 * The high-water mark to remember after a round trip.
 *
 * Rows that arrived from the server are, by definition, already on it, so the
 * push watermark steps past them too — otherwise the next sync would send them
 * straight back. Refused rows are included for the same reason `sync.ts`
 * includes them: leaving the mark behind a row the server will never accept
 * offers it first on every sync forever, and queues everything edited after it
 * behind a row that cannot move.
 */
export function highWaterAfter(
  previous: number,
  pushed: readonly WireHolding[],
  pulled: readonly PulledHolding[],
): number {
  let mark = previous;
  for (const row of pushed) mark = Math.max(mark, row.updatedAt);
  for (const row of pulled) mark = Math.max(mark, row.updatedAt);
  return mark;
}
