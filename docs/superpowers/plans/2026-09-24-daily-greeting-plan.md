# Daily pet greeting — implementation plan

Spec: `../specs/2026-09-24-daily-greeting-design.md`. Runs in this session, alongside the D-pad.

1. **Domain + test first** (`domain/pet/greeting.ts`, `greeting.test.ts`)
   - Write the tests from the spec's Testing list, see them fail, then write the pools and `greetingFor`.
2. **Component** (`features/pet/PetGreeting.tsx`)
   - `PetGreeting({ line })` renders a `<p className="home-greeting">`.
   - `usePlayGreetingOnce(day)` reads and writes `localStorage['hb.greeted']` in try/catch.
     Returns `true` once per day per device, and `false` if storage throws.
3. **Dashboard** (`features/dashboard/DashboardPage.tsx`)
   - `const greeting = greetingFor({ coupleId: coupleId ?? 'solo', day, mood: petMood, name: mascot.name })`.
   - Set `data-greet` on the mascot wrapper when it's the first visit and Calm is off. Render `<PetGreeting>` below it.
4. **CSS**: the `.home-greeting` bubble and four `greet-*` keyframes behind
   `prefers-reduced-motion: no-preference` and `:not([data-calm=true])`.
5. **Verify:** the same gates as the D-pad. `study:build` runs once at the very end for both.
