# Garden D-pad — implementation plan

Spec: `../specs/2026-09-24-garden-dpad-design.md`. Runs in this session, alongside the greeting.

1. **Boundary** (`scene/events.ts`, `scene/BattleGardenScene.ts`, `scene/game.ts`)
   - Export `type StepResult = 'moved' | 'blocked' | 'engaged' | 'busy'`.
   - `BattleGardenScene.step` returns it on every path. The keyboard and pointer callers ignore it.
   - `SceneHandle.step(dx, dy): StepResult`. `game.ts` returns `live()?.step(dx, dy) ?? 'busy'`.
2. **Pure helper + test** (`features/eve-garden/dpad.ts`, `dpad.test.ts`)
   - `DIRECTIONS`: four `{ key, label, glyph, dx, dy }` entries. `HOLD_REPEAT_MS = 180`.
   - Test: exactly four unit vectors, one per cardinal direction, and labels unique.
3. **Component** (`features/eve-garden/DirectionPad.tsx`)
   - A group of four buttons in a 3×3 grid. Pointer down steps and starts the repeat
     interval. Up, cancel, leave, blur and unmount clear it. Click with `detail === 0`
     (keyboard) steps once.
   - Buzz `tap` on `moved` and `error` on `blocked`, using `useTheme().calm` and `settings.haptics`.
4. **Page** (`EveGardenPage.tsx`): render inside `.garden-stage-wrap` when the scene is up and
   no fight is open. Update the hint copy.
5. **CSS** (`styles.css`, a new `.garden-dpad` block next to `.garden-controls`).
6. **Verify:** `npm run typecheck`, `npm test`, `APP_BASE=/ npm run build`, `npm run visual`
   (then delete `app/tools/baselines/` frames), and `npm run study:build` **last**.
