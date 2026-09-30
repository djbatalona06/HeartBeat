# 02 · TRD — Technical Requirements

## Stack (unchanged — no new framework, no new server)

| Layer | Tech | Where |
|---|---|---|
| App | Vite + React + TypeScript PWA, Dexie (IndexedDB) | `app/` → Cloudflare Pages `heartbeat-app` |
| Game core | C# (`net10.0`) compiled to WebAssembly | `game/HeartBeat.Game.{Core,Wasm,Tests}` |
| Fight scene | Phaser 2D, a worker, typed protocol | `app/src/features/eve-garden/` |
| Mascots | three.js over SVG fallbacks, lazy chunk | `features/pet/mascots/3d/` |
| Backend | Pages Functions + a Worker + D1 (+R2 photos) | `app/functions/`, `worker/` |

`APP_BASE=/ npm run build` needs the .NET SDK and the `wasm-tools` workload.

## Layering rule (strict)

- `app/src/domain/**` — pure TypeScript: no React, no Dexie, no `fetch`. Every
  module has a `*.test.ts` beside it. Vitest collects `*.test.ts` only; **components
  are not unit-tested by design**, so any rule that matters must live in `domain/`.
- `app/src/db/repository/**` — the only door to the database; `features/` never
  touches Dexie. Adding a section = new file + one `export *` in alphabetical order.
- `app/src/features/**` — screens; call repository and domain, hold no rules.
- **The scene only draws.** `domain/` decides what a move or skill *is*;
  `scene/` decides what it *looks like*. Phaser never talks to the game worker and
  nothing in `scene/` imports from `engine/` (`scene/events.ts` header).

## Decisions

| Concern | Decision | Why |
|---|---|---|
| Calm plan | Pure `domain/scene/strikePlan.ts`, same contract as `levelUpPlan`: calm ⇒ all zeros | Testable without Phaser; `levelUpAnimator.ts` and `chest/animator.ts` already work this way |
| Timer | Pure `domain/study/clock.ts` (`start`/`pause`/`resume`/`elapsed`) + 4-line `pwa/useElapsed.ts` | Mirrors `domain/feedback/haptics.ts` vs `pwa/haptics.ts` |
| Effect table | `MOVE_VFX[themeId][move] → { shape, palette, count, timing }` in `scene/vfx.ts` | Reuses the five shapes; ten hand-animated effects were already rejected there |
| Accent | Read the theme accent once at scene creation, alongside `applyLighting` | The scene already relights per theme/hour |
| Level-up reveal | Extend `domain/pet/levelUp.ts`: `isBigLevelUp` covers every `MilestoneKind`; a pure `levelUpReveal(seen, now)` returns the milestones crossed | Reads `milestonesAt`, so moving a milestone moves the reveal |
| Partner sees level-up | No sync work: level is derived from the shared pet's XP (`levelProgress(pet.xp).level`) against a local `hb.petLevelSeen` | Already how the built feature works |

## Rules that bite (from `CLAUDE.md`)

- **`study/index.html` goes stale on any change reachable from `standalone.tsx`**
  (styles and scene/theme code included). Run `npm run study:build` **last**.
- **`Rarity` is `Tier`**; ids like `horse-godly` are deliberately unchanged.
- **Mascots:** code under `mascots/3d/` makes no value imports from outside `3d/`
  other than `three`, or three.js gets preloaded on every boot (Lighthouse fails it).
  One WebGL context for all mascots; never give a mascot its own renderer.
- **Skill VFX:** `companionSkills.ts` names a `vfx`, `scene/vfx.ts` maps it to a
  shape, `vfx.test.ts` fails in both directions. The kit files must not contain a
  rights-holder's name (existing guard in `companionSkills.test.ts`, `pets.test.ts`,
  `mascots/roster.test.ts`).
- **Raid Gate:** every effect reading `client.current` must also list `companion`
  in its deps.
- **Nothing in a Dexie transaction may `await` a non-Dexie promise.**
- **Never call `loadSettings()` inside a `useLiveQuery` callback.**
- **Day keys use the member's timezone**, never UTC.
- **Fights stay winnable uncharged and ungeared** (`IslandTests`).
- `localStorage` access is wrapped in try/catch; never put the seen-level in `Settings`.

## Constraints

- Offline-first PWA; precache budget asserted by `app/tools/lighthouse.mjs` off the
  built `sw.js` (882 KB / 12 entries at the last audit).
- Phaser and the 3.5 MB wasm runtime must not boot for screens that don't need them.
- No new dependency without a reason the repo's "bundles nothing third-party"
  stance can live with.

## Verification gate (every phase, before a push)

`npm run typecheck` · `npm run check:config` · `npm run ui:check` · `npm test`
(app + worker + `game:test`) · `APP_BASE=/ npm run build` · `npm run visual`
(axe fails on serious/critical; delete the untracked baseline frames, don't commit)
· `npm run lighthouse` · `npm run study:build` last.
