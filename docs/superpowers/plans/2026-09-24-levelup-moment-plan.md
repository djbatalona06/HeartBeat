# Level-up moment — implementation plan

Spec: `../specs/2026-09-24-levelup-moment-design.md`. B and C are merged, so start
from the latest `main`. Do step 6 last.

1. **Domain + test first** (`app/src/domain/pet/levelUp.ts`, `levelUp.test.ts`):
   write the cases from the spec for `levelUpSince` and `isBigLevelUp`, watch them
   fail, then implement both. `isBigLevelUp` reads `milestonesAt` and doesn't
   hard-code the plot levels.
2. **Animator + test** (`app/src/features/pet/levelUpAnimator.ts`, `.test.ts`):
   copy the shape of `features/chest/animator.ts`: one timings object for small
   and big, a pure `levelUpPlan({ calm, big })`, and a class with `run()` /
   `cancel()`. Test the plan totals and the no-`animate` path.
3. **Home** (`features/dashboard/DashboardPage.tsx`):
   - Refs on `.home-mascot-standalone` and `.home-pet-fill`.
   - One effect keyed on `progress.level`, guarded on `pet !== undefined`, with the
     `localStorage` read/write in try/catch.
   - `levelUpRunning` state, and add `!levelUpRunning` to the existing `data-greet`
     condition so B's pose waits for the level-up.
   - `play('levelUp', …)` only for a live jump, not the catch-up on mount (a
     `useRef` flag set after the first run of the effect).
4. **CSS**: none expected. If the hop needs `transform-origin: bottom`, add it to
   the existing `.home-mascot-standalone` rule.
5. **Check by hand** in both themes, Calm on and off, and once across a plot
   level (see the spec's Testing).
6. **Gates:** `npm run typecheck`, `npm test`, `APP_BASE=/ npm run build`,
   `npm run visual` (then delete `app/tools/baselines/`), and
   `npm run study:build` **last**.
