# HeartBeat — design

What is built, what is next, and why each piece is shaped the way it is.

## Problem

Two people, two phones, four things worth tracking together: how you feel,
whether you moved, where you are in a cycle, and what the week looks like. Every
app that does one of these does it for one person. The interesting part is not
the tracking — it is that the other person can see it, and that something nags
you both when neither of you has logged anything in three days.

## Why a PWA

The same reason as its sibling `ADHD-helper`: native iOS code cannot run on an
iPhone without an Apple Developer account to sign it. This installs to the Home
Screen, runs offline, and deploys by `git push`.

Two platform limits shape everything downstream:

- **iOS PWAs cannot schedule local notifications.** Web Push works from iOS 16.4,
  but only for Home Screen installs, and it must be *sent from a server*. Hence
  the Worker, and hence the install step being mandatory rather than a nicety.
- **iOS can evict app storage under disk pressure.** IndexedDB is the system of
  record, so the app asks for persistent storage on boot and the server copy is
  the real backstop.

## Architecture

```
app/     Vite + React + TS, Dexie, vite-plugin-pwa   ->  Cloudflare Pages
worker/  Worker + D1, VAPID Web Push                 ->  pairing, sync, delivery
```

The phone renders from IndexedDB and never blocks on the network. The Worker
holds a copy of the shared entries so the other phone can read them, and holds
push subscriptions so reminders can be delivered when the app is closed.

### Layering, as enforced by the code

- `domain/` — pure. No React, no Dexie. Plain data in, plain data out, with
  tests colocated. This is why vitest runs in a `node` environment.
- `db/` — Dexie schema plus `repository.ts`. **Every write goes through the
  repository**; components import those functions and `await` them, and the live
  query re-renders. Nothing in `features/` touches the database directly.
- `features/<name>/XxxPage.tsx` — one page per route, named exports, no default
  exports. Feature-local subcomponents stay in the feature folder; `components/`
  holds only what two or more features use.
- `themes/` — a registry. A new theme is a file in `packs/` and one array entry.
- `pwa/` — all platform edge code: service worker, push, install detection.

Vitest is restricted to `src/**/*.test.ts`. Components are not unit-tested; that
is a decision, not an omission. The logic worth protecting is pure and lives in
`domain/`.

## Pairing

An account system for two people who already know each other is overhead with no
payoff. Instead:

1. First device calls `POST /pair/start`. The Worker creates a couple, a member,
   a bearer token for that device, and a six-character invite code.
2. That code goes in a link. The second device calls `POST /pair/join` with it
   and receives its own member id and token.
3. Both devices now authenticate as `Bearer <token>` and resolve to the same
   couple.

Constraints that matter:

- **Invites expire in fifteen minutes and work exactly once.** A pairing link
  that works forever is a permanent key to the couple's data sitting in a chat
  thread. The cron job deletes expired unconsumed invites.
- **A third join is refused.** A couple is two people; silently allowing a third
  would widen who can read everything with no visible signal.
- **Tokens are stored hashed.** A leaked database should not be a set of logins.
- The invite alphabet omits `I`, `O`, `0` and `1`, because the code has to
  survive being read aloud or retyped when a link fails.

**Phone-number confirmation is deferred.** It needs a paid SMS provider, and for
a two-person app the link flow already does the job. Revisit only if link
sharing turns out to be genuinely awkward in practice.

## Shared data

```sql
entries (id, couple_id, member_id, kind, day, payload, updated_at)
UNIQUE (member_id, kind, day)
```

`kind` is one of `mood | exercise | cycle | work`. The payload is opaque JSON, so
adding a field on the client needs no migration here.

- **One row per member per kind per day.** Logging twice edits; it does not
  stack. A day always has a single answer.
- **Last write wins on `updated_at`,** enforced in the `ON CONFLICT` clause so a
  slow device replaying an old entry cannot clobber a newer one.
- Pull is `GET /entries?since=<ms>`, indexed on `(couple_id, updated_at)`.

**Photographs never leave the phone.** Camera proof and partner photos are data
URIs in IndexedDB. The server stores no image, which keeps it cheap, keeps the
privacy claim in the README true, and avoids R2 entirely.

## Dashboard

Four tiles in a 2×2 grid, plus the pet's XP bar above them.

| Tile | Contents |
|---|---|
| Settings | Pairing state, theme picker, partner name and photo, calendar |
| Exercise | Workout log; camera proof front and back |
| Mood | Vertical 1–10 meters for hunger, joy, moody — both partners |
| Work | Shared calendar, populated by file import |

Meters are vertical rather than horizontal because the point is comparing two
people side by side, and columns compare more readably than stacked bars.

## Cycle

