# HeartBeat Floating Battle Board — implementation plan

**Spec:** `../specs/2026-10-08-heartbeat-floating-board-design.md` (user-approved; Approach A)

**Scope:** Visual-only. No combat/gameplay rules, movement/grid changes, persistence, worker logic, C# logic, or public engine-interface changes.

**Planning note:** The referenced writing-plans skill was not installed in this sandbox. This plan follows the repository's existing focused implementation-plan format.

## 1. Selected-pet palette (including fallbacks)

**Files:** `app/src/features/eve-garden/EveGardenPage.tsx`, new pure helper and tests under `app/src/features/eve-garden/`, `app/src/features/eve-garden/arenaFloor.ts`, `app/src/features/pet/mascots/3d/arenaScene.ts`.

- Resolve the selected Raid Gate companion's theme pack with `getTheme(companion)` and the currently active `ThemeMode` with the existing theme provider. Use the pet pack's matching dark/light `ThemeColors`; do not silently use the unrelated app-level theme id.
- Pass only the necessary color tokens through the internal floor-loading/bake path. Keep `SceneHandle`, `SceneHooks`, `StartOptions`' public consumers, the worker protocol, and game API unchanged; if selected colors cannot be carried without changing the public boundary, stop and report before expanding scope.
- Preserve `arenaModelSrc`'s no-WebGL/Save-Data/calm behavior. Generate an inexpensive static 2D checker fallback from the selected theme's tokens when the 3D bake is intentionally skipped or fails, so the calm/Save-Data board remains on the chosen pet theme without a GPU or network request. If the canvas fallback itself is unavailable, retain the existing pixel-tile fallback.
- Test all five pet packs in both light and dark modes; pin that fallback colors come from the selected companion rather than the app's active theme.

## 2. Tactile 2.5D board finish

**Files:** `app/src/features/pet/mascots/3d/arenaScene.ts`, `app/src/features/pet/mascots/3d/arenaPalette.ts` and its tests; add or update a narrowly scoped canvas painter/helper and tests if needed.

- Preserve the generated 11×7 geometry, orthographic camera, crop, tile centers, and one-frame WebGL lifecycle.
- Add a restrained, deterministic grain pass after the Three.js frame is copied to the 2D output; vary luminance only by a small bounded amount so colors remain derived from theme tokens.
- Add subtle inner perimeter/rim shading and bevel highlights within the existing board footprint. Do not add perspective, tilt, or a margin that changes tile-to-pixel alignment.
- Keep the surface legible and lightweight; gracefully leave the existing render unchanged if canvas pixel processing is unsupported.
- Extend pure palette tests to verify all 10 theme/mode variants retain distinct checker squares and valid RGB ranges after any new role/blend calculation.

## 3. Restrained ambient animation

**Files:** `app/src/features/eve-garden/scene/BattleGardenScene.ts` and a small pure plan/helper with tests if required.

- Add a low-contrast light sweep or sparse twinkle as a Phaser layer over the floor and below every actor, sprite, obstacle, selection, and combat VFX layer.
- Use existing scene lifecycle and `setCalm`; no new public scene method or payload. Do not move, scale, or rotate tiles, sprites, camera, or board container.
- Start only when motion is allowed and the 3D board exists; stop/remove immediately when calm/reduced-motion becomes active. The static 2D checker floor remains available otherwise.
- Pause automatically with the existing scene/game loop when the tab is hidden. Avoid perpetual allocation or extra WebGL contexts.

## 4. Verification

1. Run focused arena floor/model and palette tests, plus tests for selected-pet theme resolution and static fallback.
2. Run app typecheck and the full app test suite.
3. Production build passed with the official .NET 10.0.112 SDK and `wasm-tools` installed in the sandbox user's home.
4. Review the generated 2.5D GLB for all five theme packs in both light/dark modes; check the responsive gallery at 390 px with no horizontal overflow. These captures verify the board and palette, not live actors, VFX occlusion, or the running animation. They are review previews, not CI baseline screenshots.
5. Confirm `git diff` contains no gameplay rules, grid, persistence, worker, C#, or public engine API changes.

## 5. Separate logo-demo track

The logo-animation demo remains independent of the board implementation. The selected source image is the existing `app/public/icons/icon-512.png`. The spec calls for three still material treatments and one selected animation, but MuAPI CLI/API credentials are missing. Do not invoke a substitute model silently; resume this track only when the MuAPI setup is available, present stills for approval, and animate only the selected still.

## 6. Verification record (2026-10-08)

- `npm run typecheck --workspace app` — passed.
- `npm run test --workspace app` — 3,080 tests passed.
- `npm run game:test` — 498 tests passed.
- `APP_BASE=/ npm run build` — passed, including the WASM and PWA builds.
- `git diff --check` — passed. Changed files remain in the approved visual-only area; no worker, C#, grid, or game-rule files changed.
- Chromium preview — all five actual GLB theme renders passed in light and dark variants; the 390 px gallery had no horizontal overflow.
- Repository-wide `npm test` — app tests passed, then the worker suite stopped the command with 16 failures across 2 files (SQLite `column index out of range` in holdings tests). No worker files are changed by this task; the repo-wide test command is not green.
