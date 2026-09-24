# Garden D-pad — design

**Status:** approved 2026-09-24 (brainstorm, item A).

## Problem
Eve's Garden already walks: arrow keys and WASD in `BattleGardenScene.onKey`,
and on a phone "tap a tile beside you" in `onPointer`. Both call the scene's
public `step(dx, dy)`. What's missing is a control you can *see*. Tapping the
canvas works, but nothing shows it's there except a line of hint text under
the fight.

## Decisions
| Question | Decision |
|---|---|
| New movement logic? | None. The pad calls the existing `step()`, so walls, the monster tile and "walk into it to fight" behave the same for all three inputs. |
| Where does it sit? | Over the canvas, bottom-right, inside the garden's stage box. |
| When is it shown? | Only while walking: hidden during a fight (`battle.outcome === 'Fighting'`), and absent in text mode, because there's no canvas to walk on. |
| Centre button? | No. The garden has no "interact" verb: engaging is walking into the monster. A button with nothing behind it is YAGNI. The centre is a blank hub. |
| Hold to keep walking? | Yes. Pointer down steps once, then repeats every 180 ms until the pointer is released or leaves the button. `step()` already refuses while a tween runs, so a repeat can never stack. |
| Fade when idle? | No. At 30% opacity the pad would fail 1.4.11 non-text contrast, and it's small enough not to cover anything that matters. |
| Haptics? | Yes, through the existing `buzz()`: `tap` on a step, `error` when blocked. Same Settings toggle and the same Calm override as every other buzz. |

## Design
1. **Boundary.** `SceneHandle` gains `step(dx, dy): StepResult`, where
   `StepResult = 'moved' | 'blocked' | 'engaged' | 'busy'`. `BattleGardenScene.step`
   returns the same value. `onKey` and `onPointer` ignore it, so their behaviour
   doesn't change. `game.ts` forwards the call and returns `'busy'` until the scene is live.
2. **Component.** `features/eve-garden/DirectionPad.tsx` is a `role="group"`
   labelled "Walk". It holds four `<button>`s named "Walk up / down / left / right"
   with ▲▼◀▶ glyphs, each at least 44×44 CSS px, laid out in a 3×3 grid with an
   empty centre. It is pure DOM with no Phaser import. It takes a
   `onStep(dx, dy) => StepResult` prop and owns the hold-to-repeat timer. The
   timer is cleared on `pointerup`, `pointercancel`, `pointerleave`, `blur` and
   unmount.
3. **Keyboard.** The buttons are real buttons, so Tab reaches them and
   Enter/Space steps. Arrow keys keep working on the canvas as they do today.
   The pad doesn't take arrow keys itself (one owner per key).
4. **Page.** `EveGardenPage` renders the pad inside the stage wrapper when a
   scene exists and no fight is open. The hint text becomes "Arrow keys, WASD,
   the pad, or tap a tile beside you."
5. **Style.** `.garden-dpad` is absolutely positioned bottom-right. The buttons
   use surface/ink tokens (no new colours) with a visible `:focus-visible` ring.
   Under forced colours, a `ButtonText` outline replaces the fill.

## Testing
- `DirectionPad` is a component, so there's no unit test (repo rule). The
  hold-to-repeat maths is a pure helper, `repeatDelay`/the constants, in
  `features/eve-garden/dpad.ts` with `dpad.test.ts`: the direction table maps
  to unit vectors, and repeat starts after the first step.
- `npm run typecheck`, `npm test`, `APP_BASE=/ npm run build`, then
  `npm run visual` (axe on the garden route in both themes). Delete the frames
  it leaves behind.
