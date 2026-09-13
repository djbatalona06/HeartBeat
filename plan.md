# plan.md — Heartbeat v2: stats, learning, and the study bridge

**App:** https://heartbeat-eop.pages.dev/
**Stack:** React + Vite + TypeScript PWA · Cloudflare Pages Functions · Cloudflare Worker · D1
**Baseline:** `main` at the merge of [#57](https://github.com/djbatalona06/HeartBeat/pull/57)
**Companion document:** [`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md) — the audit this plan is built on. Read it first.

---

## 0 · What the audit changed

The first task in the original brief was "audit before writing any feature
code". That audit is done, and it moved most of the plan.

Roughly **70% of the v2 brief already ships.** SM-2 is implemented and tested.
The quiz and its timer exist. The bridge to the nursing app exists and runs in
the safer direction than the one proposed. The long-horizon ladder landed in
#57, tuned to almost exactly the 3-and-6-month cadence asked for.

So this plan is mostly **not** a build plan. It is shorter, and it is better,
because the remaining work is the work that is actually missing:

| Original phase | Revised |
|---|---|
| A — build `src/game/stats.ts` | **Cut.** `domain/rpg/avatar.ts` is this module. A second one is a duplicate in the wrong layer. |
| B — Pulse currency, upgrade UI, unlocks | **Narrowed** to the one real gap: goals you can see before you can reach them. |
| C — SM-2, learn screen, quiz timer | **Narrowed** to one defect: the timer does not pause when the phone is not looking. |
| D — bridge auth, adapter, ingestion | **Narrowed.** Auth is built. The adapter and deck ingestion are the genuinely new work. |

Three items from the brief are **dropped or re-aimed**, with reasons, in §5.

The ordering principle: **ship the defect fix first, the visible-goal work
second, the content bridge third.** Each phase is independently valuable and
independently revertible. Nothing below requires a big-bang branch.

---

## Phase 1 — The quiz timer stops when you are not looking

**Size:** small. One hook, one screen edit, one test file.
**Why first:** it is the only outright *defect* in the brief, it is the smallest
change in the plan, and it costs the person using the app real points today.

### The problem

`StudyPage.tsx:457` runs `setInterval(() => setNow(Date.now()), 200)` and
measures `elapsed` against a captured start time. There is no
`visibilitychange` listener in the file. A notification, a phone call, or a
glance at another tab spends the question's twenty seconds in the background,
and the answer scores as missed on return. `scoreAnswer` pays nothing for a
wrong answer however fast, so the cost is the whole question.

### The work

1. **`app/src/domain/study/clock.ts`** — a pure accumulator, because the rule is
   a rule and this repo tests its rules:

   ```ts
   export interface Clock {
     accumulatedMs: number;   // time already banked from previous visible runs
     startedAt: number | null; // null while paused
   }

   export function start(now: number): Clock
   export function pause(clock: Clock, now: number): Clock
   export function resume(clock: Clock, now: number): Clock
   export function elapsed(clock: Clock, now: number): number
   ```

   Total and pure: `pause` on an already-paused clock is a no-op, `resume` on a
   running one is a no-op, and `elapsed` never goes backwards. Those three are
   the test cases that matter, because the browser fires `visibilitychange` in
   pairs that are not always balanced.

2. **`app/src/pwa/useElapsed.ts`** — the four-line React side: subscribe to
   `document.visibilitychange`, call `pause`/`resume`, tick while visible.
   The split mirrors `domain/feedback/haptics.ts` (pure, tested) against
   `pwa/haptics.ts` (four lines), which is how #57 split the same shape.

3. **`StudyPage.tsx`** — replace the bare interval with the hook. The timer stays
   **per question**, which it already is and which is correct; the brief's worry
   about timers resetting on next-question clicks does not apply here.

4. **Stop the interval when the tab is hidden.** A 200 ms interval in a
   backgrounded PWA is throttled but not free.

### Decisions to make explicitly

- **A question paused mid-answer resumes; it does not restart.** Restarting
  would hand back time somebody already spent thinking, which is a way to farm
  the speed bonus by backgrounding the app.
- **Cap the pause?** A question paused for six hours and resumed is not a fair
  measurement of recall either. Recommendation: resume normally, and let the
  20-second limit do its own work — a capped pause is a rule nobody can see.

### Done when

- `clock.test.ts` covers unbalanced pause/resume pairs and monotonic `elapsed`.
- Backgrounding mid-question and returning leaves the countdown where it was.
- `npm test`, `npm run typecheck` green. No `styles.css` change, so no
  `study:build`.

---

## Phase 2 — Goals you can see before you can reach them

**Size:** medium. Read-only additions on top of tested logic.
**Why second:** §2.3 of the brief is right about where retention lives, and #57
built the whole ladder without building its shop window. The logic is done; it
renders nowhere.

### The problem

`together.ts` exports `tierAt`, `nextTier` and `pointsToNext`. The dashboard
shows none of them. Evergreen sits at 2600 points — most of a year of both
partners logging daily — and there is nothing on screen that says it exists.
A goal nobody can see from day one is not a long-horizon goal; it is a surprise.

The brief's own mitigation is the specification: *"Show progress percentage from
day 1; give near-miss feedback."*

### The work

1. **`app/src/domain/rpg/unlocks.ts`** — declarative, as the brief asked, and in
   `domain/` rather than a new `src/game/`:

   ```ts
   export interface Unlock {
     id: string;
     name: string;
     blurb: string;
     /** What it is: a look, a screen, or a thing the pet can now do. */
     kind: 'cosmetic' | 'feature' | 'status';
     check(state: UnlockState): { eligible: boolean; progress: number };
   }
   ```

   `progress` is 0–1 and **must be defined before eligibility** — that is the
   entire point of the module. `UnlockState` is assembled by the caller from
   things that already exist: loyalty points, pet level, together tier,
   lifetime study sessions, shared streak.

2. **Four or five unlocks**, re-aimed at this app's actual model (see §5 for what
   changed and why):

   | Unlock | Condition | Roughly | Kind |
   |---|---|---|---|
   | Shared Aura | Together tier `Rooted` (1200 pts) | ~3 months | cosmetic |
   | Chronicle Archive | 50 study sessions across both members | ~3–4 months | feature |
   | Ascendant stage | Shared pet past Guardian (level 21) — **one pet, not two** | ~5 months | mechanic |
   | Evergreen Frame | Together tier `Evergreen` (2600 pts) | ~6–9 months | status |

   Every condition reads a lifetime total that can only grow, matching the
   property `together.ts` deliberately has: a tier you cannot fall out of.

3. **A locked-goals card on the dashboard.** Two goals at a time, each with a
   real progress bar and a real number — *"1,047 of 1,200 · 87%"*, not a
   percentage alone. The brief's first risk is "stat scaling feels grindy", and
   its mitigation is exact numbers, so print exact numbers.

4. **A "nearest goal" line**, since `pointsToNext` already computes it.

### Deliberately not doing

- **No new currency.** Coins exist, `applyPayout`/`spend` exist, studying
  already pays them. See §5.
- **Nothing subtracts.** `rpg/types.ts` rules that daily life never takes
  anything away and #57 held that line through the whole retention feature. No
  unlock may expire, decay, or be lost.
- **No countdown.** #57's reasoning stands word for word: a countdown tells
  somebody who has had a hard fortnight that they are now also late.

### Done when

- `unlocks.test.ts` pins every threshold and asserts `progress` is monotonic in
  each input and clamped to 0–1.
- The dashboard shows a locked goal with a real number on a fresh install.
- `styles.css` almost certainly changes → **`npm run study:build`, commit
  `study/index.html`**, or CI fails on the diff.

---

## Phase 3 — Nursing cards inside Heartbeat's learn mode

**Size:** medium, and front-loaded with one content decision.
**Why last:** it is the only phase that crosses a repo boundary, and it is worth
nothing until Phases 1 and 2 make the learn loop good.

### What is already true

The bridge is built and runs **study app → Heartbeat**: a scoped token minted by
`/api/study/link`, sessions POSTed to `/api/study/session`, replay-safe via a
deterministic `study-<sessionId>` award id, capped at 120 XP per member-day,
dated in the member's timezone. The nursing app queues offline and drains.

**Keep all of it.** The brief's email + JWT + AuthBridge design would trade a
one-route token for a broader bearer, add an email address to an app whose
README promises it holds none, and add a fourth deploy target for two users.
`docs/CURRENT_STATE.md` §4 makes that case in full.

What is missing is **content**: Heartbeat's nine decks are developer topics
(js, react, git, sql…). Jenny's 126 cards are ATI TEAS 7 science. Nothing
carries the second into the first.

### The blocking decision — `why`

`Card` requires a `why` field, and the type comment says exactly why: *a
flashcard that only asserts teaches recall of a string, and the point is to
learn the thing.* The source cards are `{ category, subcategory, question,
answer }`. **There is no rationale in the data.**

Three honest options, and this is a content call, not a code call:

| Option | Cost | Effect |
|---|---|---|
| **A.** Author rationales for the 126 cards | Real work, in the study repo, once | Keeps the rule; best learning outcome; helps both apps |
| **B.** Make `why` optional for imported cards | One type change, ripples into the screen | Weakens a rule the repo chose deliberately |
| **C.** Synthesise a `why` from `subcategory` | Cheap | Fake rationale is worse than none — recommend against |

**Recommendation: A**, done in `Jenny-s-Study-Guide/data/flashcards.js` so both
apps benefit, with B as the fallback if that stalls. Do not start Phase 3 before
this is settled.

### The work

1. **`app/src/bridge/maStudyAdapter.ts`** — the adapter layer, which the brief
   is right about: it survives schema changes in the nursing app without
   rewriting Heartbeat's core.

   ```ts
   function mapNursingCard(raw: NursingCard): Card {
     return {
       id: `ma-${slug(raw.category)}-${index}`,   // stable across re-imports
       deckId: `ma-${slug(raw.category)}`,
       question: raw.question,
       answer: raw.answer,
       why: raw.rationale,                         // see the decision above
       difficulty: difficultyFor(raw.subcategory),
     };
   }
   ```

   **Card ids must be stable across re-imports.** `CardProgress` is keyed by
   `cardId`; ids that shift on re-import silently reset somebody's schedule.
   Derive from content, never from array position alone.

2. **How the cards travel.** In increasing order of cost — take the cheapest
   that works:
   - **Build-time import.** A script reads `flashcards.js`, emits
     `app/src/content/study/nursing.ts`, and it registers in `DECKS` like every
     other deck. No network, no auth, no new route, works offline on day one.
     **Recommended.**
   - **Runtime fetch + manifest.** Needed only if the cards must change without
     a Heartbeat deploy. Costs a route, a cache, and a sync story.

   Do not build the second until the first is proven insufficient. The brief's
   "store a deck manifest locally, fetch content on demand" is the right shape
   for a large remote catalogue; 32 KB of cards compiled into a bundle that
   already precaches 882 KB is not that.

3. **Register the deck.** `app/src/content/study/index.ts` — one line, the same
   as the other nine.

### Phase 3b — the GLB models, deferred on purpose

Eight models, **31 MB**. The service worker precaches 12 entries at 882 KB
today. If these enter the precache manifest the install becomes a 32 MB
download on a phone.

If it is built: lazy-load on demand from the study app's own origin, render in a
modal, cache nothing, and assert in a test that no `.glb` is in the manifest.
Defer until Phase 3 is stable and somebody actually wants it inside Heartbeat
rather than in the app that already has it working.

### Done when

- `maStudyAdapter.test.ts` proves id stability across re-import and that every
  produced card satisfies `Card`.
- A nursing deck appears in the picker and runs through review and quiz
  unchanged — no new quiz code, because `choicesFor` builds distractors from the
  deck it is given.
- Bundle size checked before and after.

---

## 4 · Standing rules for every phase

From `CLAUDE.md` and the audit. These are the ones a v2 branch will actually
trip over:

- **Rules go in `domain/`, with a test beside them.** No `src/game/`. Vitest
  collects `*.test.ts` only; components are not unit-tested by design, so any
  logic that matters must not live in a component.
- **`db/repository/` is a directory.** New section = new file + one `export *`
  in alphabetical order. Never append to an existing section.
- **Editing `app/src/styles.css` means `npm run study:build` and committing
  `study/index.html`.** CI fails on `git diff --exit-code`.
- **A new holding kind is four edits plus a migration** — client `HOLDING_KINDS`,
  `KINDS` in `api/holdings.ts`, the D1 `CHECK` (rebuild the table; SQLite cannot
  alter one in place), and a `storeFor` case. Only `holdings.test.ts` keeps them
  in step.
- **`PARTNER_WRITABLE_KINDS` is a security decision; `PARTNER_VISIBLE_KINDS` is
  a display decision.** Card progress, if it ever syncs, is visible — not
  writable.
- **Day keys use the member's timezone**, never UTC.
- **Never call `loadSettings()` inside a `useLiveQuery` callback.**
- **Nothing in daily life subtracts.** Health exists only inside a boss fight.

Verification gate for every phase, all of it green before a push:

```bash
npm run typecheck        # both workspaces
npm run check:config
npm test                 # 1536 app + 138 worker at baseline
APP_BASE=/ npm run build
npm run study:build      # if styles.css changed; commit the artefact
```

---

## 5 · Dropped, re-aimed, and why

Stating these plainly because each one is a place where the brief and the code
disagree, and the code has a reason.

**Dropped: a new "Pulse" currency.** `Avatar.coins` already exists with
`applyPayout`, `canSpend` and `spend`; `STARTER_COINS = 120`; and every accrual
the brief wants Pulse to have is already wired to coins, studying included
(`COINS_PER_CARD = 1`, capped at 60 cards a day). A fourth currency beside
coins, energy and MP would split the same economy in two and make every price in
the shop ambiguous.

**Dropped: `src/game/stats.ts` with `calculateStat(base, level, statType)`.**
This module exists as `domain/rpg/avatar.ts`. The brief's own rule — never store
derived stats, only base and level — is what `sheetFor()` already enforces: the
only persisted numbers are `xp`, `coins`, `energy`, `mp`, `gear`. Its per-stat
differentiation is also a design the repo rejected on purpose: for a party of
two, one person's build can lock the other out of a boss and there is nobody
else to call.

**Dropped: `upgradeCost(level) = 50 × 1.15^level` as a coin-spent stat track.**
Levelling is already super-linear (`GROWTH = 1.35`) and already gated at
milestones by stages, skills and gear rarity. A parallel coin-for-stats track
would let one partner out-buy the other on the one axis the no-classes rule
exists to keep flat.

**Re-aimed: "Dual Pet Fusion — both partners' pets at level 50."** There is one
shared pet per couple, not one each; `/api/pet` owns its XP precisely so a
shared bar cannot be credited twice. Re-aimed to an Ascendant stage past
Guardian on the shared pet, which is the same feeling inside the model that
exists.

**Dropped: email-keyed bridge auth, JWTs in `sessionStorage`, and a NestJS auth
service.** Covered in full in `docs/CURRENT_STATE.md` §4. Short version: the
scoped token is smaller, the email is a promise the README makes, and a fourth
deploy target for two users is not a trade worth making.

**Kept, unchanged, and worth saying so:** the adapter pattern, "show progress
from day one", "never store derived stats", the SM-2 field list, pausing the
timer on visibility change, and the instinct to phase ingestion rather than
mirror a whole database. Those were all right.

---

## 6 · Risks

| Risk | Mitigation |
|---|---|
| Rebuilding what exists | This document and `docs/CURRENT_STATE.md`. Before writing a module, grep `domain/` for its nouns. |
| Phase 3 stalls on missing `why` rationales | Settle the content decision **before** starting Phase 3; Phases 1–2 do not depend on it. |
| Imported card ids shift and reset schedules | Derive ids from content; pin with a test. |
| 31 MB of GLB models enter the precache | Phase 3b is deferred; when built, assert no `.glb` in the manifest. |
| `study/index.html` drifts and CI fails | `npm run study:build` after any `styles.css` edit, every time. |
| Long-horizon goals feel impossible | Exact numbers on the progress bar, not percentages alone. |
| No security scanning in a repo that now holds auth code | Out of scope here, flagged in #57, and worth its own small PR. |

---

## 7 · Order of work

1. **Phase 1** — timer pause. Smallest, fixes a real defect, no dependencies.
2. **Phase 2** — visible locked goals. Renders logic that already ships.
3. **Content decision** on `why` rationales. Blocks Phase 3, blocks nothing else.
4. **Phase 3** — nursing deck import via build-time adapter.
5. **Phase 3b** — GLB viewer, only if wanted, and only lazy-loaded.

One PR per phase. Each is independently revertible, and none of them needs a
long-lived branch.