Ported from [lunara](https://github.com/djbatalona06/lunara), which is the
highest-value reuse available: its engine is pure, dependency-free and heavily
tested, including a seeded fuzz audit.

Take:

- `engine/cycle.ts` — `predict()`, fertile window, and `uncertaintyDays` clamped
  to 2–9 days. The clamp matters: a confident-looking single-day prediction from
  three cycles of history is a lie.
- `engine/cycleForecast.ts` — median/MAD forecast with data-quality exclusions.
- The `DailyLog` shape from `db/schema.ts`, narrowed to what this app collects.
  **Keep `checkInComplete`** — without it there is no way to distinguish a
  symptom-free day from a day nobody opened the app, and every downstream
  average is then wrong in a way nobody notices.
- `db/taxonomy.ts` for symptom and mood vocabularies.
- `components/CalendarScreen.tsx` for the month grid and the period-edit mode.

Cycle entries are authored by whichever member has `tracksCycle` and are
readable by both. Prediction stays advisory: lunara's standing disclaimer that
fertility estimates are not contraception carries over verbatim.

## Themes

Five packs. A theme reaches the UI only as CSS custom properties written to
`documentElement`, so components reference `var(--color-accent)` and never
import a theme object — switching theme repaints without re-rendering anything.

`themes/tokens.test.ts` enforces WCAG AA contrast for body text on both the card
surface and the page base, and for accent text on the accent fill. A theme with
unreadable text cannot ship.

Backdrops are procedural canvas animations. They pause on `visibilitychange`,
honour `prefers-reduced-motion`, and damp under Calm mode. Nothing third-party is
bundled; see [NOTICE.md](../NOTICE.md).

## Gamification

Nothing to port — this is new.

```
pets         (couple_id, level, xp, mood, fed_at)
quests       (id, couple_id, template_id, difficulty, target, progress, xp, expires_at)
achievements (id, couple_id, code, xp, unlocked_at)
```

- **XP is shared, not per-person.** One pet, one bar. Competing with your partner
  over a streak counter is the wrong game.
- **Levelling curve** is in `domain/xp.ts`: `100 × 1.35^(n-1)` per level,
  cumulative. Early levels arrive fast enough to be worth chasing; later ones
  still mean something. Tests assert the curve is monotonic, that levelling
  happens exactly at the threshold, and that each level costs more than the last.
- **Quests are templates parameterised by difficulty** — rep ranges, frequency,
  duration — seeded from an onboarding questionnaire so "hard" means something
  different for each couple.
- **A quest pays out once**, on the transition to complete. Overshooting the
  target does not pay twice.
- Pet mood is derived from recent activity, not stored as state to be managed.

## Reminders

Reuses the ADHD-helper delivery shape: the phone computes the next 72 hours of
nudges and POSTs a full replace, so a queued sync always recomputes from current
data rather than replaying a backlog. The Worker cron runs every minute — the
finest granularity Cron Triggers offer, and what keeps a 07:00 reminder landing
at 07:00 rather than up to an hour late.

Web Push is implemented from scratch against WebCrypto (ES256 VAPID, aes128gcm)
because the `web-push` npm package is Node-only and will not run on Workers.

## Time

Days are `YYYY-MM-DD` calendar dates in a named IANA zone, never UTC instants.
`domain/day.ts` does the formatting through `Intl` so there is no DST arithmetic
to get wrong, and `addDays` works in UTC so it cannot drift when the clocks
shift. Both boundaries are covered by tests.

This is what keeps a 7am reminder at 7am year-round. Pinning to a fixed offset
would serve it an hour late for the eight months Pacific is on daylight time.

## Security

- Bearer token per device, compared against a stored SHA-256 hash.
- Origin-restricted CORS in `worker/src/cors.ts`, which **parses URLs rather
  than calling `endsWith`** — `endsWith` would happily accept
  `https://heartbeat.pages.dev.attacker.com`. There is a test for exactly that.
- Wildcards match a single label only, so `a.b.heartbeat.pages.dev` is refused.
- Secrets are set with `wrangler secret put` and never committed.

## Risks

| Risk | Response |
|---|---|
| iOS evicts IndexedDB | Ask for persistent storage; server copy is the backstop |
| A denied notification permission is unrecoverable without reinstall | Explain the stakes before prompting, in the setup guide and in-app |
| Invite link leaks from a chat thread | Fifteen-minute expiry, single use, third join refused |
| Push subscription silently expires | Re-subscribe on launch and re-upload the endpoint |
| Theme added with unreadable text | Contrast enforced in CI by `tokens.test.ts` |
| Photos make sync expensive | Photos never sync; they stay on-device by design |

## Order of work

1. Settings: pairing UI, theme picker, partner display — nothing else works
   until two phones are joined
2. Sync client: push local entries, pull the couple's, reconcile last-write-wins
3. Mood screen — the smallest complete feature, and the one used most often
4. Exercise, with camera capture
5. Cycle: port the lunara engine and calendar
6. Work: calendar file import
7. Quests, achievements, and push delivery
