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

A **board kit** is a cosmetic look for the same 11x7 grid. It does not change layout, stats or walkability. Five kits (names chosen by the author of this spec; the display name is what players see, the id is what is stored):

| Id | Name | Look |
|---|---|---|
| `checker` (default) | Hearth Checker | Today's checkerboard, now with raised rim, raised hedge and stone, sunken water |
| `terrace` | Stepping Stones | Same grid with tiles at slightly different heights, like low steps |
| `inlay` | Lantern Inlay | A ring of inlaid tiles around the spawn and monster tiles |
| `quilt` | Patchwork | Three tones in a quilt pattern instead of two |
| `weave` | Basketweave | Each tile carries a woven pattern of fine raised lines |

Kit names are character, not licensed names. Add the same kind of guard `companionSkills.test.ts` carries (no rights holder's name in the file).

**Not an ownable item.** CLAUDE.md says everything ownable must carry a raid stat (`loadout.test.ts` enforces it). Boards are cosmetic, so they are a plain setting, not a catalogue entry. Add an optional `Settings.boardKit` (no migration, device-local, not synced). Default is `checker`. Read it with `loadSettings()` outside any `useLiveQuery` callback (CLAUDE.md pitfall: inside one it re-fires the query up to 20 times). **The picker lives on the Raid Gate only** (decided), not in Settings, so there is one place to choose and it sits next to the companion pick that already sets the board's colours. Nothing changes in holdings sync, so the four-edit rule for new holding kinds does not apply.

**Adding a kit** means adding an entry to a `BOARD_KITS` list in `domain/rpg/boards.ts` (pure, tested) plus its GLB file. No new code paths.

## Part 2: Theme and pet colours stay exactly as they are

- The colour source does not change: `arenaTokensForPet(companion, sceneMode)` -> `arenaPaint()`.
- `tileA`, `tileB` and `grout` keep their current formulas. A test pins their output for all 5 packs x light/dark so the existing look is byte-identical.
- New roles are added to `ARENA_ROLES` and painted only by `mix()` of the existing five tokens: `rim`, `hedge`, `water`, `stone`, `gate`, `bed`, `inlay`, `tileC` (Patchwork) and `weaveLine` (Basketweave).
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

## Phase status

**Phase 1 (done): raised pieces in the pet's colours.** Floor colours pinned by a test; hedge, stone, water, beds and gate are theme-painted solids (`boardPieces.ts`), built in code, so `arena.glb` stays exactly the floor it was. The ring hedge on row 0 is lifted like the rest of the ring.

**Phase 2 (done): the 45-degree view.** The shear camera was a stepping stone and is gone. The camera now sits in front of the board and looks down at 45 degrees, still orthographic, so every tile is one rectangle of the picture.
- One source of numbers: `domain/rpg/boardView.ts` (`ROW_RATIO = sin 45 = 0.707`, `HEADROOM_TILES = 1 - ROW_RATIO`, `cellTop`, `footY`, `spriteY`, `rowAt`). The bake gets the elevation and headroom as plain numbers (nothing under `3d/` may import from outside it); `boardCamera.test.ts` holds the bake and the scene to the same cell for every tile.
- The Phaser scene routes every row-to-pixel spot through those helpers. Sprites keep their 48px size with their feet on the row's bottom edge; the canvas is 528x252 instead of 528x336; taps use `rowAt`.
- Piece heights did not need to change: a height `h` rises `h * cos 45` and a row is `sin 45` tall, so a piece leans the same fraction of a row as before.
- Calm, Save-Data and a failed bake draw the flat checker and the pixel walls squashed into the same rows. Same grid, no 3D.
- Seen in the real scene (Chromium, real build): the bake runs, pets stand upright on their rows, keyboard and tap walking land on the right rows, and calm makes no model request.

**Phase 3 (next): the five kits and the Raid Gate picker.** **Phase 4: iOS landscape and the side rail.**

## Part 4: Landscape on iOS

**What exists:** `viewport-fit=cover`, `100dvh` and safe-area insets are already used. Phaser is `FIT`. The manifest says `orientation: 'portrait'`, but iOS ignores that, so iOS already rotates and the layout just was not designed for it.

**Layout** (in `styles/legacy/34-engine-garden.css`, new rules in the `features` layer, not more `legacy`):
- Breakpoint: `@media (orientation: landscape) and (max-height: 520px)`.
- Two columns: board on the left at full usable height, a scrolling right column for the foe strip, move pad and charge meter.
- Board box height `calc(100dvh - safe-top - safe-bottom - tab bar)`; 11x7 is 1.57:1, so on 844x390 it is roughly 550 wide.
- Pad both sides with `env(safe-area-inset-left/right)` for the notch.
- The d-pad moves beside the board instead of under it.
- Sticky positions and `--z-*` tokens only. No raw hex and no raw z-index (`styles.test.ts` enforces both).
- Tab bar: becomes a left side rail with labels kept (see "Tab bar becomes a side rail" below).

**Rotation correctness.** iOS reports a stale height right after rotation. Add a `SceneHandle.refit()` that runs `game.scale.refresh()` after two `requestAnimationFrame`s, triggered by `orientationchange`, `resize` and `visualViewport` resize.

**Manifest (decided: iOS only).** Leave `orientation: 'portrait'` exactly as it is. iOS ignores it, so iOS landscape works without touching it. Installed Android stays locked to portrait in this update. Nothing else in the app is audited for landscape on Android.

**Tab bar becomes a side rail in short landscape (decided).** `BottomNav.tsx` renders the same six `PRIMARY_TABS` in one `<nav class="tabbar">`, so the rail is a re-layout of the same element, not a second nav. `nav.ts` records that an earlier all-destinations rail was dropped because 14 destinations are too many for a rail. Six is fine, and the other destinations stay behind the menu as they do now.
- Where: `@media (orientation: landscape) and (max-height: 520px)` in `styles/legacy/05-chrome.css`'s successor layer (a new rule in the `features` or `ui` layer, not more `legacy`).
- The nav becomes a left-edge column: `position: fixed; top: 0; bottom: 0; left: 0`, one column of six equal rows, width about 72px plus `env(safe-area-inset-left)`. Border moves from top to right (`border-inline-end`). Labels stay visible; glyph stacks over label as today. The active pill and badge dot are unchanged.
- **The bar's height token is written inline by the theme engine**, so the rail must set `--tabbar-h: 0px !important` in that media query, the same way the existing `min-width: 640px` rule already sets it to 68px. Because `--shell-bottom-clear` and every bottom-docked thing (sheets, the command-menu button, the garden's `.garden-controls`) are calcs over `--tabbar-h`, they drop to the screen edge on their own.
- Add one new token, `--rail-w` (0px by default, 72px in the rail query). The shell's left padding, and every `position: fixed` element that spans the width (`left: 0`) such as the sheets, gains `+ var(--rail-w)`. A grep for `left: 0` / `max(env(safe-area-inset-left)` in the 9 stylesheets that use `--tabbar-h` gives the list.
- `tokens.test.ts` guards `--tabbar-h >= tap`; it reads the base token, which does not change. Add a test that `--rail-w` is defined and that the rail query exists.
- Height check: six rows at 56px is 336px. The shortest iPhone landscape height is about 375px, minus the home-indicator inset of about 21px leaves about 354px, so it fits. Tap targets stay at or above `--tap`.
- `:root[data-keyboard='open'] .tabbar { visibility: hidden }` keeps working unchanged.
- This is app-wide (the nav is global), not garden-only, so it needs a landscape pass over the other tabs. Out of scope: redesigning those pages for landscape. In scope: nothing is hidden behind the rail and nothing overflows horizontally.

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
| `app/src/domain/types.ts` | Optional `Settings.boardKit` (no migration) |
| `app/src/features/eve-garden/gate/RaidGate.tsx` (+ a small `BoardPicker.tsx`) | The picker: labelled buttons with a small static 2D preview in the companion's palette. It must stay three.js-free (gate renders without Phaser or WASM); previews use the three-free `arenaCanvas.ts` |
| `app/src/ui/layout/BottomNav.tsx` + `styles/legacy/05-chrome.css` successor | Rail layout in short landscape; `--rail-w` token |
| `app/src/themes/tokens.ts` (+ `tokens.test.ts`) | `--rail-w` |
| `app/tools/visual.mjs` | Add landscape frames (844x390 and 932x430) for the garden |

