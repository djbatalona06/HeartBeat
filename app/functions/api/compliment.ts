import { authenticate, json, type Env } from './_lib';

/**
 * Three things one person might say to the other, for them to pick from.
 *
 * Modelled on transcribe.ts, including its staged errors: "the model is down"
 * and "nothing usable came back" lead to different next steps, and neither of
 * them is "compliment failed".
 *
 * **It returns candidates and stops.** Nothing here sends anything. A person
 * picks a line, or edits it, or ignores all three and writes their own, and
 * only then does /api/nudges deliver it. A generated message sent without
 * anyone choosing it is a bot texting your partner, which is the opposite of
 * the feature.
 *
 * What goes to the model is a tone, a name, and at most a couple of coarse
 * signals the client chose to send — a streak length, a quest name, a direction
 * of travel. Never the mood log, never a note, never the cycle. The line should
 * sound like them, and that does not require handing over what they wrote.
 *
 * The rules, the cleaning and the prompt live in
 * `app/src/domain/compliment/tone.ts`, which is tested. They are restated here
 * because tsconfig.functions.json includes only `functions/`.
 */

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

const MAX_COMPLIMENT = 160;
const MIN_COMPLIMENT = 8;
const MAX_PET_NAME = 24;
const MAX_BLOCKED = 30;
const WANTED = 3;

const TONE_BRIEF: Record<string, string> = {
  tender: 'warm and sincere, the kind of thing said quietly',
  playful: 'teasing and affectionate, the way close people talk',
  funny: 'genuinely funny, and still kind — the joke is never at their expense',
  proud: 'admiring, about something they have actually been doing',
};

/** Generation costs money to serve and is gated like dictation already is. */
const MAX_PER_DAY = 40;

type Stage = 'auth' | 'input' | 'rate' | 'model' | 'empty';

function fail(stage: Stage, error: string, status: number): Response {
  return json({ stage, error }, status);
}

function cleanCandidate(raw: string): string | null {
  let line = raw.trim();
  line = line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '');
  line = line.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  line = line.split('\n')[0].trim();
  if (line.length < MIN_COMPLIMENT || line.length > MAX_COMPLIMENT) return null;
  return line;
}

function isBlocked(line: string, blocked: string[]): boolean {
  const haystack = line.toLowerCase();
  return blocked.some((w) => {
    const needle = w.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return fail('auth', 'This device is not paired yet.', 401);
  if (!env.AI) return fail('model', 'Suggestions are not available on this deploy.', 503);

  const body = (await request.json().catch(() => ({}))) as {
    tone?: unknown;
    petName?: unknown;
    blocked?: unknown;
    workoutStreak?: unknown;
    questName?: unknown;
    moodTrend?: unknown;
    day?: unknown;
  };

  const tone = typeof body.tone === 'string' && TONE_BRIEF[body.tone] ? body.tone : 'tender';
  const petName =
    typeof body.petName === 'string' ? body.petName.trim().slice(0, MAX_PET_NAME) : '';
  const blocked = Array.isArray(body.blocked)
    ? body.blocked.filter((w): w is string => typeof w === 'string').slice(0, MAX_BLOCKED)
    : [];

  // The sender's phone knows what day it is for them; the server does not.
  const day = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
    ? body.day
    : new Date().toISOString().slice(0, 10);

  const used = await env.DB.prepare(
    'SELECT asked FROM compliment_usage WHERE member_id = ? AND day = ?',
  )
    .bind(caller.memberId, day)
    .first<{ asked: number }>();
  if ((used?.asked ?? 0) >= MAX_PER_DAY) {
    return fail('rate', 'That is a lot of sweet things for one day. Try again tomorrow.', 429);
  }

  const lines = [
    'Write three different short messages from one partner to the other in a long-term relationship.',
    `Tone: ${TONE_BRIEF[tone]}.`,
    petName ? `They call them "${petName}". Use it in at most one of the three.` : 'Use no name.',
  ];
  if (typeof body.workoutStreak === 'number' && body.workoutStreak >= 3) {
    lines.push(`They have worked out ${Math.floor(body.workoutStreak)} days running.`);
  }
  if (typeof body.questName === 'string' && body.questName.trim()) {
    lines.push(`They are partway through a shared goal called "${body.questName.trim().slice(0, 60)}".`);
  }
  if (body.moodTrend === 'down') {
    lines.push('They have had a harder week than usual. Be warm about it without mentioning it directly.');
  }
  lines.push(
    'Rules: one sentence each. Under 160 characters. Specific, not greeting-card.',
    'No emoji. No quotation marks. No numbering. Return exactly three lines, nothing else.',
  );

  let text: string;
  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'You help someone say something kind to their partner in their own words. ' +
            'You never write anything cruel, sexual, or backhanded. Plain, specific, human.',
        },
        { role: 'user', content: lines.join('\n') },
      ],
      max_tokens: 220,
      // Three candidates that read the same are a choice in name only.
      temperature: 0.9,
    });
    text = (result as { response?: string }).response ?? '';
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return fail('model', `The suggestion service did not answer: ${detail}`, 502);
  }

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of text.split('\n')) {
    const line = cleanCandidate(raw);
    if (!line || isBlocked(line, blocked)) continue;
    const fingerprint = line.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    candidates.push(line);
    if (candidates.length === WANTED) break;
  }

  if (candidates.length === 0) {
    // A real outcome, not a server fault: everything came back blocked, empty,
    // or too long. The screen says so and the person writes their own.
    return fail('empty', 'Nothing good came back this time. Try again, or write your own.', 422);
  }

  // Counted only once something usable came back: an outage should not spend
  // someone's allowance.
  await env.DB.prepare(
    `INSERT INTO compliment_usage (member_id, day, asked) VALUES (?, ?, 1)
     ON CONFLICT(member_id, day) DO UPDATE SET asked = asked + 1`,
  )
    .bind(caller.memberId, day)
    .run();

  return json({ candidates });
};
