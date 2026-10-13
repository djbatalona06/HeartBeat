# Spec: new 3D battle boards + landscape for Eve's Garden

## Context

Eve's Garden's battle board is one 11x7 checkerboard. `arenaScene.ts` bakes it once from straight above, which is why it looks flat, and Phaser draws the walls, water and stone on top as pixel art. The page is portrait-only: `.garden-stage` is `36dvh` tall and the move pad, log and tab bar are stacked underneath it. Rotate an iPhone and the board shrinks to about 140px.

**Asked for:**
1. New boards for Eve's Garden's battle board. They are not per-island.
2. Boards keep the colours of the chosen theme and pet.
3. Boards are 3D. Decision: baked now, live later.
4. Eve's Garden works in landscape on iOS.

**Constraints I am keeping (from CLAUDE.md):**
- One WebGL context at a time. Bake, copy to a 2D canvas, release the GPU, then start Phaser.
- three.js stays in the lazy `mascot3d` chunk. Nothing under `mascots/3d/` may value-import from outside `3d/`, and nothing outside may import in.
- `domain/rpg/arena.ts` is the only authority on the grid. The picture and `isWalkable` must be one grid.
- Calm, Save-Data and no-WebGL make no request and fall back to the static 2D floor.
- Colours come only from blends of the five tokens the pack already owns. No new hues.

## Part 1: Board kits (what "new boards" means)

A **board kit** is a cosmetic look for the same 11x7 grid. It does not change layout, stats or walkability. Proposed starter set (names and count are my assumption, easy to change):

| Kit | Look |
|---|---|
| `checker` (default) | Today's checkerboard, now with raised rim, raised hedge and stone, sunken water |
| `terrace` | Same grid with tiles at slightly different heights, like low steps |
| `inlay` | A ring of inlaid tiles around the spawn and monster tiles |
| `quilt` | Patchwork of three tones instead of two |

**Not an ownable item.** CLAUDE.md says everything ownable must carry a raid stat (`loadout.test.ts` enforces it). Boards are cosmetic, so they are a plain setting, not a catalogue entry. Add an optional `Settings.boardKit` (no migration, device-local, not synced). Default is `checker`. Add one picker row in Settings. Nothing changes in holdings sync, so the four-edit rule for new holding kinds does not apply.

**Adding a kit** means adding an entry to a `BOARD_KITS` list in `domain/rpg/boards.ts` (pure, tested) plus its GLB file. No new code paths.

## Part 2: Theme and pet colours stay exactly as they are

- The colour source does not change: `arenaTokensForPet(companion, sceneMode)` -> `arenaPaint()`.
- `tileA`, `tileB` and `grout` keep their current formulas. A test pins their output for all 5 packs x light/dark so the existing look is byte-identical.
- New roles are added to `ARENA_ROLES` and painted only by `mix()` of the existing five tokens: `rim`, `hedge`, `water`, `stone`, `gate`, `bed`, `inlay`, `tileC` (quilt).
  - `water` blends toward `accent`/`success`. `hedge` blends toward `success`. `stone` blends from `text`/`base`.
  - Each new role is checked for the same contrast guard the existing arena test uses, so pieces stay distinct from the floor and the pet and foe stay readable.
- The cache key (`floorCacheKey`) already hashes the five tokens. It gains the kit id and the stage layout.

## Part 3: Making it 3D (baked)

**Projection: oblique, not tilted.** The camera stays orthographic but gets a vertical shear, so ground points land on the same pixels as today (tile (col,row) -> same x,y), and raised things lean upward on screen (height h moves up by `h * SHEAR`). This is what lets the Phaser grid, `depthForRow`, tap targets and movement stay unchanged. A real tilted camera would squash the rows and break all of that.

- Raised pieces are capped at about 0.35 tile. Row 0 (the outer rim) gets zero lift so nothing is clipped off the top of the canvas.
- Walls and stone show their south face inside their own cell. Sprites draw above the floor image, so a pet walking past reads as standing in front.

**Pieces, not a flat plate.** `tools/arena-glb.mjs` is extended to write one deterministic GLB per kit, containing named template pieces (`floorA`, `floorB`, `rim`, `hedge`, `water`, `stone`, `gate`, `bed`). Material names are roles. The bake clones a template into each cell using the stage's rows from `arenaFor()`. Layout therefore comes from the same `rows` data the walk uses.

**Pixel sprites.** When a 3D bake succeeds, the scene skips the pixel tiles for every kind the bake draws (hedge, water, stone, gate, bed, grass, path). When the floor is the static 2D fallback or a bake failure, the pixel sprites stay, so walls never vanish. This is keyed on the existing `dataset.arena3d` flag.

**Live later (the seam only, no live code now).** Split `bakeArena` into:
- `buildBoardScene(kit, arena, paint)` -> a three `Scene` (pure assembly, no renderer),
- `boardCamera(cols, rows, shear)` (shared projection),
- `renderBake(scene, camera)` (the offscreen draw and release that exists today).

