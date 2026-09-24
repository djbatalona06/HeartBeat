# Level-up moment for the pet — design

**Status:** decisions settled 2026-09-24 (item D). Not built yet. B (daily greeting) and
C (interface sounds) have both merged, and this design builds on both.

## Problem
When the pet levels up, the only signal is a toast with `Level N.` and the
`levelUp` buzz and tone (`ui/Toast.tsx`). That toast only fires on the device
that did the logging (for example `TasksPage` passes `level:` when
`levelAfter > levelBefore`). A level earned by the partner, or reconciled from
the server, shows up on Home as a bar that has reset and a new number, with
nothing to mark it.

The level here is the **pet's**: the 50-rung curve in `domain/xp.ts`
(`levelProgress(pet.xp).level`), which Home already renders as `Lv N`. It is
not the combat rank C# owns (CLAUDE.md, "two level numbers").

## Decisions
| Question | Decision |
|---|---|
| Where does it play? | Home only, on the mascot (`.home-mascot-standalone`) and the level bar (`.home-pet-fill`). That's where the number lives. |
| What triggers it? | The derived level on Home is higher than the last level this device showed. Never the stored `Pet.level`, which is never recomputed (see the comment in `DashboardPage`). |
| Where is "last level shown" kept? | `localStorage` (`hb.petLevelSeen`), wrapped in try/catch, the same stance as `hb.greeted` in `PetGreeting.tsx`. It must not go in `Settings`, because writing settings starts a sync. |
| First visit ever / storage cleared? | Record the current level and play nothing. A missing value is "unknown", not "zero", or every fresh install would celebrate level 12. |
| Several levels at once? | One animation, ending on the final level. No queue. |
| **Milestone levels** | **A bigger animation** when any level in the jump opens a garden plot (`milestonesAt(l)` has a `kind: 'plot'` entry for some `l` in `(seen, now]`). Today that's levels 2, 4, 8, 12, 18, 23 and 28 (`domain/rpg/milestones.ts`). A plain level gets the small version. Other milestone kinds (skill, tether, stat, prestige) get the small version for now, and adding them later is a one-line change to `isBigLevelUp`. |
| **Level-up vs. the daily greeting (B)** | **Level-up plays first, then the greeting pose.** B sets `data-greet` on the mascot as soon as Home mounts, and its CSS keyframe would fight the level-up's Web Animation on the same `transform`. So when a level-up is pending, `data-greet` is held back until `run()` resolves, and then it's set so the pose plays. The greeting *line* shows the whole time. |
| How is it animated? | Imperatively with the Web Animations API, copying the pattern in `features/chest/animator.ts`: a pure plan holding the only copy of the timings, and a small class with `run()` that never rejects and `cancel()` that finishes rather than cancels. It's a sequence with an end, so the reasoning in that file's header applies as written. |
| Length | Small: under 1 s. Big: under 1.6 s. Even the big one is seen at most 7 times in the pet's life. |
| Calm / reduced motion | The plan is all zeros, so nothing moves. The number and bar still update, and the seen-level is still recorded. B already skips its pose under Calm. |
| Sound | `play('levelUp', { calm, enabled: settings.sound === true })` from `pwa/sound.ts` when the animation starts, **only** for a level-up seen live while Home is open. The catch-up on mount has no user gesture, so the browser would usually drop it anyway. Home's own `+` tick doesn't toast, so this can't double the toast's tone. |
| On-screen text | None beyond the `Lv N` that's already there. The mascot's `aria-label` already carries `level N`, and a local level-up already announces through the toast host. |

## Design
1. **Domain**, `app/src/domain/pet/levelUp.ts` (pure):
   - `levelUpSince(seen: number | null, now: number): number | null`. Returns
     `now` when `seen !== null && now > seen`, otherwise `null`.
   - `isBigLevelUp(seen: number, now: number): boolean`. True when any level in
     `(seen, now]` has a `plot` milestone (`milestonesAt` from
     `domain/rpg/milestones.ts`).
2. **Animator**, `app/src/features/pet/levelUpAnimator.ts`, beside the chest one:
   - `LEVEL_UP_TIMING = { hop: 420, glow: 520, fill: 360 }`, and a big variant
     with two hops and a longer glow, both kept in this one object.
   - `levelUpPlan({ calm, big })`, which is zero under calm, `total < 1000` small
     and `< 1600` big.
   - `LevelUpAnimator({ mascot, fill }, plan)` has `run()` / `cancel()`. The mascot
     does a squash-and-hop (transform only, so it stays on the compositor). A
     glow ring on the mascot's `::after` can't be targeted by `animate()`, so the
     glow is a `filter: drop-shadow` pulse on the mascot element itself. The bar
     sweeps from full back to its new fraction.
3. **Home**: the effect lives in `features/pet/useLevelUpMoment.ts` and
   `DashboardPage` calls it. Two details that only showed up in a browser:
   - The pet read is tagged with the couple it was read for (`petRead.for`).
     A live query keeps its last answer while its deps change, so the untagged
     "no pet" read from before settings loaded passed for this couple's answer
     for a frame. That let the greeting pose start and then get cut off.
   - The baseline sits in a ref and only moves forward once the animation
     finishes, so StrictMode's double effect in development replays the moment
     instead of eating it.

   What the hook does, in order:
   - One effect on `progress.level`, guarded on `pet !== undefined` (or the first
     render's `xp ?? 0` would record level 1). It reads `hb.petLevelSeen`, calls
     `levelUpSince` and, on a hit, `isBigLevelUp`, then runs the animator on refs
     to the two elements and writes the new level. The cleanup calls `cancel()`.
   - A `levelUpRunning` state gates B's pose:
     `data-greet={firstVisit && !calm && !levelUpRunning ? greeting.pose : undefined}`.
     It's set true before `run()` and false after it resolves, so the greeting
     pose plays after the level-up.

## Testing
- `domain/pet/levelUp.test.ts`: `null` seen gives `null`, equal or lower gives
  `null`, and a jump of several levels returns the final level. `isBigLevelUp`
  is true for 1→2, 3→5 (passes 4) and 27→28, and false for 2→3 and 5→7.
- `features/pet/levelUpAnimator.test.ts`, mirroring `chest/animator.test.ts`:
  the calm plan is all zero, small total is under 1000 ms, big total is under
  1600 ms, and `run()` resolves on elements with no `animate` (the node
  environment).
- The component isn't unit-tested (repository policy). Check it by hand: set
  `hb.petLevelSeen` below the current level in devtools and clear `hb.greeted`,
  then open Home. Do this in Calm and not, and once across a plot level. The
  level-up should play, then the greeting pose. Then run `npm run visual` to
  confirm Home still passes axe.
