# HeartBeat Floating Battle Board and Logo Animation Demo — Design Spec

**Status:** Proposed; awaiting user review before implementation  
**Date:** 2026-10-08  
**Repository:** `djbatalona06/HeartBeat` (`main` at inspection: `3c6906c`)

## 1. Context and goals

HeartBeat's battle board already uses an 11×7 checker floor sized to the combat grid. `app/tools/arena-glb.mjs` builds the bevelled tile model, `app/src/features/pet/mascots/3d/arenaPalette.ts` derives tile, grout, and lighting colors from theme tokens, and `app/src/features/pet/mascots/3d/arenaScene.ts` renders the model once to a canvas for Phaser. The battle scene already has idle character bobbing, attack/skill effects, and calm behavior.

The goal is a visual-only refresh that makes the battle arena read as a gently floating, tactile checkerboard, keeps HeartBeat's existing 2.5D/top-down visual language, introduces restrained ambient motion, and remains consistent with all existing theme colors. Separately, demonstrate the `muapi-3d-logo-animation` skill using the HeartBeat PWA icon, with several still material treatments and one selected treatment animated after the user approves it.

## 2. Hard scope boundaries

- Do not change combat rules, turn resolution, movement, walkable tiles, enemy behavior, game balance, data, persistence, or worker behavior.
- Do not change the game-engine or scene public interfaces (`SceneHandle`, `SceneHooks`, worker protocols, or C# APIs).
- Do not change the camera to perspective/isometric or add realistic 3D rendering. Preserve straight-down grid alignment and the current 2.5D character presentation.
- Do not introduce a new fixed palette. Derive every board material and lighting treatment from the existing theme tokens and preserve all five themes in both light and dark modes.
- Honor calm/reduced-motion behavior and the current Save-Data asset fallback; no ambient animation should run when motion is suppressed.
- Make no changes until the written spec has been reviewed and approved.

## 3. Design options considered

### A. Tactile floating illusion — recommended

Retain the current orthographic, top-down composition and exact board/grid footprint. Add subtle grain and tonal variation, emphasize the shallow tile bevels and perimeter rim, and use an inset shadow/highlight treatment to suggest that the board is lifted. Add a low-contrast, slow ambient glint/twinkle in the existing Phaser scene, without shifting any tile or actor. This has the best balance of the requested floating feel, 2.5D continuity, and safe movement alignment.

### B. Fully animated/parallax platform

Tilt, bob, or rotate the board and surrounding platform as a unit. This is visually expressive but risks breaking the board-to-grid alignment and would require broader scene coordination; it is not recommended under the approved visual-only boundary.

### C. Static material polish

Add grain and bevel highlights only, with no new ambient motion. This is the simplest fallback if device performance or reduced-motion testing shows the ambient treatment is too costly or distracting, but it does not fully meet the request for a newly animated look.

## 4. Approved design

Proceed with option A. Preserve the 11×7 game grid, its current top-down camera framing, tile locations, existing actors, and theme-driven colors. Add a subtle grain/tactile finish, stronger but restrained bevel/rim/shadow cues, and ambient board lighting motion. Keep animation behind the existing Phaser visual layer rather than attempting to animate the one-frame Three.js bake. Ambient effects must not overlap or obscure characters, tiles, move selection, telegraphs, or battle effects. If the required motion cannot be expressed without public interface or game-rule changes, stop and return with a brief rather than broadening scope.

### Motion and accessibility

- Treat ambient movement as decoration only: no input, timing, combat, or tile-state dependence.
- Reuse the current calm/reduced-motion state. In calm/reduced-motion, render a static board finish and avoid starting the ambient animation.
- Preserve text/log accessibility; no information may be communicated only through animated color or texture.
- Keep motion subtle enough not to compete with the existing pet/enemy idle motion or battle VFX.

### Theme behavior

Use only values derived from existing theme tokens via `arenaPaint` (or a narrowly scoped extension of that existing pure palette function). Validate all five theme packs across dark and light variants. Preserve perceptible checker contrast and ensure grain/lighting do not obscure sprites or tile identity.

## 5. Logo-animation demo

### Reference and concepts

Use the existing square 512×512 PWA icon at `app/public/icons/icon-512.png` as the reference. The icon is a white cat silhouette with a bow on a dark plum ground; retain its recognizable silhouette and proportions. Produce three static material directions, each using the source icon and its existing brand colors:

1. **Soft enamel:** smooth, friendly, shallow dimensional edges and gentle studio light.
2. **Satin ceramic/resin:** matte-satin material with a restrained fine-grain surface, matching the board's tactile finish.
3. **Glossy glass/chrome:** the skill's supplied default direction, with controlled reflections rather than a photoreal scene.

Present the still concepts for user selection/approval. Animate only the selected still, using a restrained cinematic reveal with a slow turn/light sweep and minimal particles so it remains recognizably the HeartBeat app icon. The logo demo is an asset demonstration, not an app/brand replacement.

### Tooling dependency and generation gate

The installed skill directs the workflow through MuAPI's Nano Banana 2 Edit for still conversion and Veo 3.1 Fast image-to-video for animation. At inspection time neither the `muapi` CLI nor `MUAPI_API_KEY` was available, and the session connector config had no MuAPI match. Do not substitute a different provider silently. Before generation, configure the authorized MuAPI integration/credential through the supported setup route. Never expose API secrets. If MuAPI remains unavailable, deliver the board work separately and report the logo demo as blocked pending setup.

## 6. Architecture and implementation notes

- The arena model remains theme-neutral and role-based; material roles should remain synchronized with `ARENA_ROLES` and the model test.
- The board's static geometry remains generated deterministically by `app/tools/arena-glb.mjs`; if that artifact changes, regenerate it with the documented workspace script and run the model tests.
- Keep the one-frame WebGL bake lifecycle intact: no overlapping WebGL contexts and no long-lived renderer.
- Put any board-only ambient Phaser visuals inside the existing battle scene implementation. Do not add scene/engine interface methods or pass new gameplay data.
- Any added texture/noise must be light-weight, deterministic where practical, and covered by a fallback if unsupported.
- Do not create separate per-theme model files; theme repainting remains the source of color variation.

## 7. Validation and acceptance criteria

1. All existing grid/model assertions still pass: 11×7 footprint, material-role parity, and board alignment.
2. All five themes × light/dark variants retain clearly distinguishable adjacent checker colors, with grain and highlights staying within their token-derived palette.
3. The arena remains the same size and orientation; pet, enemy, and minion sprites line up with their existing tiles and remain unobscured.
4. Ambient board animation is absent in calm/reduced-motion and does not start under the existing Save-Data fallback.
5. No changes occur in movement, battle resolution, public scene/worker interfaces, or C# game logic.
6. Run focused arena/palette/scene tests, the app typecheck, and relevant app test suite; run the repo's documented build/visual gates when the local .NET/WASM prerequisites are available.
7. The logo still concepts are reviewed before animation; the final short animation is shown as a demo asset and does not replace the in-app icon.

## 8. Risks and fallback

- A stronger floating silhouette is constrained by the existing exact-size, straight-down board render. Keep the lift cue subtle; if a visible side wall would require changing the camera or grid framing, omit that cue rather than changing the engine boundary.
- Extra texture or motion may reduce clarity/performance on mobile. Prefer a small, low-contrast treatment and retain the static fallback.
- Browser/platform reduced-motion preferences and app calm mode must both be respected through the existing motion controls; verify how those states reach the scene before implementation, and stop for user briefing if any new interface would be needed.
- The requested MuAPI example generation cannot run until the required MuAPI CLI/API credential is available.

## 9. Approval checkpoint

This spec records the approved visual direction, not authorization to implement. The next step is for the user to review this file and request any edits. Only after the user approves the written spec should an implementation plan be prepared; no code or generated assets should be produced before then.
