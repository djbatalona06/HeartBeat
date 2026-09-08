import { authenticate, json, type Env } from './_lib';

/**
 * Where the app's error boundary sends a crash.
 *
 * Authenticated like everything else: an endpoint that accepted anonymous
 * writes would be an unauthenticated way into the couple's database, which is a
 * worse problem than an unreported crash. An unpaired phone therefore reports
 * nothing, which is fine — it has no partner's data to lose either.
 *
 * Every field is clamped rather than rejected. A crash report is the one
 * message that arrives *because* something already went wrong, so it should not
 * be able to fail validation and vanish; an over-long stack is truncated and
 * stored, not 400'd away.
 */

/** Matches pwa/crashReport.ts, which truncates before it posts. */
const MAX_STACK = 4000;
const MAX_MESSAGE = 500;
const MAX_ROUTE = 200;
const MAX_SCOPE = 40;

/**
 * A loop that throws on every render could otherwise write a row per frame.
 * One member's crashes are capped per minute; past that the report is accepted
 * and dropped, because telling a broken client to retry is not helpful.
 */
const MAX_PER_MINUTE = 12;

function clamp(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'unreadable body' }, 400);

  const message = clamp(body.message, MAX_MESSAGE);
  if (!message) return json({ error: 'message required' }, 400);

  const receivedAt = Date.now();
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM client_errors WHERE member_id = ? AND received_at > ?',
  )
    .bind(caller.memberId, receivedAt - 60_000)
    .first<{ n: number }>();
  // Accepted, not stored. The client is not asked to do anything differently.
  if ((recent?.n ?? 0) >= MAX_PER_MINUTE) return json({ ok: true, stored: false });

  const at = typeof body.at === 'number' && Number.isFinite(body.at) ? body.at : receivedAt;

  await env.DB.prepare(
    `INSERT INTO client_errors
       (id, couple_id, member_id, scope, message, stack, component_stack, route, at, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      caller.coupleId,
      caller.memberId,
      clamp(body.scope, MAX_SCOPE) || 'unknown',
      message,
      clamp(body.stack, MAX_STACK),
      clamp(body.componentStack, MAX_STACK),
      clamp(body.route, MAX_ROUTE),
      at,
      receivedAt,
    )
    .run();

  return json({ ok: true, stored: true });
};
