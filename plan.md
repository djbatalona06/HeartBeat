# plan.md — Heartbeat v2: stats, learning, and the study bridge

> **Status.** Phase 2 (goals you can see before you can reach them) shipped as
> `domain/rpg/unlocks.ts`. Phases 1 and 3 were about the in-app Study screen and
> its card decks, and the Study screen has since been removed, so those phases
> were cut from this file. What remains of the study idea is the XP link
> (`app/functions/api/study/`, Settings → Connections), which lets a separate
> study app feed the pet. The rest of this file is kept for the reasoning in
> §5, which still holds.

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

*Cut: it was about the Study screen, which has been removed.*

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

---

## Phase 3 — Nursing cards inside Heartbeat's learn mode

*Cut: with the Study screen gone there is no learn mode to put cards in. The study
XP link (`/api/study/link`, `/api/study/session`) stays as built: a scoped token,
replay-safe `study-<sessionId>` award ids, capped at 120 XP per member-day.*

---

## 4 · Standing rules for every phase

From `CLAUDE.md` and the audit. These are the ones a v2 branch will actually
trip over:

- **Rules go in `domain/`, with a test beside them.** No `src/game/`. Vitest
  collects `*.test.ts` only; components are not unit-tested by design, so any
  logic that matters must not live in a component.
- **`db/repository/` is a directory.** New section = new file + one `export *`
  in alphabetical order. Never append to an existing section.
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
| Long-horizon goals feel impossible | Exact numbers on the progress bar, not percentages alone. |
| No security scanning in a repo that now holds auth code | Out of scope here, flagged in #57, and worth its own small PR. |

---

## 7 · Order of work

Phase 2 is the only phase that was built (see the status note at the top). It
went in as its own PR, independently revertible, with no long-lived branch.
