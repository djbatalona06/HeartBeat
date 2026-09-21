# Current state

Written as the first task of the v2 upgrade plan, against `main` at the merge of
[#57](https://github.com/djbatalona06/HeartBeat/pull/57). Its purpose is narrow:
say what the app already does, in enough detail that the next round of work can
tell the difference between building something and rebuilding it. The audit
found rather more of the second than expected, which is the whole reason this
file exists before any feature code.

Verified against the tree, not against memory: `npm run typecheck` clean,
1536 app tests and 138 worker tests passing, `APP_BASE=/ npm run build` green.

---

## 1 · Shape

Three deploy targets out of one repo, sharing one D1 database:

| Directory | What | Where |
|---|---|---|
| `app/` | Vite + React + TS PWA, and the `/api/*` Pages Functions beside it | Cloudflare Pages — `heartbeat-eop.pages.dev` |
| `worker/` | Cloudflare Worker: pairing, boss HP, push | Cloudflare Workers |
| `index.html` + `gift/` + `study/` | Landing page, birthday piece, standalone study build | GitHub Pages |

The layering is strict and worth restating because the plan below depends on it:

- `app/src/domain/**` — pure TypeScript. No React, no Dexie, no `fetch`. Every
  module has a `*.test.ts` beside it, and Vitest only collects `*.test.ts`, so
  domain logic is the only thing under test by design.
- `app/src/db/repository/**` — the single door to the database. One module per
  section behind a barrel; `features/` never touches Dexie directly.
- `app/src/features/**` — screens. They call repository functions and read
  domain functions, and hold no rules of their own.

**Anything the upgrade adds as a rule belongs in `domain/`, with a test.** A new
top-level `src/game/` directory — which the draft plan proposed — would be a
fourth layer parallel to `domain/rpg/`, holding the same kind of thing.

---

## 2 · The economy, as it actually stands

### 2.1 Levels are already a hybrid curve

The draft plan asked for "base + linear growth × exponential modifier at
milestone tiers", on the grounds that pure linear goes trivial and pure
exponential punishes early. The app already resolves that tension — it just
splits it across two modules instead of one formula.

**`domain/xp.ts`** makes the *cost* of a level exponential:

```ts
BASE_COST = 100;  GROWTH = 1.35;
xpForLevel(level) = Σ round(100 × 1.35^(n-1)) for n in 1..level-1
```

**`domain/rpg/avatar.ts`** makes the *reward* per level linear, and flat across
all four stats:

```ts
STAT_PER_LEVEL = 1;
baseStats(level) = { strength, insight, heart, luck } each = 1 + (level - 1)
```

The file says why the reward is flat, and it is a design ruling rather than an
oversight: classes are good for a party of six, where the fun is that the healer
cannot tank. For a party of two, one person's build can lock the other out of a
boss and there is nobody else to call.

The "tier bonus" the plan wanted at milestone levels also exists, as
**breakpoints rather than multipliers**:

- `domain/rpg/stage.ts` — six pet stages at levels 1, 3, 6, 10, 15, 21. Each
  raises `baseMaxEnergy` (30 → 100) and runs two curves against each other:
  adventures cost more energy and take fewer hours as the pet grows.
- `domain/rpg/skills.ts` — four skills unlocking at levels 3, 6, 9, 12.
- `domain/rpg/gear.ts` — `RARITY_MIN_LEVEL` gates what can be equipped.

**Stats are already derived, never stored.** `sheetFor(avatar, bonus)` computes
level, stats, stage, max energy and max MP in one pass from `Avatar.xp` plus a
gear/companion bonus passed in as a parameter. The only persisted numbers are
`xp`, `coins`, `energy`, `mp` and `gear`. The plan's rule — "never store derived
stats, only base and level" — is the rule the code is already built on.

### 2.2 There are three currencies, and studying already pays all of them

`Avatar` carries `coins` (`STARTER_COINS = 120`), `energy` and `mp`.
`applyPayout` adds, `canSpend`/`spend` subtract, and `Payout`
(`{ xp, coins, energy, mp }`) is the one shape every earning surface returns.

A fourth currency called "Pulse" would sit beside coins doing coins' job. The
accrual the plan wants Pulse to have — daily couple interactions, quiz
completions, learn streaks — is wired to coins already:

- Tasks: `domain/rpg/task.ts`, priced by `DIFFICULTY_WEIGHT`.
- Study: `domain/study/payout.ts` — `XP_PER_CARD = 2`, `COINS_PER_CARD = 1`,
  `ENERGY_PER_CARD = 1`, `MP_PER_CARD = 1`, capped at `DAILY_CARD_CAP = 60`
  cards a day across every deck and both modes.
- Achievements: 12 tracks × 3 tiers, `TIER_PAYOUT = { 1: 20, 2: 45, 3: 90 }`.
- Quests: 14 templates through `domain/quests/engine.ts`.

### 2.3 Long-horizon goals shipped in #57

The plan's §2.3 — "3–6 month unlockables, visible from day one" — is the part
where the audit most changes the work, because a ladder with exactly that shape
landed hours before this document was written.

`domain/rpg/together.ts`:

```ts
loyaltyPoints({ loggedDays, duoDays, questsFinished, achievementXp })
  = loggedDays×2 + duoDays×5 + questsFinished×25 + floor(achievementXp / 2)

TOGETHER_TIERS = [
  { n: 0, name: 'New',       at: 0,    xp: 0   },
  { n: 1, name: 'Steady',    at: 150,  xp: 60  },
  { n: 2, name: 'Woven',     at: 500,  xp: 140 },
  { n: 3, name: 'Rooted',    at: 1200, xp: 300 },
  { n: 4, name: 'Evergreen', at: 2600, xp: 600 },
]
```

Every input is a lifetime total that can only grow, which is what makes a tier
something you cannot fall out of. At both partners logging daily that is roughly
a fortnight to Steady, six weeks to Woven, **three months to Rooted and most of
a year to Evergreen** — the 3-and-6-month cadence the plan asked for, already
tuned and already tested (`together.test.ts`, 21 tests).

Also in #57: a rolling seven-day `duoWeek` paying `DUO_WEEK_XP = 120`, and a
`reunion` quest gated off the board until neither partner has logged for three
days.

**What is genuinely missing from §2.3** is not the ladder — it is the *shop
window*. `nextTier` and `pointsToNext` exist and nothing renders a locked rung
with a progress bar on the dashboard. A goal nobody can see from day one is not
a long-horizon goal; it is a surprise.

### 2.4 One pet, not two

`db/repository/petXp.ts` and `/api/pet` own a **single shared pet** per couple,
and `session.ts` is explicit that crediting it from two places is how a shared
bar ends up counting an award twice.

The draft plan's "Dual Pet Fusion — both partners' pets at level 50, fuse into a
hybrid" assumes one pet per person. That is not this app's model, and changing
it would touch sync, the D1 schema and the boss fight. It should be re-aimed at
the shared pet (a stage past Guardian, say) or dropped.

---

## 3 · The learn section already exists

This is the largest single finding. `domain/study/` is five modules and 502
lines of tested logic, and `features/study/StudyPage.tsx` is the screen over it.

### 3.1 SM-2 is implemented — `domain/study/srs.ts`

The plan's proposed `Flashcard` interface (`easeFactor`, `interval`,
`repetitions`, `dueDate`) is a near-match for what ships, with the static card
and the per-person progress correctly split into two types:

