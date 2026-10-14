# Eve's Garden game buttons — design

**Status:** draft for review (2026-10-13). Written without a live brainstorm, so every decision below is a proposal. The open questions at the end need an answer before the implementation plan.

## Problem

The garden's game buttons are split across three components and two layouts:

| Control | Where | What it does |
|---|---|---|
| Walk pad (▲▼◀▶) | `DirectionPad.tsx`, under the board | Steps the pet. Hold to keep walking. |
| Move pad (six tiles) | `ActionBar.tsx` `MovePad`, below the board | Physical, Defensive, Magic, Mend, the couple's move, the finisher. Only in a fight. |
| Walk away | `ActionBar.tsx` `FleeButton` | Leaves a fight. |
| Charge chip | `ChargeMeter.tsx` `ChargeChip` | Opens today's charges in a sheet. |

PR 160 did not change these controls. PR 161 (open) changed the layout around them: on a phone turned sideways the page becomes two columns, and the move pad sits in the right column. Nothing in the spec yet says how the walk pad, move pad and flee button should sit together in portrait and in landscape, so each change has moved them without a plan.

## Goals

1. One clear control cluster that works the same way in portrait and landscape.
2. Every button is at least `--tap` (44 px) and reachable by thumb without covering the monster.
3. No change to game rules. Every button calls the handler it calls today: `step()`, `playRound`, flee.
4. Tokens only: no new colours, no raw z-index, no hex outside a `var()` fallback (`styles.test.ts` enforces this).

## Non-goals

- New moves, new charges or new fight logic.
- Redesigning the move tiles' art or their badges.
- Changing the landscape rail (that is in PR 161).

## Proposed design

**Placement (proposal):**
- **Portrait:** board, then the walk pad and the flee button on one row, then the move pad. The walk pad stays under the board, right-aligned, as `garden-dpad` does now.
- **Landscape:** board on the left with the walk pad under it. Move pad and flee button on the right, as PR 161 lays them out. Only the grid placement changes; no button is moved out of its column.

**Structure:**
- `DirectionPad`, `MovePad` and `FleeButton` keep their props and handlers. Their markup does not change, so the tests and the keyboard behaviour stay put.
- A new wrapper, `garden-controls`, groups the three in the order above. It is layout only: it has no state and no logic. The class name already exists in `34-engine-garden.css`, so the new rules go in `styles/features/garden.css` and must not collide with a legacy class (`pad-*` already belongs to the move tiles).

**Behaviour (unchanged):**
- Walk pad: pointer down steps once, then repeats every `HOLD_REPEAT_MS` until release. Arrow keys and WASD stay on the canvas.
- Move pad: disabled off your turn, while busy, or while a cooldown runs. Out of a fight it folds to one line.
- Flee: only in a fight, and only on your turn.

**Haptics:** unchanged. Each press calls `buzz()` before any async work.

## Testing

- `styles.test.ts` covers the new CSS rules.
- A unit test on the placement rules, if they are pulled into a helper. Components are not unit-tested by design (CLAUDE.md).
- `npm run typecheck`, `npm test`, `APP_BASE=/ npm run build`.
- `npm run visual` in both portrait and landscape (the landscape frames from PR 161 already exist). Axe must pass in both themes. Delete the generated frames in `app/tools/baselines/` before committing.
- Manual: a real iPhone in both orientations. A desktop emulator cannot judge the notch or the home bar.

## Open questions

1. **What is "new" about the buttons?** A visual rework, a new arrangement, or new buttons that do something (for example, a visible charge button)? This spec assumes a rearrangement and touches no behaviour.
2. **Which base?** PR 161 is open and changes the same layout. Build on 161's branch, or wait for it to merge?
3. **Portrait order.** Is the proposed order (board, walk and flee, move pad) right, or should the move pad sit above the walk pad?
4. **Charge chip.** Keep it beside the move pad, or move it next to the walk pad?
