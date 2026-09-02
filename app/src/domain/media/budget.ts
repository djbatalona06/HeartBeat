/**
 * How much of one sync payload each kind of entry is allowed to be.
 *
 * The day log used to be four kinds of small JSON, and one ceiling covered all
 * of them. Workout proof breaks that: a downscaled JPEG is 180 KiB of base64
 * where a mood is a few hundred bytes, and two of them travel together. Rather
 * than raise the single ceiling to the largest thing that can ride on it —
 * which would let a runaway note fill D1 — each kind is given the budget its
 * own shape needs.
 *
 * This module is pure and knows nothing about the network. The endpoint keeps
 * its own copy of these numbers because `tsconfig.functions.json` includes only
 * `functions/`, so nothing under `src/` is in scope there; `KINDS` is already
 * duplicated across that boundary for the same reason. The test below is what
 * keeps the two copies honest about the one thing that matters — that the
 * client never offers a row the server is bound to refuse.
 */

/**
 * Every kind that can travel as an entry.
 *
 * `photo` is last because it is newest: the server's CHECK constraint is
 * extended in `0005_entry_kinds.sql`, and a client sending `photo` to a Worker
 * that has not run that migration gets a rejection rather than a broken table.
 */
export const ENTRY_KINDS = ['mood', 'exercise', 'cycle', 'work', 'photo'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/**
 * The original ceiling, kept exactly where it was for the four kinds that have
 * always lived under it. It guards against a runaway payload rather than
 * against any real day: a mood with every field filled is under a kilobyte.
 */
export const DEFAULT_PAYLOAD_BYTES = 64 * 1024;

/**
 * Two proofs at `PHOTO_BUDGET_BYTES` (180 KiB each, from
 * `features/exercise/photo.ts`) is 360 KiB of base64, plus the JSON around it.
 * 512 KiB clears that with room to spare and still refuses anything that could
 * only have come from a bug — a full-resolution capture that skipped the
 * downscale ladder is several times this.
 */
export const PHOTO_PAYLOAD_BYTES = 512 * 1024;

/** What one entry of this kind may weigh, measured as UTF-8 bytes of JSON. */
export function payloadLimit(kind: EntryKind): number {
  return kind === 'photo' ? PHOTO_PAYLOAD_BYTES : DEFAULT_PAYLOAD_BYTES;
}

/**
 * The real size of a string on the wire.
 *
 * `String.length` counts UTF-16 code units, which is not what anyone is
 * charged. An emoji is one or two units and four bytes; a note in Japanese is
 * one unit and three bytes per character. Measuring with `.length` therefore
 * under-counts by up to 4x, which is how a "64 KiB" ceiling passes a quarter of
 * a megabyte. TextEncoder is exact and exists in both runtimes.
 */
const encoder = new TextEncoder();
export function utf8Bytes(value: string): number {
  return encoder.encode(value).length;
}

/** Does this serialised payload fit under its kind's ceiling? */
export function withinPayloadLimit(kind: EntryKind, serialised: string): boolean {
  return utf8Bytes(serialised) <= payloadLimit(kind);
}

/**
 * How many bytes one pull may return.
 *
 * The pull used to be bounded by a row count — 500 — which was a fine proxy
 * while every row was small. With photographs in the same table it stops being
 * one: 500 photo rows is 250 MB, and the response would be built in memory on
 * a Worker with 128 MB of it. A byte budget bounds the thing that actually
 * costs, and a page of small rows still comes back in one round trip.
 */
export const PULL_BYTE_BUDGET = 2 * 1024 * 1024;

/**
 * A hard ceiling on rows per page even when they are all tiny, so one pull
 * cannot serialise an unbounded number of them. This is the old `MAX_ROWS`,
 * kept as the second of the two bounds rather than the only one.
 */
export const PULL_MAX_ROWS = 500;

export interface Measured {
  /** The row's own size on the wire. */
  bytes: number;
}

/** A row the pull is deciding whether to include: its size and its cursor. */
export interface Pageable extends Measured {
  /** The value the cursor is taken from. Rows sharing one cannot be split. */
  updatedAt: number;
}

/**
 * Take rows until the next one would not fit.
 *
 * Always yields at least one row, even when that row is over budget on its own.
 * A page that can come back empty while rows are waiting is a page that never
 * advances: the cursor would not move, the client would ask again from the same
 * place, and the sync would spin forever without making progress. Serving the
 * oversize row alone is the one outcome that keeps the cursor moving.
 */
export function takeWithinBudget<T extends Measured>(
  rows: readonly T[],
  budget: number = PULL_BYTE_BUDGET,
): T[] {
  const out: T[] = [];
  let total = 0;
  for (const row of rows) {
    if (out.length && total + row.bytes > budget) break;
    out.push(row);
    total += row.bytes;
  }
  return out;
}

/**
 * How many rows one pull may serve, given each row's size and timestamp.
 *
 * Two rules, and the second is not an optimisation.
 *
 * The budget stops the page where the next row would overrun it, with the
 * always-take-one rule of `takeWithinBudget` — a page that comes back empty
 * while rows are waiting never advances the cursor.
 *
 * Then the cut is pushed forward off any tie. The cursor handed back to the
 * client is the last served row's `updatedAt`, and the next pull asks for
 * `updated_at > cursor`, so a row sharing that timestamp but left behind is a
 * row no request will ever ask for again — it is skipped silently and forever.
 * Serving the whole run is the only way the cursor can move without losing it.
 *
 * That extension can carry the page past the budget. It is the lesser evil: in
 * this data a tie means rows written within the same millisecond, which is a
 * handful, and going a little over is recoverable where dropping a day's entry
 * is not.
 */
export function pageWithinBudget(
  rows: readonly Pageable[],
  budget: number = PULL_BYTE_BUDGET,
): number {
  let take = 0;
  let total = 0;
  for (const row of rows) {
    if (take && total + row.bytes > budget) break;
    take += 1;
    total += row.bytes;
  }
  while (take && take < rows.length && rows[take].updatedAt === rows[take - 1].updatedAt) {
    take += 1;
  }
  return take;
}
