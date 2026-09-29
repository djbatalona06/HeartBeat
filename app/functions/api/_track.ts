import type { Env } from './_lib';

/**
 * Anonymous, server-side product counts.
 *
 * ## What this is, and the line it does not cross
 *
 * The app ships no analytics of its own: no script, no cookie, no client id.
 * These events are sent from the Pages Functions, about requests they were
 * already serving, so the only thing that leaves is a count or an enum that the
 * server already knew. What it is for is the question a two-person app cannot
 * answer by asking: which parts do people actually use, and where does the app
 * fall over.
 *
 * **Never send content.** No mood, cycle, exercise, chat text, names, photos,
 * timezone, tokens or invite codes. `scrub` enforces this at the last step, so a
 * property added carelessly later is dropped rather than shipped.
 *
 * ## Optional, like everything else that needs a key
 *
 * With `POSTHOG_KEY` or `POSTHOG_SALT` unset this does nothing at all, and
 * `/api/health` reports that as a boolean. Without the salt nothing is sent,
 * because an unsalted hash of a member id is a stable identifier anybody
 * holding the id list could reverse.
 */

export type TrackEvent =
  | 'pair_started'
  | 'pair_completed'
  | 'pair_failed'
  | 'pair_left'
  | 'study_linked'
  | 'study_unlinked'
  | 'study_session_credited'
  | 'study_session_duplicate'
  | 'entries_synced'
  | 'holdings_synced'
  | 'message_sent'
  | 'compliment_sent'
  | 'photo_uploaded'
  | 'push_subscribed'
  | 'ask_used'
  | 'transcribe_used'
  | 'client_error';

export type TrackValue = string | number | boolean;

export interface TrackContext {
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

export interface TrackIds {
  memberId?: string;
  coupleId?: string;
}

const DEFAULT_HOST = 'https://us.i.posthog.com';

/** A property whose name contains any of these is content or a credential, never a count. */
const FORBIDDEN_KEY_PARTS = [
  'token', 'invite', 'body', 'payload', 'name', 'note', 'text', 'email',
  'photo', 'timezone', 'time_zone', 'message', 'secret', 'password',
];

/** Enums and counts are short. Anything longer is prose that should never have got here. */
const MAX_STRING_LENGTH = 64;

/**
 * Keeps only counts, flags and short enums, under names that are not content.
 * Exported because this is the guard the privacy claim rests on, so it is tested.
 */
export function scrub(props: Record<string, unknown>): Record<string, TrackValue> {
  const out: Record<string, TrackValue> = {};
  for (const [key, value] of Object.entries(props)) {
    const lowered = key.toLowerCase();
    if (FORBIDDEN_KEY_PARTS.some((part) => lowered.includes(part))) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && value.length <= MAX_STRING_LENGTH) out[key] = value;
  }
  return out;
}

/** A stable, salted, one-way id. The first 32 hex characters are plenty to tell people apart. */
export async function anonymousId(salt: string, id: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${id}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export interface Configured {
  key: string;
  salt: string;
  host: string;
  environment: string;
}

export function configured(env: Env): Configured | null {
  const key = env.POSTHOG_KEY?.trim();
  const salt = env.POSTHOG_SALT?.trim();
  if (!key || !salt) return null;
  return {
    key,
    salt,
    host: env.POSTHOG_HOST?.trim() || DEFAULT_HOST,
    environment: env.POSTHOG_ENV?.trim() || 'production',
  };
}

async function send(
  settings: Configured,
  event: TrackEvent,
  ids: TrackIds,
  props: Record<string, TrackValue>,
): Promise<void> {
  const distinctId = ids.memberId ? await anonymousId(settings.salt, ids.memberId) : 'anonymous';
  const groups = ids.coupleId ? { couple: await anonymousId(settings.salt, ids.coupleId) } : undefined;
  await fetch(`${settings.host}/i/v0/e/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: settings.key,
      event,
      distinct_id: distinctId,
      properties: {
        ...props,
        // Counts only: no person profile is built from a member id.
        $process_person_profile: false,
        ...(groups ? { $groups: groups } : {}),
        $lib: 'heartbeat-server',
        app_env: settings.environment,
      },
      timestamp: new Date().toISOString(),
    }),
  });
}

/**
 * Fire and forget. Runs after the response is on its way (`waitUntil`), and a
 * failure is swallowed: a broken analytics endpoint must never be a broken app.
 */
export function track(
  context: TrackContext,
  event: TrackEvent,
  ids: TrackIds = {},
  props: Record<string, unknown> = {},
): void {
  const settings = configured(context.env);
  if (!settings) return;
  context.waitUntil(send(settings, event, ids, scrub(props)).catch(() => undefined));
}
