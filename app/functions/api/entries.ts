import { authenticate, json, type Env } from './_lib';

/**
 * The couple's day log: mood, exercise, cycle, calendar — and workout proof.
 *
 * Mirrors the Worker's /entries so the app can sync same-origin, the way it
 * already does for chat and pairing. Both write the same table through the same
 * token scheme, so which surface serves a given device stays an implementation
 * detail.
 *
 * The payload is opaque JSON on purpose. Every kind the client tracks is one
 * row per member per kind per day, so the shape of what is inside belongs to
 * the domain types and not to a column list that would need a migration each
 * time a field is added.
 *
 * The numbers below are a second copy of `src/domain/media/budget.ts`.
 * `tsconfig.functions.json` includes only `functions/`, so nothing under `src/`
 * is in scope here — `KINDS` has been duplicated across that boundary since the
 * beginning for the same reason. `budget.test.ts` is what keeps the two honest.
 */

/**
 * A hard ceiling on rows per page even when they are all tiny. This used to be
 * the only bound, which was fine while every row was small; with photographs in
 * the same table, 500 rows is 250 MB built in memory on a Worker that has 128.
 * MAX_PULL_BYTES is now the bound that actually binds.
 */
const MAX_ROWS = 500;

/** How many bytes of payload one pull may return. */
const MAX_PULL_BYTES = 2 * 1024 * 1024;

/** A batch big enough to drain a backlog, small enough to bound one statement run. */
const MAX_WRITE = 200;

/** Guards against a runaway payload filling D1 rather than against any real day. */
const MAX_PAYLOAD_BYTES = 64 * 1024;

/**
 * Two proofs at the capture budget (180 KiB of base64 each) plus the JSON
 * around them. Large enough for a real day, small enough to refuse a capture
 * that skipped the downscale ladder.
 */
const MAX_PHOTO_PAYLOAD_BYTES = 512 * 1024;

const KINDS = ['mood', 'exercise', 'cycle', 'work', 'photo'] as const;
type Kind = (typeof KINDS)[number];

function payloadLimit(kind: Kind): number {
  return kind === 'photo' ? MAX_PHOTO_PAYLOAD_BYTES : MAX_PAYLOAD_BYTES;
}

/**
 * The real size of a string on the wire. `String.length` counts UTF-16 code
 * units: an emoji is two units and four bytes, so a `.length` ceiling can be
 * overshot by 4x. TextEncoder is exact.
 */
const encoder = new TextEncoder();
function utf8Bytes(value: string): number {
  return encoder.encode(value).length;
}

interface Incoming {
  id?: unknown;
  kind?: unknown;
  day?: unknown;
  payload?: unknown;
  updatedAt?: unknown;
}

interface Row {
  id: string;
  member_id: string;
  kind: string;
  day: string;
  payload: string;
  updated_at: number;
}

/** Why one entry in a batch was not written. Reported, never thrown. */
interface Rejection {
  id: string;
  reason: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const raw = Number(new URL(request.url).searchParams.get('since') ?? 0);
  const since = Number.isFinite(raw) && raw > 0 ? raw : 0;

  // Both members, because the point of the couple is that each can see the
  // other's day. Scoped to the couple, which is the only scope there is.
  //
  // `id` breaks the tie so the two statements below walk the rows in the same
  // order; without it SQLite is free to return rows sharing an `updated_at` in
  // different orders, and the sizes measured in the first pass would belong to
  // different rows than the second pass returns.
  const ordered = `FROM entries WHERE couple_id = ? AND updated_at > ?
                    ORDER BY updated_at ASC, id ASC`;

  // The page is sized before it is fetched. Trimming an already-loaded result
  // set bounds only the response: `LIMIT 500` on a table holding photographs is
  // a quarter of a gigabyte handed to a Worker that has 128 MB, and it is D1
  // and the runtime that fail, not this loop. Asking for lengths first costs
  // one extra round trip and is the only thing that actually bounds memory.
  // `CAST(payload AS BLOB)` is what makes `length` count bytes rather than
  // characters — the same UTF-8 bytes the write path measures.
  const sized = await env.DB.prepare(
    `SELECT updated_at, length(CAST(payload AS BLOB)) AS bytes ${ordered} LIMIT ?`,
  )
    .bind(caller.coupleId, since, MAX_ROWS)
    .all<{ updated_at: number; bytes: number }>();

  const sizes = sized.results ?? [];

