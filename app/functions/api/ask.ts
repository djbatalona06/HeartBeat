import { authenticate, json, type Env } from './_lib';

/**
 * A question about the couple's own record, answered from it.
 *
 * This is what the command menu falls back to when nothing matches a route.
 * "No results" is the least useful thing a palette can say; "when did we last
 * do legs?" is a question the database can actually answer.
 *
 * The shape matters more than the model. What goes to the model is a small,
 * already-summarised set of counts and dates — how many workouts this month,
 * when the last one was, the active quest's name — assembled here by SQL. Not
 * the notes, not the mood values, not the chat, not the cycle. So the answer is
 * grounded in the couple's record without the record being handed over, and a
 * prompt injection in a note cannot reach the model because no note does.
 */

const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_QUESTION = 200;
const WINDOW_DAYS = 60;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);
  if (!env.AI) return json({ error: 'asking is not available on this deploy' }, 503);

  const body = (await request.json().catch(() => ({}))) as { question?: unknown };
  const question =
    typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  if (!question) return json({ error: 'ask something' }, 400);

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  // Counts and dates only. Deliberately never `payload`: the day log holds what
  // people wrote, and this feature does not need it to answer what it answers.
  const { results: byKind } = await env.DB.prepare(
    `SELECT kind, COUNT(*) AS n, MAX(day) AS last_day
       FROM entries WHERE couple_id = ? AND day >= ?
      GROUP BY kind`,
  )
    .bind(caller.coupleId, since)
    .all<{ kind: string; n: number; last_day: string }>();

  // Quests and achievements are deliberately absent: they live only in Dexie
  // on each phone and were never synced to D1, so there is nothing here to read.
  // Better to answer from less than to query a table that does not exist.
  const pet = await env.DB.prepare('SELECT level, xp FROM pets WHERE couple_id = ?')
    .bind(caller.coupleId)
    .first<{ level: number; xp: number }>();

  const boss = await env.DB.prepare(
    'SELECT tier, hp, max_hp, state FROM boss_fights WHERE couple_id = ?',
  )
    .bind(caller.coupleId)
    .first<{ tier: number; hp: number; max_hp: number; state: string }>();

  const study = await env.DB.prepare(
    `SELECT COUNT(*) AS days, COALESCE(SUM(sessions), 0) AS sessions
       FROM study_days WHERE member_id IN (SELECT id FROM members WHERE couple_id = ?)
        AND day >= ?`,
  )
    .bind(caller.coupleId, since)
    .first<{ days: number; sessions: number }>();

  const facts = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    `Covering the last ${WINDOW_DAYS} days.`,
    ...(byKind ?? []).map((r) => `${r.kind}: ${r.n} days logged, most recently ${r.last_day}.`),
    pet ? `Their pet is level ${pet.level} with ${pet.xp} XP.` : '',
    boss ? `Boss fight: tier ${boss.tier}, ${boss.hp} of ${boss.max_hp} HP left, ${boss.state}.` : '',
    study?.sessions
      ? `Study sessions: ${study.sessions} across ${study.days} days.`
      : '',
  ].filter(Boolean);

  let answer: string;
  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'You answer questions about a couple\'s own activity log using only the facts given. ' +
            'If the facts do not cover it, say so plainly in one sentence rather than guessing. ' +
            'Two sentences at most. No preamble.',
        },
        { role: 'user', content: `Facts:\n${facts.join('\n')}\n\nQuestion: ${question}` },
      ],
      max_tokens: 160,
      // Low, because this is a lookup with words around it, not a piece of
      // writing — a creative answer here is a wrong answer.
      temperature: 0.2,
    });
    answer = ((result as { response?: string }).response ?? '').trim();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: `The service did not answer: ${detail}` }, 502);
  }

  if (!answer) return json({ error: 'Nothing came back. Try asking another way.' }, 422);
  return json({ answer });
};