A later live mode reuses the first two with a persistent renderer. It also fits the 2D/3D toggle already planned after Island 10 in `docs/planning/ISLANDS_11_20_SCAN.md`.

**Cache.** `FLOOR_CACHE_MAX = 3` becomes about 8, since the key now includes the stage. The parsed GLB is cached per kit so a stage change does not refetch.

## Part 4: Landscape on iOS

**What exists:** `viewport-fit=cover`, `100dvh` and safe-area insets are already used. Phaser is `FIT`. The manifest says `orientation: 'portrait'`, but iOS ignores that, so iOS already rotates and the layout just was not designed for it.

**Layout** (in `styles/legacy/34-engine-garden.css`, new rules in the `features` layer, not more `legacy`):
- Breakpoint: `@media (orientation: landscape) and (max-height: 520px)`.
- Two columns: board on the left at full usable height, a scrolling right column for the foe strip, move pad and charge meter.
- Board box height `calc(100dvh - safe-top - safe-bottom - tab bar)`; 11x7 is 1.57:1, so on 844x390 it is roughly 550 wide.
- Pad both sides with `env(safe-area-inset-left/right)` for the notch.
- The d-pad moves beside the board instead of under it.
- Sticky positions and `--z-*` tokens only. No raw hex and no raw z-index (`styles.test.ts` enforces both).
- Tab bar: keep it, with labels (the scan doc requires visible labels). Use a smaller `--tabbar-h` in short landscape, to be tuned on a device.

**Rotation correctness.** iOS reports a stale height right after rotation. Add a `SceneHandle.refit()` that runs `game.scale.refresh()` after two `requestAnimationFrame`s, triggered by `orientationchange`, `resize` and `visualViewport` resize.

**Manifest.** Leave `orientation: 'portrait'` for now (iOS ignores it, and the rest of the app was not designed for landscape). If landscape is wanted on installed Android, change it to `'any'` and check every other page. Flagged as an open item.

## Files to touch

| File | Change |
|---|---|
| `app/src/domain/rpg/boards.ts` (+ test) | New: `BOARD_KITS`, ids, which tile kinds each kit draws |
| `app/src/features/pet/mascots/3d/arenaPalette.ts` (+ test) | More roles; the three existing ones pinned |
| `app/src/features/pet/mascots/3d/arenaScene.ts` | Split into `buildBoardScene` / `boardCamera` / `renderBake`; oblique shear |
| `app/src/features/pet/mascots/3d/arenaFinish.ts` | Finish pass kept; adjust for shear headroom |
| `app/src/features/eve-garden/arenaFloor.ts`, `arenaCanvas.ts` | Kit and layout in the cache key and the static fallback |
| `app/src/features/eve-garden/scene/BattleGardenScene.ts` | Skip pixel tiles only when the floor is a real 3D bake |
| `app/src/features/eve-garden/scene/game.ts`, `events.ts` | `refit()` on the handle |
| `app/src/features/eve-garden/EveGardenPage.tsx` | Pass kit and stage layout; call `refit` on rotation |
| `app/tools/arena-glb.mjs` (+ `arenaModel.test.ts`) | One GLB per kit with named pieces; test checks bounds, material names and piece names |
| `app/src/styles/features/` (new) | Landscape layout for the garden |
| `app/src/features/settings/` | Board picker row; optional `Settings.boardKit` |
| `app/tools/visual.mjs` | Add landscape frames (844x390 and 932x430) for the garden |

## Verification

1. `npm run typecheck` and `npm test` (includes `arenaPalette`, `arenaModel`, `arenaChunk`, `styles` tests). The three old roles must be unchanged for all 5 packs x 2 modes.
2. `npm run arena:glb --workspace app`, then confirm the output is byte-identical on a second run (determinism).
3. `APP_BASE=/ npm run build`, then `npm run visual`. This must be run before any push that touches `app/tools/`. It needs the .NET SDK, which the session hook already installed. Delete the generated `app/tools/baselines/` frames afterwards; do not commit them.
4. Look at each kit under at least two packs in light and dark, and confirm the colours match the pet's pack and not the app's theme.
5. Calm and Save-Data: no request for a `.glb`, static floor with pixel walls still visible.
6. Landscape: 844x390 and 932x430 show the board at full height with the controls reachable, no horizontal scroll, and the notch not covering anything. Axe passes. Then rotate on a real iPhone, since iOS rotation timing differs from a desktop emulator.
7. `npm run lighthouse`-style gate: no chunk may statically import `mascot3d`.

## Open items to confirm during review

- Kit names and count (4 proposed).
- Whether the picker lives in Settings only or also on the Raid Gate.
- Android landscape (manifest `orientation`).
- Tab-bar treatment in short landscape (compact bar vs. side rail).
