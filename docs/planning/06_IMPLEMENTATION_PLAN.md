# 06 · Implementation Plan

Six phases, each independently shippable and revertible. **One branch, one PR and
one fresh session per phase**, in the order spec → plan → build → test → you review.
Do not start a phase until the previous one meets its "Done when".
Tests come before code for every pure module. One small commit per numbered step;
stop at each checkpoint. Close each session with the `/ponytail` skill.

Numbering note: these letters replace the "Phase 1/2/3" numbering in `plan.md` and
`docs/WELLNESS_GAME_PLAN.md`, which collided. See `MERGED_PLAN.md` §1 for the map.

## Step 0 — audit before feature code (read-only, ~15 min)

- Run what was not run while planning: worker tests, `npm run game:test`,
  `npm run check:config`, `npm run ui:check`.
- Read `companionSkills.ts` for the exact skill names (only Wishbell's were read).
- Read what `BattleLog` prints per turn and where `battle.log` text comes from in C#.
- Confirm whether `app/tools/visual.mjs` reaches the garden route under axe.
- Done when: a one-page note says which assumptions in these docs were wrong.

## Round 1

### Phase A — Quiz timer pauses when hidden (plan.md Phase 1)
1. **You first:** write `clock.test.ts` cases — unbalanced pause/resume, `elapsed`
   never goes backwards, pause-on-paused is a no-op.
2. `domain/study/clock.ts` (pure): `start`, `pause`, `resume`, `elapsed`.
3. `pwa/useElapsed.ts`: subscribe to `document.visibilitychange`, tick while visible.
4. `StudyPage.tsx:453`: replace the bare interval; timer stays per question.
- Decision (plan.md): a paused question **resumes, never restarts** (restarting
  would let you farm the speed bonus by backgrounding). Don't cap the pause.
- Done when: backgrounding mid-question and returning leaves the countdown where
  it was; `clock.test.ts` green; `npm test` + `typecheck` green. No `styles.css`
  change, so no `study:build` — but run it anyway if anything reachable from
  `standalone.tsx` moved.

### Phase B — Fight scene: calm and accent
1. **You first:** write `strikePlan.test.ts` (mirror `levelUpAnimator.test.ts`):
   calm ⇒ all zeros; non-calm totals under a stated ceiling.
2. `domain/scene/strikePlan.ts`: `strikePlan({ calm, kind })`.
3. `BattleGardenScene.ts`: accept `calm` (plus read `prefers-reduced-motion`);
   `strike`/`skill` resolve after one still frame under calm. Add a `calm` setter or
   creation arg to `SceneHandle` in `events.ts` and pass it from `EveGardenPage.tsx:121`.
4. Replace `const accent = 0xffffff` (`skill()` ~318) with the theme accent, read once
   at creation beside `applyLighting`.
- Done when: under calm a fight round plays no tween and adds no delay; accent
  follows the pack; `strikePlan.test.ts` green; `npm run visual` axe clean.

### Phase C — Per-move, per-companion effects (hybrid)
1. **You first:** sketch one companion's three effects as shape + palette token +
   count + timing.
2. `events.ts`: `strike(blow, effectiveness, { move, kit })`; update `game.ts:80`
   wrapper and the two call sites (`EveGardenPage.tsx:568`, `:582`).
3. `scene/vfx.ts`: `MOVE_VFX[themeId][move]` ×15; extend `vfx.test.ts` two-way
   (every kit × move has an entry; every entry is reachable).
4. Palettes from theme tokens; extend the contrast proof to 5 packs × 2 modes.
5. Battle log / live region names the move and effect (check C# `battle.log` first;
   only add TS text where C# doesn't already say it).
6. Bespoke signature piece per companion: primitives first; sprites only if
   primitives can't carry it, and then lazy, outside the entry chunk and precache.
7. Extend the originality guard tests to any new art file.
- Done when: 15 distinguishable effects across the five companions; no two share a
  palette-and-motion pair for the same move; calm shows none of the motion and all of
  the information; Lighthouse confirms no three.js/Phaser leak into the entry chunk.

## Later rounds (planned, not started)

### Phase D — Visible goals and wellness framing
- Remaining from `plan.md` Phase 2: `domain/rpg/unlocks.ts` (declarative; `progress`
  0–1 defined **before** eligibility) and a locked-goals card with exact numbers.
  (`TogetherPanel` already shows next tier and points-to-go — don't rebuild it.)
  Candidate unlocks: Shared Aura @ Rooted (1200), Chronicle Archive @ 50 study
  sessions, Ascendant stage @ pet level 21+, Evergreen Frame @ 2600.
- Wellness copy pass: person-first strings. Decide the "today ring" question.
- `styles.css` will change ⇒ `npm run study:build`, commit `study/index.html`.
- Done when: `unlocks.test.ts` pins thresholds and monotonic, clamped progress; a
  fresh install shows a locked goal with a real number; nothing subtracts or counts down.

### Phase E — Level-up reveal
1. Update `docs/superpowers/specs/2026-09-24-levelup-moment-design.md` decisions
   table first (text reversal, all kinds big).
2. `domain/pet/levelUp.ts`: `isBigLevelUp` covers every `MilestoneKind`; add a pure
   `levelUpReveal(seen, now)` returning the crossed milestones. Tests first.
3. `features/pet/useLevelUpMoment.ts` + Home: one reveal line, announced via the toast
   host; `LEVEL_UP_TIMING.big` stays under 1.6 s.
- Done when: every milestone kind plays the big moment; the line names what opened;
  calm shows the text without motion; manual check with `hb.petLevelSeen` set low.

### Phase F — Accessibility sweep, study kinds, nursing decks
- **Accessibility:** keyboard-only garden and Raid Gate; VoiceOver (iOS is the install
  target); 200% zoom and 320 px on every route; a font-size setting if absent; add
  the garden to the axe walk if missing; contrast for every new palette.
- **Study kinds:** add `recall` / `battle` to `STUDY_XP` only when a client sends them.
- **Nursing decks** (`plan.md` Phase 3): settle the `why` decision first; build-time
  adapter, content-derived stable card ids, test id stability across re-import;
  check bundle size before/after. GLB viewer stays deferred (31 MB, never precached).
- Done when: each item has a recorded manual pass, not just axe (axe covers roughly a
  third of WCAG issues).

## Adjacent backlog (from `docs/AUDIT_ROADMAP.md`, not part of this round)

Visual-regression baselines from a green CI `visual-frames` artifact · sync quests
and achievements · data export · weekly note via `/api/ask` · confirm Lighthouse
fails on score regressions, not only the precache budget.

## Learning checkpoints

| Phase | You do this yourself first | What it teaches |
|---|---|---|
| A | The `clock.test.ts` cases | Pure state machines, unbalanced events |
| B | The `strikePlan.test.ts` cases | "Calm means zero" as a testable contract |
| C | One companion's effects on paper | Design constraints: five shapes, colour carries identity |
| D | Rewrite three strings person-first | Copy as design |
| E | What the reveal says at level 7 and level 40 | Reward pacing |
| F | One keyboard-only garden run | What axe can't see |

## Risks

| Risk | Mitigation |
|---|---|
| Rebuilding what exists | Grep `domain/` for the nouns first (Step 0); this plan found two already shipped |
| three.js / Phaser leaks into the entry chunk | Keep scene code under `scene/`; Lighthouse fails the build |
| `study/index.html` drifts | `study:build` last, every time |
| Effects too similar at 16 px | Differ by motion, colour and count, not detail |
| Bespoke art adds precache weight | Primitives first; lazy sprites only if needed |
| Level-up reveal feels like a notification | Only name what opened; no "well done" |
