# Audit & roadmap — whole app, 2026-09-24

Scope is wider than `CURRENT_STATE.md` (which audited the economy and the
study bridge for one v2 brief) or `DEPTH.md`/`PULSE.md` (visual depth and one
retention brief). This one walks every `features/` directory, both backend
surfaces, the game, and CI, to answer three questions: what already works,
what is built but not fully connected, and what is worth adding next.

Verified against the tree on this branch: a full grep for TODO/FIXME/XXX/"not
implemented"/"coming soon"/placeholder/disabled-stub patterns across
`app/src`, `worker/src`, `app/functions`, and `game/` returns **nothing real**
— every hit is an `<input placeholder="…">`, the `'todo'` task-type enum
value, or prose describing a real, deliberate state ("not yet sent"). Take
that as a finding, not a search failure: this is an unusually complete
codebase for its size, and the gaps below are the genuine ones, found by
reading rather than by grepping for confessions.

---

## 1 · What works

Every one of the 26 directories in `app/src/features/` is wired to real
domain logic and a real repository module — none is a shell. The notable
clusters:

**Core loop & sync.** Pairing (`worker/src/pairing.ts`), the six sync
sections behind `db/repository/index.ts`, and the two-round-trip split
(`/api/entries` by day, `/api/holdings` by row) all match what `CLAUDE.md`
describes. `repository/index.test.ts` and `worker/src/holdings.test.ts` keep
the barrel and the four-place holding-kind list honest by failing the build
if they drift, so this isn't a place that silently rots.

**Auth & recovery.** Both GitHub and Google OAuth recovery
(`app/functions/api/auth/{github,google}/*`, `worker/src/{githubAuth,googleAuth}.test.ts`,
migrations `0012` and `0016`) are fully implemented, not just documented as
optional — they reconnect an already-paired member and never mint a new one,
request no email/profile scope, and `/api/health` reports `github`/`google`
as booleans so the client can render nothing rather than a broken button when
a deploy hasn't set the secrets.