## Verification

1. `npm run typecheck` and `npm test` (includes `arenaPalette`, `arenaModel`, `arenaChunk`, `styles` tests). The three old roles must be unchanged for all 5 packs x 2 modes.
2. `npm run arena:glb --workspace app`, then confirm the output is byte-identical on a second run (determinism).
3. `APP_BASE=/ npm run build`, then `npm run visual`. This must be run before any push that touches `app/tools/`. It needs the .NET SDK, which the session hook already installed. Delete the generated `app/tools/baselines/` frames afterwards; do not commit them.
4. Look at each kit under at least two packs in light and dark, and confirm the colours match the pet's pack and not the app's theme.
5. Calm and Save-Data: no request for a `.glb`, static floor with pixel walls still visible.
6. Landscape: 844x390 and 932x430 show the board at full height with the controls reachable, no horizontal scroll, and the notch not covering anything. Axe passes. Also check the side rail on the other tabs (Home, Tasks, Mood, Workout, Calendar, Profile): nothing hidden under the rail, no horizontal scroll, badges still readable. Then rotate on a real iPhone, since iOS rotation timing differs from a desktop emulator.
7. `npm run lighthouse`-style gate: no chunk may statically import `mascot3d`.

## Decisions made

- Five kits: Hearth Checker, Stepping Stones, Lantern Inlay, Patchwork, Basketweave.
- Picker on the Raid Gate only.
- iOS only in this update. Manifest stays `portrait`.
- Tab bar becomes a side rail in short landscape.

## Still open (small)

- Rail width (72px proposed) and whether labels shrink on the shortest phones. Needs a real iPhone to judge.
- Whether the weave pattern is cheap enough for a phone's bake budget, which needs measuring on a real device before the other four kits are finalised.
