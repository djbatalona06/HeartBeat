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

The mascot in the centre, six circular doors evenly spaced around it, and the
pet's XP bar underneath. It replaced a 2×2 grid that had grown to five tiles
and left the fifth one a half-width orphan.

| Door | Contents |
|---|---|
| Mood | Vertical 1–10 meters for hunger, joy, moody — both partners |
| Move | Workout log; camera proof front and back |
| Work | Shared calendar, populated by file import |
| Cycle | Period tracking, optionally behind a PIN |
| Party | Party sheet: gear, pets, the boss fight |
| Settings | Pairing state, theme picker, partner name and photo, calendar |

Six is the ceiling — past that the bubbles crowd the pet and the ring stops
reading as a ring. The right-hand arc is what you did today, the left-hand arc
is everything else, and Party takes the sixth slot because it is the only route
with neither a tab nor another door on this screen.

**The geometry is `features/dashboard/layout.ts`, and it is pure.** The page
measures its own box with a `ResizeObserver` and hands the numbers over;
`ringLayout` gives back a centre, a radius, a mascot diameter and one slot per
door, and reports `fits: false` rather than quietly overlapping when the box is
too small. That split is the only reason the spacing can be tested at all —
Vitest runs in `environment: 'node'` and never sees a `.tsx` file. Bubble size
is `--tap` plus `--space-5`, read off the document rather than typed in, so the
48px tap floor holds wherever the tokens move.

**The mascot follows the theme, not the couple.** Theme already lives in
`localStorage` per device, so the two phones show different pets by
construction — which is what was asked for. `features/pet/mascots/` is a
registry keyed by `Theme.id` with the same fallback `getTheme` uses, kept
beside the theme engine rather than as a field on `Theme`: a theme is a
palette, a mascot is a drawing only one screen shows, and hanging one off the
other would put a React component in every pack.

| Theme | Mascot |
|---|---|
| kitty | **Mochi**, a cream ribbon cat |
| sponge | **Marigold**, a yellow sea sponge |
| shinobi | **Foxglove**, an ink fox |
| avatar | **Cirrus**, a cloud serpent |
| pony | **Wishbell**, a lilac unicorn |

Every one is an original: original geometry, drawn as inline SVG from ellipses,
triangles and computed star paths, coloured entirely from `var(--color-*)` so
each follows its own palette. Each belongs to its theme's *spirit* and to
nothing more specific than that, and `mascots/roster.test.ts` guards the names
the same way `pets.test.ts` guards the sixteen collectibles. Canvas was not an
option: `themes/useCanvasLoop.ts` is wired to `window.innerWidth/innerHeight`,
so a canvas inside a card would render at full window size and clip.

`Pet.mood` had been written by `addXp` since the beginning and read by nothing.
It is what picks the pose — four moods, four faces — so the pose costs no new
state. The idle breathing stops under calm mode and under reduced motion.

The level shown is always `levelProgress(pet.xp).level`. `Pet.level` is carried
forward by whoever last wrote the row and never recomputed, so rendering it
would eventually show a number the XP disagrees with.

Meters are vertical rather than horizontal because the point is comparing two
people side by side, and columns compare more readably than stacked bars.

## Cycle

Built, in `app/src/domain/cycle/` and `app/src/features/cycle/`.