| Plan | In the repo |
|---|---|
| `easeFactor: number` (default 2.5) | `CardProgress.ease`, `EASE_START = 2.5` |
| `interval: number` | `CardProgress.interval` |
| `repetitions: number` | `CardProgress.reviews` (+ `streak`, + `lapses`) |
| `dueDate: string` | `CardProgress.dueOn: DayKey` |
| Again/Hard/Good/Easy | `Grade = 'again' \| 'hard' \| 'good' \| 'easy'` |

The implementation is a deliberate improvement on the canonical algorithm and
the differences should be preserved, not "fixed" back:

- Ease is clamped at both ends — `EASE_FLOOR = 1.3` (SM-2's own) and
  `EASE_CEILING = 3` (added, because unbounded ease sends a card you guessed
  right three times into a year-long interval).
- `again` maps to SM-2 quality **2, not 0**. Quality 0 costs 0.8 of ease in one
  press — two-thirds of the span between the floor and the start, for one blank
  night. At 2 it costs 0.32.
- A lapse is counted only for a card answered before. The first time you meet a
  fact and do not know it is not forgetting.
- `MAX_INTERVAL = 365`. Past a year the schedule is doing nothing a bookmark
  could not do.

The plan's "Again reduces ease by 0.2 (min 1.3)" is a different, simpler rule
than what ships. What ships is SM-2's actual ease update, verbatim, then
clamped. Do not replace it.

### 3.2 The quiz timer exists — and has exactly the bug the plan predicted

`domain/study/quiz.ts`: `QUIZ_LENGTH = 10`, `CHOICES = 4`,
`TIME_LIMIT_MS = 20_000` **per question**, distractors drawn from the same deck
by a stable FNV-1a hash so one card lays its options out the same way twice.
`scoreAnswer` pays `BASE_POINTS = 100` plus up to half again for speed, and
nothing for a wrong answer however fast.

The plan flagged "timer must not reset when navigating between questions". That
one is already right — the timer is per-question by design, and `scoreRun`
accumulates across the run.

**The real defect is the other one the plan named.** `StudyPage.tsx:457` is:

```ts
const timer = setInterval(() => setNow(Date.now()), 200);
```

with `elapsed` measured against a captured start time and no `visibilitychange`
listener anywhere in the file. So a phone call, a notification, or a glance at
another tab spends the question's twenty seconds in the background and the
answer scores as missed on return. On a PWA this is not an edge case; it is
Tuesday. **This is the highest-value small fix in the whole plan.**

### 3.3 Decks are static and code-shipped

`app/src/content/study/index.ts` registers nine decks — js, typescript, react,
git, http, sql, bigo, shell, practice — each a `Deck` compiled into the bundle.
`Card` requires a `why`, deliberately: a flashcard that only asserts teaches
recall of a string.

Note what this means for the bridge: Heartbeat's decks are **developer topics**.
Jenny's app holds **nursing** content. Nothing merges them today.

---

## 4 · The bridge to the study app already exists, and runs the other way

The draft plan's §4 proposes email-based login, a JWT, an `AuthBridge`-style
service, and Heartbeat pulling decks from the nursing app. The integration that
ships does the opposite, and the direction it chose is the better one.

**`app/functions/api/study/link.ts`** — a paired phone POSTs here and gets back
a token scoped to one route. Minting retires the previous token, so one live
link per member. The plaintext is returned exactly once; only
`sha-256` hashes are stored, and Settings shows an 8-character fingerprint and a
`last_used_at`. The member's timezone is captured at mint, because that is the
only moment anything server-side can know it.

**`app/functions/api/study/session.ts`** — the study app POSTs a finished
session. It is the only route in `functions/` that answers a CORS preflight.
`STUDY_XP = { deck: 20, quiz: 25, weekly: 35, match: 10, anatomy: 15 }`,
`STUDY_DAILY_CAP = 120` XP per member-day. The award id is `study-<sessionId>`
and the ledger's primary key does the deduplicating, so the offline queue may
resend freely. A clock more than 48 hours out is distrusted and the session is
dated by the server instead. The gain is **not** written into `pets` here —
`/api/pet` owns that read-modify-write.

**On the other side** (`Jenny-s-Study-Guide/index.html`, the `MA.heartbeat`
module): `DEFAULT_URL` points at `/api/study/session`, sessions queue in
`heartbeat:queue` and `drain()` flushes them, and Settings takes a pasted code
to connect or an empty one to disconnect.

### Why the plan's auth design would be a regression

Three concrete reasons, all of them properties the repo currently holds:

1. **The README says the app holds no email addresses, and #57 worked to keep
   that true** — `google_links` has four columns and could not hold an email if
   one arrived, and a test asserts it. Keying a bridge on email would make that
   sentence false for a feature that does not need it.
2. **A scoped token is strictly less dangerous than a member JWT.** The current
   token can do one thing: report a finished session. A bearer with
   `flashcards:read` scopes, stored in `sessionStorage`, is a larger blast
   radius bought for nothing.
3. **This repo bundles nothing third-party.** A NestJS auth service is a fourth
   deploy target, a second database and an on-call surface, for two users.

**Recommendation: keep the token, extend the payload.** Everything the plan
wants from the bridge — decks, quiz banks, models — is content moving the same
direction the sessions already move, or content that can be fetched by URL and
never needs auth at all.

### What ingestion would actually cost

- **Phase 1 — flashcards.** `Jenny-s-Study-Guide/data/flashcards.js` holds 126
  ATI TEAS 7 cards shaped `{ category, subcategory, question, answer }`, 32 KB.
  Heartbeat's `Card` needs `id`, `deckId`, `question`, `answer`, `why`,
  `difficulty`. **There is no `why` and no `difficulty` in the source** — an
  adapter can synthesise `difficulty`, but `why` is required for a reason and
  the honest options are to author rationales or to relax the type for imported
  cards. This is the real decision in Phase 1, and it is a content decision, not
  a code one.
- **Phase 2 — quiz banks.** Heartbeat's quiz builds its own distractors from
  the deck; imported cards work with it unchanged the moment Phase 1 lands.
  There is no separate bank to ingest.
- **Phase 3 — GLB models.** Eight files, **31 MB**. The service worker precaches
  12 entries at 882 KB today. These must be fetched on demand from the study
  app's own origin and must never enter the precache manifest.

---

## 5 · Where the draft plan lands, line by line

| Plan item | Status | Where |
|---|---|---|
| §2.1 Hybrid stat curve | **Built** (split across two modules) | `domain/xp.ts`, `domain/rpg/avatar.ts` |
| §2.1 Milestone tier bonuses | **Built** as unlock breakpoints | `stage.ts`, `skills.ts`, `gear.ts` |
| §2.1 "Never store derived stats" | **Already the rule** | `sheetFor()` |
| §2.2 Upgrade currency | **Built**, named coins | `Avatar.coins`, `applyPayout`, `spend` |
| §2.2 Super-linear upgrade costs | **Partly** — levels cost 1.35^n; no coin-spent upgrade track | `xp.ts` |
| §2.3 Long-horizon ladder | **Built in #57** | `domain/rpg/together.ts` |
| §2.3 Locked items visible day one | **Missing** — this is the gap | dashboard |
| §2.3 Dual Pet Fusion | **Conflicts** — one shared pet, not two | `petXp.ts` |
| §3.1 SM-2 scheduler | **Built**, and better than specified | `domain/study/srs.ts` |
| §3.1 Answer-then-reveal-then-rate | **Built** | `StudyPage.tsx` |
| §3.2 Quiz timer | **Built** | `domain/study/quiz.ts` |
| §3.2 Timer resets on navigation | **Not a bug here** — per-question by design | — |
| §3.2 Pause when backgrounded | **Missing — real defect** | `StudyPage.tsx:457` |
| §4.1 Bridge auth | **Built**, token-scoped; plan's email/JWT is a regression | `api/study/link.ts` |
| §4.2 Session → XP | **Built**, replay-safe and capped | `api/study/session.ts` |
| §4.2 Deck ingestion | **Genuinely new** | — |
| §4.2 GLB viewer | **Genuinely new**, and 31 MB of it | — |
| §4.3 Adapter pattern | **Right call**, keep it | — |

---

## 6 · Traps a v2 branch will hit

Beyond the ones in `CLAUDE.md`, which all still apply:

- **`study/index.html` is a committed build artefact.** Any edit to
  `app/src/styles.css` — any rule, anywhere — changes it, and CI fails on
  `git diff --exit-code`. Run `npm run study:build` and commit the result.
- **A new holding kind is four edits plus a migration**, and only
  `worker/src/holdings.test.ts` keeps them in step. Imported decks stored as a
  new kind pay this cost; stored under an existing kind, they do not.
- **`PARTNER_WRITABLE_KINDS` is a security list, `PARTNER_VISIBLE_KINDS` is a
  display list.** Card progress is personal; if it ever syncs it is visible, not
  writable.
- **Day keys are the member's timezone**, and the study bridge already gets this
  right by capturing the zone at mint. Anything counting "days" must match.
- **`db/repository/` is a directory.** New section = new file + one `export *`
  in alphabetical order. Never append to an existing section.
- **CodeQL scans this repo, and what it does *not* read is a decision.**
  `.github/codeql/codeql-config.yml` holds both halves: the default queries
  plus security-extended, and a `paths-ignore` for vendored three.js and for
  the two build artefacts that inline source scanned elsewhere
  (`gift/birthday.html`, `study/index.html`). Excluding anything else means
  saying why in that file. The one alert the Security tab is expected to carry
  is `js/missing-origin-check` on `engine/game.worker.ts` — a dedicated
  worker's message handler has no origin to check; the reasoning is in the
  file, and the alert is dismissed as a false positive rather than worked
  around in code.