**The RPG/game layer.** All seven islands carry real content
(`game/HeartBeat.Game.Core/Data/Island1.cs`–`Island7.cs`, 19–23 monsters
each, mirrored and pinned by `domain/rpg/islands.ts` + `islands.test.ts`
parsing the C# directly). The wasm bridge
(`features/eve-garden/engine/{client,game.worker,protocol}.ts`) is a real
typed protocol, not a toy. `TogetherPanel.tsx` already renders the long-
horizon ladder's next tier and points-to-go on the dashboard — the "visible
goal" gap that both `CURRENT_STATE.md` §2.3 and `plan.md` Phase 2 called out
has since shipped in a simpler form than either proposed. There is **no
real-money code anywhere** (checked for stripe/paypal/IAP/billing/checkout
across the whole tree) — every "shop" spends in-game coins only.

**Push.** `worker/src/push.ts` hand-implements VAPID and `aes128gcm`
encryption against WebCrypto (the `web-push` npm package doesn't run on
Workers) and is pinned against the official RFC 8291 §5 test vectors. This is
one of the most carefully built pieces of the backend, not a stub.

**AI features.** `/api/ask` (a grounded Q&A endpoint that hands the model
only pre-aggregated counts and dates, never notes or mood values — a real
prompt-injection mitigation) and `/api/transcribe` (Whisper dictation) are
both fully implemented against Workers AI and cleanly return 503 when
`env.AI` is unset on a deploy.

**CI.** `ci.yml` is a real gate, not theater: typecheck, config-sync,
greppable UI-review rules, a hard `npm audit --omit=dev` gate at zero, the
full test suite (app + worker + the C# game tests), a production build,
Lighthouse against the built preview (not the dev server), and two
build-artifact staleness checks (`gift/birthday.html`, `study/index.html`)
that fail the build if the committed file doesn't match its source. The one
deliberately non-blocking step (`npm audit` on dev deps) says so in a comment
explaining why.

---

## 2 · What needs wiring or cleanup

Concrete items, each checked against the current tree rather than assumed
from a doc.

### 2.1 The visual regression gate is only half-armed — still open

Deliberately not closed in the same pass as 2.2–2.6 below: real baselines
have to come from a green CI run's `visual-frames` artifact, not from this
container's fonts (see `docs/design-system.md` §"Baselines are not
committed yet" and the pitfall in `CLAUDE.md`). Closing it needs a CI run,
a pulled artifact, and a follow-up commit — not something to fake locally.

`npm run visual` runs the walk, screenshots every route in two themes,
and runs axe — all of that **is** enforced today (a console error or a
failed axe check fails the build). But the pixel-diff half is not: there is
no `app/tools/baselines/` in the tree, and `ci.yml`'s `visual` step doesn't
pass `--require-baselines`. `docs/design-system.md` §"Baselines are not
committed yet" already names the fix — pull the `visual-frames` artifact from
a green CI run, commit it, add the flag — it just hasn't happened. This is
the single clearest gap between what the docs say should exist and what
does; closing it is small and the instructions are already written.

### 2.2 The Worker has four routes the app never calls — closed

Deleted `/pair/start`, `/pair/join`, `/subscribe`, and both `/entries`
routes from `worker/src/index.ts`. `worker/src/audit.ts` (and its test)
went with them — nothing else called `recordAuthEvent` on the Worker side
once those routes were gone, and the Pages side already has its own
independent copy in `app/functions/api/_lib.ts`. `worker/src/pairing.ts`
and `pairing.test.ts` stay: unlike `audit.ts`, that test is the drift-guard
between the Worker's admission SQL and `app/functions/api/pair/join.ts`'s,
verified against real SQLite, and that value doesn't depend on whether the
Worker's own route is still wired up.

`worker/src/index.ts` implements `/pair/start`, `/pair/join`, `/entries`
(GET+POST) and `/subscribe` — the same features `app/functions/api/pair/*`,
`entries.ts`, and `subscribe.ts` implement on the Pages side. But
`app/src/pwa/api.ts` says outright it's "the client half of the Pages
Functions... same-origin, so there is no base URL to configure" — the
shipped client has no code path that ever calls the Worker's own origin for
these. Only `/boss`, `/boss/ready`, `/boss/attack` and `/health` look
reachable in practice (the boss fight is deliberately Worker-only, per its
own comment, for atomic HP arithmetic). The pairing/entries/subscribe copies
on the Worker read like a leftover from before Pages Functions existed
(`pairing.test.ts` keeps their SQL byte-identical to the Pages version, which
is effort spent maintaining code nothing calls). **Confirm nothing external
depends on `worker.<account>.workers.dev/pair/*` directly, then delete the
four dead routes from `worker/src/index.ts`** — less surface for the next
person to wonder about, and one less place a security fix has to land twice.

### 2.3 One doc actively contradicts shipped behavior — closed

The Risks row now says the truth and points at `DEPLOY.md` §7.

`docs/DESIGN.md`'s Risks table (§"Risks") lists "Photos make sync expensive"
→ "Photos never sync; they stay on-device by design." That was true when
`DESIGN.md` was written. It is no longer true: `docs/DEPLOY.md` §7 and the
README ("Images are stored on the server too... synced") describe a shipped
R2-backed photo sync path, with its own migration (`0009_media_keys.sql`) and
its own privacy design (unguessable per-object keys, no cross-couple read).
`DESIGN.md` is the largest doc in the repo (860 lines) and the one most
likely to be read as ground truth by someone new — a one-line fix to that
risk row (or a pointer to `DEPLOY.md` §7) removes a real "which is true"
trap.

### 2.4 Quests and achievements don't survive a device loss — still open

Left for its own PR, as §3 item 5 below already recommended: it needs a
new D1 table and API surface, not a wiring fix, and bundling it with 2.1–2.3
and 2.5–2.6 would have made a small, low-risk pass into a schema change.

Documented, not hidden — `docs/DEPLOY.md` says recovery brings back entries,
holdings and the pet, but quests and achievements finished **before** the
holdings-sync layer shipped are Dexie-only and don't come back. `api/ask.ts`
independently confirms this (it skips querying quests/achievements because
"they live only in Dexie on each phone and were never synced to D1"). This
is a real gap for the one scenario the OAuth recovery feature exists to
cover — a lost or replaced phone — and it's the kind of loss a person
notices only after it's happened.

### 2.5 The cycle-phase tint's blocker is gone, but nobody wired it — closed

`domain/cycle/predict.ts` now exports `phaseFor()`, and `CycleSection`'s
`Summary` card — the one inside `CycleLock`, not the open `mood-summary`
card `WellnessNote` sits above — carries a `data-phase` attribute and a
`PHASE_LABEL` line. The tint landed on the locked card specifically:
tinting the card above the PIN would have leaked cycle phase past the same
lock `CycleLock`/`openLanes`/`lockedLanes` exist to enforce.

`PULSE.md` §5 named "cycle phase tints the wellness card" as the best
open idea, blocked on "a `Phase` type first — nothing names
menstrual/follicular/ovulation/luteal." That type now exists —
`domain/cycle/taxonomy.ts` defines `CyclePhase` and labels for all four
phases — but nothing reads it into the mood/wellness card: no `data-phase`
attribute anywhere in `styles.css`, no phase lookup in `domain/pet/mood.ts`.
(`PULSE.md`'s other open item, time-of-day shifting the background, **has**
shipped since — `domain/scene/schedule.ts` computes sun position live off one
clock read and `home/useHour.ts`/`SceneBackdrop.tsx` render it.) The type
being ready makes this the cheapest remaining item in that doc.

### 2.6 No single place says what's actually turned on — closed

`SettingsPage` now renders a `WhatsOnBlock` at the foot of the page, reading
`/api/health` once and rendering four plain sentences.

Four features self-disable cleanly when a deploy hasn't configured them:
Workers AI (`ask`/`transcribe`), GitHub OAuth, Google OAuth, and Push
(VAPID keys). `/api/health` already reports all four as booleans
(`app/functions/api/health.ts`) — but nothing in Settings or the docs turns
that into an at-a-glance answer to "is push actually on for our deploy right
now." For a two-person app with no support team, "why doesn't the invite
notification work" is a question the app itself could answer instead of
leaving it to `curl /api/health`.

### 2.7 Two checks worth confirming, not just assuming

- **Lighthouse**: `npm run lighthouse` asserts the precache byte budget off
  the built `sw.js`. Whether it also fails the build on a performance or
  accessibility score regression, or only reports one, wasn't confirmed by
  reading `app/tools/lighthouse.mjs` in this pass — worth a five-minute check
  before calling the perf gate complete.
- **Unused dependencies**: a spot check of `app/package.json`,
  `worker/package.json`, and the root found nothing obviously dead
  (`unplugin-dotnet-wasm`, `workbox-precaching`, `phaser` are all genuinely
  imported), but nobody has run `depcheck`/`knip` end to end. Cheap to run
  once, not urgent.

---

## 3 · What would be worth adding

Scoped to fit the app's own design rulings rather than against them — no
second currency, no per-person pet, no CSS-in-JS runtime, no third-party
backend, no real money, health only inside a boss fight, day keys always in
the member's zone. Ordered roughly cheapest-and-most-valuable first.

1. **Close 2.1 and 2.5 first.** Both have their hard part already done
   (the visual gate's instructions are written; the cycle-phase type already
   exists) — they're the highest ratio of value to remaining work in this
   whole list.

2. **A "what's on" panel in Settings**, reading `/api/health` once and
   rendering it as plain sentences ("Push notifications: on." / "Ask your
   pet: off — this deploy hasn't turned on Workers AI."). Turns 2.6 from a
   debugging session into a glance, and it's a read of an endpoint that
   already exists.

3. **Third-party deck ingestion for Study**, per `plan.md` Phase 3 and
   `CURRENT_STATE.md` §4 — the design is already fully specified (build-time
   adapter, content-derived stable ids, why the runtime-fetch alternative is
   overkill for 32 KB of cards) and simply hasn't been executed. It's the
   single largest, best-scoped, genuinely unbuilt feature in the repo; the
   one open question (whether to author `why` rationales for imported cards
   or relax the type) is a content decision, not an engineering one, and
   blocks nothing else.

4. **A "download your record" export.** The app's whole privacy pitch is "no
   account, your phone holds the record, the server holds a copy so the
   other phone can read it" — and yet there is no path for a couple to pull
   that copy out as a file. A JSON export of a couple's own entries and
   holdings (already all keyed by `coupleId`, already all readable by an
   authenticated member) would extend that privacy stance rather than
   compromise it, and it's the honest answer to "what if I want to stop
   using this" that a no-account app currently doesn't have.

5. **Sync quests and achievements**, closing 2.4. Bigger than the others —
   it's a new D1 table plus API surface, following the same shape
   `holdings.ts` already establishes — but it's the one place OAuth recovery
   currently promises less than it should. Worth scoping as its own small PR
   once 2.1–2.3 are cleared, not bundled with them.

6. **Extend `/api/ask` into a standing weekly note**, rather than only a
   command-menu fallback for typed questions. The hard part — grounding a
   model in pre-aggregated counts instead of raw notes, so a prompt injection
   in free text can't reach it — is already solved and tested in
   `ask.ts`. A Sunday-evening push ("nine days logged together this week,
   both of you hit the gym twice, the boss is at 40% HP") reuses that exact
   mechanism and the push infrastructure in §1, with no new trust boundary to
   design.

---

## 4 · Summary table

| Area | Status |
|---|---|
| Core sync, pairing, holdings | Built, tested, kept in step by CI |
| GitHub/Google OAuth recovery | Built, self-disabling, gracefully degrades |
| RPG/game (7 islands, chests, garden) | Built, no placeholder content |
| Push notifications | Built, RFC-pinned, one of the most careful modules in the repo |
| AI ask / transcribe | Built, gated on `env.AI`, sound prompt-injection design |
| Visual regression pixel-diff | **Half-wired** — instructions written, not executed; needs a real CI artifact (§2.1) |
| Worker's pair/entries/subscribe routes | **Closed** — four routes deleted from `worker/src/index.ts`, `audit.ts` with them (§2.2) |
| `DESIGN.md` photo-sync claim | **Closed** — Risks row now points at `DEPLOY.md` §7 (§2.3) |
| Pre-sync quests/achievements | **Documented gap** — deliberately left for its own PR, needs a new D1 table (§2.4) |
| Cycle-phase wellness tint | **Closed** — `phaseFor()` wired into the locked `cycle-summary` card (§2.5) |
| "What's on" visibility | **Closed** — `WhatsOnBlock` in Settings reads `/api/health` (§2.6) |
| Third-party study deck ingestion | **Speced, not built** — plan.md Phase 3 |
| Data export | **Not present** — gap in an otherwise strong privacy story |
