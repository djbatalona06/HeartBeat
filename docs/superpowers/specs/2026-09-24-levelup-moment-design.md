# Level-up moment for the pet — design

**Status:** draft 2026-09-24 (item D). Not built yet.

## Problem
When the pet levels up, the only signal is a toast with `Level N.` and the
`levelUp` buzz (`ui/Toast.tsx`, `domain/feedback/haptics.ts`). That toast only
fires on the device that did the logging (for example `TasksPage` passes
`level:` when `levelAfter > levelBefore`). A level earned by the partner, or
reconciled from the server, shows up on Home as a bar that has reset and a new
number, with nothing to mark it.

The level here is the **pet's**: the 50-rung curve in `domain/xp.ts`
(`levelProgress(pet.xp).level`), which Home already renders as `Lv N`. It is
not the combat rank C# owns (CLAUDE.md, "two level numbers").

## Decisions
| Question | Decision |
|---|---|
| Where does it play? | Home only, on the mascot (`.home-mascot-standalone`) and the level bar (`.home-pet-fill`). That's where the number lives. |
| What triggers it? | The derived level on Home is higher than the last level this device showed. Never the stored `Pet.level`, which is never recomputed (see the comment in `DashboardPage`). |
| Where is "last level shown" kept? | `localStorage` (`hb.petLevelSeen`), wrapped in try/catch, the same stance the daily greeting takes: a per-device nicety. It must not go in `Settings`, because writing settings starts a sync. |
| First visit ever / storage cleared? | Record the current level and play nothing. A missing value is "unknown", not "zero", or every fresh install would celebrate level 12. |
| Several levels at once? | One animation, with the final level. No queue. |
| How is it animated? | Imperatively with the Web Animations API, copying the pattern in `features/chest/animator.ts`: a pure `plan(calm)` holding the only copy of the timings, a small class with `run()` that never rejects and `cancel()` that finishes rather than cancels. It's a sequence with an end, so the reasoning in that file's header applies as written. |
| Length | Under a second in total. It's seen often (50 rungs), so it's a nod, not a cutscene. |
| Calm / reduced motion | `plan(true)` is all zeros, so nothing moves. The level number and bar still update, and the seen-level is still recorded. |
| Sound | Once C (`pwa/sound.ts`) is in: `play('levelUp', { calm, enabled: settings.sound === true })` when the animation starts, **only** for a level-up seen live while Home is open (not the catch-up on mount). The catch-up has no user gesture, so the browser would usually drop it anyway. Home's own `+` tick doesn't toast, so this can't double the toast's tone. |
| Accessibility | The mascot's `aria-label` already carries `level N`. No extra live-region message: a local level-up already announces through the toast host. |

## Design
1. **Domain**, `app/src/domain/pet/levelUp.ts` (pure):
   - `levelUpSince(seen: number | null, now: number): number | null`. Returns
     `now` when `seen !== null && now > seen`, otherwise `null`.
2. **Animator**, `app/src/features/pet/levelUpAnimator.ts`, beside the chest one:
   - `LEVEL_UP_TIMING = { hop: 420, glow: 520, fill: 360 }` and
     `levelUpPlan(calm)`, which is zero under calm.
   - `LevelUpAnimator({ mascot, fill }, calm)` has `run()` / `cancel()`. The mascot
     does a squash-and-hop (transform only, so it stays on the compositor). A
     glow ring on the mascot's `::after` can't be targeted by `animate()`, so the
     glow is a `filter: drop-shadow` pulse on the mascot element itself. The bar
     sweeps from full back to its new fraction.
3. **Home**: in `DashboardPage`, a `useEffect` on `progress.level` reads
   `hb.petLevelSeen` and calls `levelUpSince`. On a hit it runs the animator on
   refs to the two elements, then writes the new level. The effect's cleanup
   calls `cancel()`. The effect must wait until `pet` has loaded (`pet !== undefined`),
   or the first render's `xp ?? 0` would record level 1.

## Testing
- `domain/pet/levelUp.test.ts`: `null` seen gives `null`, equal or lower gives
  `null`, and a jump of several levels returns the final level.
- `features/pet/levelUpAnimator.test.ts`, mirroring `chest/animator.test.ts`:
  calm plan is all zero, total is under 1000 ms, and `run()` resolves on
  elements with no `animate` (the node environment).
- The component isn't unit-tested (repository policy). Check it by hand: set
  `hb.petLevelSeen` one below the current level in devtools and open Home, in
  both Calm and not. Then run `npm run visual` to confirm Home still passes axe.
