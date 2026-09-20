/**
 * Where tapping a notification actually goes.
 *
 * ## The disagreement this settles
 *
 * `pwa/sw.ts` used to build the target inline as `` `${scope}#${path}` ``,
 * which is right only for a path that carries no hash of its own. Four things
 * write `scheduled_nudges.path`, and they did not agree on that:
 *
 * - `worker/src/index.ts` writes `/boss` — no hash.
 * - `domain/notify/schedule.ts` writes `/#/mood` and `/#/`.
 * - `functions/api/cyclenudge.ts` writes `/#/mood`, `/#/activities/support`.
 * - `functions/api/compliments.ts` writes `/#/mood`.
 *
 * So three of the four resolved to `host/#/#/mood` — a route the app does not
 * have — and every daily reminder, cycle nudge and compliment landed on
 * `RouteNotFound` instead of the screen it was about. Only the boss nudge
 * worked, because it was the only one written without the hash.
 *
 * Normalising here rather than in the four producers is deliberate: rows are
 * already sitting in `scheduled_nudges` in both formats, and a migration that
 * rewrote them would still lose whatever a phone posted while it was offline.
 * One reader that accepts both cannot leave a stale row stranded.
 *
 * ## Why this re-validates a path the server already checked
 *
 * `functions/api/nudges.ts` guards its own writes with `inAppPath`, but it is
 * not the only writer — the Worker inserts directly and never calls it — and
 * the rows it guarded were validated by whatever version of that allowlist
 * shipped at the time. A path reaching `clients.openWindow` is an open
 * redirect with a notification as the bait, so the last thing before the
 * navigation checks it too, and anything it does not recognise becomes home
 * rather than an error.
 */

/**
 * The in-app charset, matching the tail of `inAppPath`'s allowlist in
 * `functions/api/nudges.ts`. No dots and no colons, so neither `//host.tld`
 * nor `https://host` can survive it.
 */
const IN_APP = /^\/[A-Za-z0-9/_-]*$/;

/** The longest route worth honouring; the allowlist on the wire caps at 120. */
const MAX_LENGTH = 120;

/**
 * The hash route one stored `path` means, in the one format the router reads.
 *
 * Accepts `/boss` and `/#/boss` alike and answers `/boss` for both. Anything
 * it cannot vouch for answers `/`, which is a screen that always exists.
 */
export function notificationRoute(path: string | undefined | null): string {
  if (typeof path !== 'string') return '/';

  const trimmed = path.trim();
  if (trimmed === '' || trimmed.length > MAX_LENGTH) return '/';

  // The whole point: strip the hash the producers disagree about, so both
  // spellings of the same route reduce to one.
  const bare = trimmed.startsWith('/#') ? trimmed.slice(2) : trimmed;
  const route = bare.startsWith('/') ? bare : `/${bare}`;

  return IN_APP.test(route) ? route : '/';
}

/**
 * The absolute URL to open for a notification.
 *
 * `scope` is `registration.scope`, which the service worker spec guarantees
 * ends in a slash — so this is the app's own origin and base path, and the
 * route only ever reaches it after the `#`.
 */
export function notificationTarget(scope: string, path: string | undefined | null): string {
  return `${scope}#${notificationRoute(path)}`;
}