This was originally planned as a port from
[lunara](https://github.com/djbatalona06/lunara). It is not one. lunara is
AGPL-3.0 and other people's work, and this repository is MIT — copying its
engine in would have made the licence a false statement about the contents. So
the engine here is written from the method rather than from the source, and
`NOTICE.md` records the distinction.

What survived the change of approach is the shape, because the shape was the
valuable part:

- `predict()` returns the next period start, an ovulation estimate, a fertile
  window, and `uncertaintyDays` **clamped to 2–9**. The clamp is the point: a
  confident-looking single-day prediction from three cycles of history is a lie,
  so the floor holds even when the observed spread is genuinely zero.
- A median with a median absolute deviation, not a mean with a standard
  deviation — one illness or one mistyped date should not move the estimate.
- Luteal anchoring where there is ovulation evidence inside the current cycle,
  calendar projection otherwise.
- **`checkInComplete` is stored**, which is what distinguishes a symptom-free day
  from a day nobody opened the app. Without it every downstream average is wrong
  in a way nobody notices.
- Cycles outside 15–90 days are excluded as data entry rather than biology, and
  a history that stopped more than 90 days ago stops forecasting rather than
  extrapolating.

`periodStartsFrom()` reads starts out of the log rather than requiring them to
be flagged, tolerating a one-day gap so an unlogged light day does not split one
period into two and halve the cycle length that gets averaged.

Whether this device's owner logs or reads is `Settings.tracksCycle` — identity
in this app is a device with a `memberId` in settings, and the `members` table
has never been written to. Entries reach the other phone through the ordinary
entry sync, so they are readable by both halves of the couple and by nobody
else.

The page carries a PIN lock, stretched with PBKDF2 rather than hashed once: a
four-digit space is ten thousand guesses. It re-locks whenever the app leaves
the foreground, and the salt and hash live in settings — the one table sync does
not carry — so the lock is per-device and unlocking here does not unlock the
other phone.

Prediction stays advisory, and says so on the page: a fertile window is not
contraception.

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

- **XP is shared *and* personal.** One pet with one bar for the couple, and a
  character sheet each. An earlier draft of this document said personal
  progression was the wrong game; that was half right. What is wrong is
  *competing* — a leaderboard, a streak either of you can be behind on. Having
  your own level is not competing, and without one there is nothing for gear,
  skills or a growth stage to hang off. Both bars move on the same completion,
  and neither is ever shown next to the other's.
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

## The RPG layer

Habitica's skeleton wearing Finch's manner. Habitica gamifies achievement;
Finch gamifies self-compassion. Everything composes except one thing.

```
tasks       (id, couple_id, member_id, type, difficulty, value, streak, ...)
avatars     (member_id, couple_id, xp, coins, energy, mp, gear, companion_id)
pets        (id, couple_id, member_id, kind_id, bond, mp, hatched_at)
rewards     (id, couple_id, member_id, title, cost)
life_events (id, couple_id, member_id, kind, day, from_member_id, note)
boss_fights (couple_id, tier, hp, max_hp, ready_a, ready_b, state)   -- D1 only
```

### The ruling: health exists only inside a boss fight

Habitica charges you health for a missed Daily. HeartBeat is for two people who
live together, so that mechanic would mean **her bad week damages him**. Shared
punishment is worse than the competition this document already rules out.

So in daily life there is no bar to lose. Miss a day and the boss takes no
damage that day — absence of progress, never a penalty.

This is enforced by shape rather than by discipline. `neglect()` returns exactly
`{ value, streak }`: there is no field for a cost, so a future edit that wants
one has to change the signature and the test that pins the key set. No type
outside `BossFight` carries a health field at all, and a test in
`db/rpg.repository.test.ts` walks a person through missing every Daily for a
month and asserts that not one pool came out smaller.

### What survives from Habitica, and what was changed

| Decision | Where | Why |
|---|---|---|
| Value clamps at **±11**, not ±22 | `rpg/task.ts` | At ±22 a neglected task pays **3×** a well-worn one, which stops being a nudge and becomes an instruction. ±11 gives ≈1.76×. A test asserts the spread stays between 1.2 and 1.8. |
| XP and coins ride the value curve; **energy and MP do not** | `rpg/task.ts` | Habitica's economy is meant to be value-sensitive. Finch's energy is meant to be *plannable* — if an adventure costs 25 and a task pays 4–9 depending on history, you cannot tell whether tonight's list gets the pet out the door, and that uncertainty is the anxious feeling this half of the design exists to avoid. |
| **No classes.** All four stats rise together | `rpg/avatar.ts` | Habitica's classes are good design for a party of six, where the fun is that the healer cannot tank. For a party of two they mean one person's build can lock the other out of a boss, and there is nobody else to call. Gear is where a choice lives, and it comes off in one tap. |
| Level, stats and pet rank are **never stored** | `rpg/avatar.ts`, `rpg/pets.ts` | A stored level is a second copy of the XP that can disagree with it, and the one that disagrees is always the one on screen. |
| Period start is weighted toward **energy over XP** | `rpg/lifeEvents.ts` | The point is to make a hard day cost less, not to reward having one. If a bad week levelled you faster than a good one, the game would be quietly asking for bad weeks. |
| Streak is a counter, never a multiplier | `rpg/task.ts` | A streak that pays is a streak you can be punished for breaking, which is the mechanic this layer exists to avoid. |

### Good Vibes

Finch's friend feature, and the single best fit for a two-person app in either
game: it makes your partner a source of progress rather than a rival, which is
this app's whole thesis. A short note grants the other person energy; sending
pays the sender a little too, or nobody sends. Capped at three per sender per
day — they keep their weight by being rare.

### The boss fight, and why it is the one server-side feature

Boss HP is **contested state**. Everything else in HeartBeat renders from
IndexedDB and syncs last-write-wins, which is right for a record of what one
person did and wrong for a number two people are subtracting from at the same
time: one of their hits would silently vanish. So HP lives in D1 and damage
lands as `UPDATE boss_fights SET hp = MAX(0, hp - ?)`, atomic in SQL. Verified
against a local D1: twenty simultaneous blows from both members all land.

- **Both ready before it starts.** One person cannot drag the other into a fight
  they would both wear.
- **Escalation on victory only**: `hp = 600 × 1.25^(n-1)`, damage likewise. A
  defeat re-runs the same tier — losing a week should not mean the boss grew
  while you were having it.
- **Clearing a tier improves the drop table** by 20% at tier 1, rising two
  points a tier to a 30% cap. Each rarity above common has its chance multiplied
  by exactly `1 + bonus`; common absorbs the remainder.
- A fight nobody finishes inside seven days is closed by the existing
  every-minute cron, so the tier can be attempted again rather than staying open
  forever.
- `worker/src/boss.ts` is a deliberate second copy of the app's tier maths — two
  workspaces, two bundles. Both test files pin the same exact values for tiers 1
  to 5, so a change to one side and not the other fails CI rather than desyncing
  mid-fight.

### The design language

Finch's *shape* is shared by every theme and lives in `themes/tokens.ts` as
`SHARED_TOKENS`: a 4px spacing scale, a fluid type scale with a 12px floor, a
48px tap target, and one soft overshooting curve for anything that fills. Packs
keep their palettes and their radii — shinobi being sharp and pony being round
is character, not inconsistency. Finch's own density is deliberately not copied;
its screens are fairly criticised as cluttered, so what is taken is the breathing
room, not the number of things on a page.

### Provisional identity, and the re-key that ends it

The app mints a local `memberId`/`coupleId` on first use so it works before
there is a partner to pair with. Pairing later replaces both with the ids the
Worker issues, and rows written before that point keep the provisional ones —
which used to mean they never synced and never appeared in a "mine" view again.

`domain/identity/rekey.ts` is the description of the repair (which fields on
which tables carry an id, which rows have to move rather than be updated in
place, and who wins when two rows want the same day), and `rekeyIdentity` in
`db/repository.ts` walks it inside one transaction.
`features/pairing/usePairing.ts` notices the identity change and runs it — on
the first pairing, and again if the couple ever re-pairs.

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
  `https://heartbeat-eop.pages.dev.attacker.com`. There is a test for exactly that.
- Wildcards match a single label only, so `a.b.heartbeat-eop.pages.dev` is refused.
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
2. ~~Sync client: push local entries, pull the couple's, reconcile
   last-write-wins~~ — done
3. ~~Work: the shared calendar~~ — done
4. ~~Cycle: the engine, the calendar and the lock~~ — done, though written
   rather than ported; see above
5. Mood screen — the smallest complete feature, and the one used most often
6. Exercise, with camera capture
7. Quests, achievements, and push delivery
