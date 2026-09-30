# Merged plan — how the planning docs relate

Four planning/audit documents exist. None is deleted. This file says which parts
of each stay current, which were wrong, and how their phase numbers map.

| Doc | Origin | Role now |
|---|---|---|
| `plan.md` | In-browser session, branch `claude/heartbeat-v2-upgrade-plan-o65x00` | v2 plan: timer, goals, nursing decks. **Stays**, updated by §2 |
| `docs/CURRENT_STATE.md` | Same session | The economy and study-bridge audit. **Stays** as reference |
| `docs/AUDIT_ROADMAP.md` | In-browser session, 2026-09-24 | Whole-app audit. **Stays**; it already records that `plan.md` Phase 2 shipped in a simpler form |
| `docs/WELLNESS_GAME_PLAN.md` | This session (PR #116, closed) | Game-feel audit and first plan. **Stays**, corrected; superseded by `06_IMPLEMENTATION_PLAN.md` |
| `docs/superpowers/specs|plans/` | Earlier sessions | Per-feature specs. The level-up spec needs one decision reversed (Phase E) |

## 1 · Phase map

| Merged | `plan.md` | `WELLNESS_GAME_PLAN.md` | Status |
|---|---|---|---|
| **A** quiz timer | Phase 1 | — | Not built (`clock.ts`, `useElapsed.ts` absent) |
| **B** fight calm + accent | — | Phase 1 | Not built |
| **C** per-move effects | — | Phase 2 | Not built |
| **D** goals + wellness framing | Phase 2 | Phase 4 | **Partly shipped**: `TogetherPanel` shows next tier + points-to-go; `unlocks.ts` and the locked-goals card are not built |
| **E** level-up reveal | — | Phase 3 | Level-up moment **built** (`1fd325a`); reveal line + all-kinds-big not built |
| **F** a11y sweep, nursing decks | Phase 3 / 3b | Phase 5 / §8 | Not built; decks blocked on the `why` decision |

## 2 · What stays, changes, goes

| Item | Disposition |
|---|---|
| Quiz-timer pause (plan.md P1) | **Stays**, verified still missing → Phase A |
| "Nothing renders `nextTier`" (plan.md §2.3, and this session's first grep) | **Wrong now**: `features/pet/TogetherPanel.tsx` renders tier, next tier, points and points-to-go. Only the declarative unlocks + locked-goals card remain |
| Nursing decks, `why` decision, GLB deferral (plan.md P3/3b) | **Stays**, deferred to Phase F |
| Standing rules, dropped/re-aimed list (plan.md §4–5: no Pulse, no `src/game/`, one shared pet) | **Stays verbatim**; the wellness plan agrees with all of it |
| Test baseline "1536 app + 138 worker" (plan.md) | **Update**: app is 2,677 (142 files); worker count not re-run |
| Risk "no security scanning" (plan.md §6) | **Drop**: CodeQL is configured (`docs/CURRENT_STATE.md` traps) |
| Fight findings F1 (same effect for every move), F2 (white accent), F3 (no calm in scene) | **Stays** → Phases B, C. Re-verified in code |
| "Level-up is a hop and a glow; partner sees it via a holdings kind" (wellness doc) | **Corrected**: the moment is specced and built; the partner already sees it because the level derives from the shared pet. No schema, no holding kind |
| Level-up spec "Home only, no on-screen text" | **Reversed by the owner** for the reveal line; Phase E updates the spec |
| "356 `aria-` attributes" (wellness §4) | **Corrected** to ~340; it counted lines |
| "No lint script" (wellness §3) | **Corrected**: no `lint`, but `check:config` and `ui:check` exist; neither was run |
| BattleLog announces move + effect | **Unverified**: it is `aria-live="polite"`; log-line text unread |
| User font-size setting | **Not found** (searched settings/types); unverified |

## 3 · RAG (Red / Amber / Green)

| Area | RAG | Basis |
|---|---|---|
| Types + app tests | **Green** | typecheck clean; 2,677 tests pass |
| Worker / .NET tests, build, visual, Lighthouse | **Amber** | not run while planning |
| Push delivery | **Amber** | crypto pinned to RFC 8291 vectors; real delivery is manual-only |
| Economy, levels, milestones, charges | **Green** | built and tested |
| Level-up moment | **Green** built / **Amber** reveal | reveal line not built |
| Per-move, per-character effects | **Red** | F1, F2: not built |
| Fight canvas accessibility | **Red** | F3: no calm path; log text unverified |
| DOM-screen accessibility | **Green/Amber** | axe gate fails on serious/critical across the walk; manual passes not recorded |
| Quiz timer | **Red** | defect: runs while backgrounded |
| Visible goals | **Amber** | next tier shown; locked-goals card missing |
| Visual-regression pixel diff | **Amber** | baselines not committed (seed-only) |

## 4 · Hand-off

Give Opus `BUILD_PACK.md`. Open questions are listed in `00_HANDOFF.md`.