  // Bounded by bytes, not only by count. The first row is always taken even
  // when it is over budget on its own: a page that comes back empty while rows
  // are waiting leaves the cursor where it is, and the client asks for the same
  // page forever without ever making progress.
  let take = 0;
  let bytes = 0;
  for (const s of sizes) {
    if (take && bytes + s.bytes > MAX_PULL_BYTES) break;
    take += 1;
    bytes += s.bytes;
  }

  // Never cut in the middle of rows sharing one `updated_at`. The cursor is
  // that timestamp and the next pull asks for `> cursor`, so a row left behind
  // on this side of the cut is a row no request will ever ask for again — it is
  // skipped silently, and forever.
  //
  // This can carry the page past the budget, and that is the intended trade:
  // a tie means rows written inside the same millisecond, which is a handful
  // here, and going a little over is recoverable where losing a day is not.
  // Mirrors `pageWithinBudget` in `src/domain/media/budget.ts`, which is where
  // the rule is tested.
  while (take && take < sizes.length && sizes[take].updated_at === sizes[take - 1].updated_at) {
    bytes += sizes[take].bytes;
    take += 1;
  }

  const page = take
    ? ((
        await env.DB.prepare(
          `SELECT id, member_id, kind, day, payload, updated_at ${ordered} LIMIT ?`,
        )
          .bind(caller.coupleId, since, take)
          .all<Row>()
      ).results ?? [])
    : [];

  const entries = page.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    kind: r.kind,
    day: r.day,
    payload: JSON.parse(r.payload) as unknown,
    updatedAt: r.updated_at,
    mine: r.member_id === caller.memberId,
  }));

  return json({
    entries,
    // The client's next cursor. Taken from the rows rather than from the clock,
    // so a device whose clock is off does not skip the rows it just missed.
    cursor: entries.length ? entries[entries.length - 1].updatedAt : since,
    // More is now either bound: a full page by count, or a page cut short
    // because the next row would not fit in the byte budget.
    more: sizes.length === MAX_ROWS || take < sizes.length,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = (await request.json().catch(() => ({}))) as { entries?: unknown };
  const incoming = Array.isArray(body.entries) ? (body.entries as Incoming[]) : [];
  if (!incoming.length) return json({ ok: true, written: 0, rejected: [] });
  if (incoming.length > MAX_WRITE) return json({ error: 'too many entries' }, 413);

  /**
   * A bad entry is reported, not thrown.
   *
   * This used to return 400 or 413 for the whole batch on the first row it did
   * not like. The client throws on any non-2xx and only advances its watermark
   * after a clean push, so one row the server would never accept — an oversize
   * photograph, a day string from a bug — stopped mood, cycle and the calendar
   * from syncing on that device, permanently and with nothing shown to the
   * person using it. Naming the row instead lets the client skip that one and
   * carry the rest.
   */
  const rows: Array<{ id: string; kind: Kind; day: string; payload: string; updatedAt: number }> = [];
  const rejected: Rejection[] = [];

  for (const e of incoming) {
    // The id is what the client needs to skip the row, so a batch that cannot
    // even be attributed is the one thing still worth refusing outright.
    if (typeof e.id !== 'string' || !e.id) return json({ error: 'id required' }, 400);
    const kind = e.kind as Kind;
    if (!KINDS.includes(kind)) {
      rejected.push({ id: e.id, reason: `unknown kind: ${String(e.kind)}` });
      continue;
    }
    if (typeof e.day !== 'string' || !DAY.test(e.day)) {
      rejected.push({ id: e.id, reason: 'bad day' });
      continue;
    }
    const updatedAt = Number(e.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
      rejected.push({ id: e.id, reason: 'bad updatedAt' });
      continue;
    }
    const payload = JSON.stringify(e.payload ?? null);
    const size = utf8Bytes(payload);
    if (size > payloadLimit(kind)) {
      rejected.push({ id: e.id, reason: `payload too large: ${size} > ${payloadLimit(kind)}` });
      continue;
    }
    rows.push({ id: e.id, kind, day: e.day, payload, updatedAt });
  }

  // Last write wins, decided by the row's own updatedAt rather than by arrival
  // order: two phones syncing after a flight would otherwise let the slower
  // connection overwrite the newer edit.
  if (rows.length) {
    await env.DB.batch(
      rows.map((r) =>
        env.DB.prepare(
          `INSERT INTO entries (id, couple_id, member_id, kind, day, payload, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(member_id, kind, day) DO UPDATE SET
             payload = excluded.payload, updated_at = excluded.updated_at
             WHERE excluded.updated_at > entries.updated_at`,
        ).bind(r.id, caller.coupleId, caller.memberId, r.kind, r.day, r.payload, r.updatedAt),
      ),
    );
  }

  return json({ ok: true, written: rows.length, rejected });
};
