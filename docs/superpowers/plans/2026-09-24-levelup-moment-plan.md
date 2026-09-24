# Level-up moment — implementation plan

Spec: `../specs/2026-09-24-levelup-moment-design.md`. Builds on C (interface sounds)
for the optional tone. Do step 5 last.

1. **Domain + test first** (`app/src/domain/pet/levelUp.ts`, `levelUp.test.ts`):
   write the three cases from the spec, watch them fail, then write `levelUpSince`.
2. **Animator + test** (`app/src/features/pet/levelUpAnimator.ts`, `.test.ts`):
   copy the shape of `features/chest/animator.ts`: timings object, pure plan,
   class with `run()` / `cancel()`. Test the plan and the no-`animate` path.
3. **Home** (`features/dashboard/DashboardPage.tsx`): refs on
   `.home-mascot-standalone` and `.home-pet-fill`, and one effect keyed on
   `progress.level` that is guarded on `pet !== undefined`. The localStorage
   read/write goes through try/catch. Call `play('levelUp', …)` only for a live
   jump, not the catch-up on mount (a `useRef` flag set after the first run).
   No new CSS unless the hop needs `transform-origin: bottom`. If it does, add
   it to the existing `.home-mascot-standalone` rule.
4. **Check by hand**, both themes, Calm on and off (see the spec's Testing).
5. **Gates:** `npm run typecheck`, `npm test`, `APP_BASE=/ npm run build`,
   `npm run visual` (then delete `app/tools/baselines/`), and
   `npm run study:build` **last**. `DashboardPage` isn't reachable from
   `standalone.tsx`, but a `styles.css` edit is, so rebuild anyway.
