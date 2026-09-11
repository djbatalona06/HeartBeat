import type { Avatar, Cheer, LifeEvent, Task } from '../rpg/types';
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

export const HOLDING_KINDS = [
  'inventory', 'pet', 'avatar', 'quest', 'task', 'lifeEvent', 'cheer',
] as const;
export type HoldingKind = (typeof HOLDING_KINDS)[number];

/**
 * Two properties that used to be one list, and are not the same property.
 *
 * **Writable** — either of you may overwrite the row. Only the quest: it is
 * taken on together, either of you can start or retire it, and both devices
 * have to converge on the same one. The rule is enforced server-side by the
 * `excluded.kind IN ('quest')` clause of `UPSERT_SQL`; this list is its client
 * mirror, and a test in `worker/src/holdings.test.ts` pins the two together by
 * parsing that clause rather than restating it.
 *
 * **Visible** — a pulled row of this kind is applied here even though our
 * partner wrote it. Every writable kind is visible. Life events and cheers are
 * visible *without* being writable: they are append-only and have exactly one
 * writer for life, so there is no second version to lose and nothing for the
 * other phone to overwrite.
 *
 * Splitting them is the whole reason life events could join at all. Adding a
 * kind to the visible list is a display decision. Adding one to the writable
 * list is a security decision — it hands the other phone the right to rewrite
 * rows it did not make. Keeping them one list made the second look like the
 * first, which is exactly how that right gets granted by accident.
 */
export const PARTNER_WRITABLE_KINDS: readonly HoldingKind[] = ['quest'];

export const PARTNER_VISIBLE_KINDS: readonly HoldingKind[] = [
  'quest', 'lifeEvent', 'cheer',
];

export function isPartnerWritable(kind: HoldingKind): boolean {
  return PARTNER_WRITABLE_KINDS.includes(kind);
}

export function isPartnerVisible(kind: HoldingKind): boolean {
  return PARTNER_VISIBLE_KINDS.includes(kind);
}

/** A local row of any of the seven kinds. All of them carry `updatedAt`. */
export type HoldingRow =
  | InventoryItem | PetInstance | Avatar | Quest | Task | LifeEvent | Cheer;

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
 *
 * `LifeEvent` is the second kind to arrive this way and the story is the same:
 * it carried `grantedAt` and no write time until it started syncing, so events
 * granted before this stay on the phone that granted them.
 *
 * Reading `grantedAt` instead, for those, would be worse than not sending them.
 * This stamp is what the server stores and what the *partner's* pull cursor is
 * compared against, so a row written with an event time from three weeks ago
 * lands below a cursor that has already moved past it and is never served to
 * the other phone at all — present on the server, invisible to the person it is
 * addressed to.
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
 * **Visibility first.** The pull is a whole-couple feed by design — it is how
 * the partner's rows reach a device at all — so rows that are not ours arrive
 * on every single sync, legitimately, and most of them are none of our
 * business. A partner's inventory or sheet is theirs to hold; treating
 * "arrived" as "applies to me" would have each phone overwrite its own
 * possessions with the other's on every round trip. So a row that is not ours
 * is dropped unless its kind is one both of you are meant to see.
 *
 * Note what this clause is and is not. It decides whether we *display* a
 * partner's row, not whether they may *overwrite* ours — that is
 * `PARTNER_WRITABLE_KINDS`, enforced server-side, and a life event passes this
 * check while still failing that one.
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
  if (!isPartnerVisible(pulled.kind) && !pulled.mine) return false;
  if (!local) return true;
  return pulled.updatedAt > stampOf(local);
}

/**
 * Whose row the server will record this as, and therefore whose device may
 * offer it.
 *
 * Not `row.memberId` for every kind, which is the trap this exists to name: a
 * Good Vibe's `memberId` is who *receives* it and its `fromMemberId` is who
 * wrote it. A device that offered rows by recipient would push its partner's
 * grants back up under its own id, which the endpoint refuses silently — the
 * upsert's member check fails, nothing changes, and the row still counts itself
 * as written, on every sync for the life of the couple.
 *
 * `undefined` means the row is the couple's and either of them may write it,
 * which is the quest and nothing else.
 */
export function writerOf(kind: HoldingKind, row: HoldingRow): string | undefined {
  if (isPartnerWritable(kind)) return undefined;
  if (kind === 'lifeEvent') {
    const event = row as LifeEvent;
    return event.fromMemberId ?? event.memberId;
  }
  return (row as { memberId?: string }).memberId;
}

/**
 * The rows of a batch this device is entitled to push.
 *
 * `highWaterAfter` already folds pulled rows into the push watermark, so in
 * practice an applied partner row is not offered back anyway. That is a
 * load-bearing invariant defended by nothing local to the caller, though, and
 * it breaks the moment anyone reasons about the two watermarks separately.
 * One filter, applied to every kind, is cheaper than remembering why it holds.
 */
export function mineToPush(
  kind: HoldingKind,
  rows: readonly HoldingRow[],
  memberId: string,
): HoldingRow[] {
  return rows.filter((row) => {
    const writer = writerOf(kind, row);
    return writer === undefined || writer === memberId;
  });
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
