# Daily pet greeting — design

**Status:** approved 2026-09-24 (brainstorm, item B).

## Problem
Home shows the pet, its mood face and its level, and every visit looks the
same. There's no short loop of "open the app, the pet says hello". Nothing
changes day to day except the numbers.

## Decisions
| Question | Decision |
|---|---|
| Same greeting on both phones? | Yes. Seeded by `hash(coupleId + day)`, like the rest of the app's "arbitrary but replayable" choices (`domain/hash.ts`). |
| What changes? | One line of speech and one small pose (a once-through CSS animation). |
| How often does the pose play? | On the first Home visit of the day on this device. The line stays up all day. |
| Where is "already greeted" stored? | `localStorage` (`hb.greeted` = day key), wrapped in try/catch. It's a per-device nicety, not synced state, and it must never touch `Settings`, since writing settings starts a sync. |
| Does it follow mood? | Yes. Lines are pooled per `PetMood` (`happy` / `content` / `sleepy`) from `domain/pet/mood.ts`. |
| Tone | Never guilt. No "miss", "forgot", "haven't", "where were you", "streak". The notify schedule already takes this position in writing (`domain/notify/schedule.ts`), and a test enforces it here. |
| Calm / reduced motion | No pose. The line still shows. |

## Design
1. **Domain.** `app/src/domain/pet/greeting.ts` (pure, no React):
   - `GREETING_POSES = ['wave', 'hop', 'peek', 'wiggle'] as const`
   - `GREETING_LINES: Record<PetMood, readonly string[]>`: 8 lines each,
     with `{name}` as a placeholder for the mascot's name.
   - `greetingFor({ coupleId, day, mood, name }) → { line, pose }`. The pose
     and line indices come from `roll(hash(coupleId + ':' + day), 0|1)`, so the
     two choices are independent. A lone phone uses its provisional `coupleId`,
     which is fine: the choice is stable per device.
2. **Component.** `features/pet/PetGreeting.tsx` renders
   `<p className="home-greeting">`: a speech bubble under the mascot, with plain
   text (read in normal order, no live region, since it's content and not a
   status). It exports `usePlayGreetingOnce(day)`, which returns whether this
   is the day's first visit and records it.
3. **Dashboard.** `DashboardPage` sets `data-greet={pose}` on
   `.home-mascot-standalone` when `usePlayGreetingOnce` says so and Calm is off,
   and renders `<PetGreeting>` right after it. It adds no new queries: it reuses
   `coupleId`, `day`, `petMood` and `mascot`, which the page already has.
4. **Style.** Four `@keyframes` (`greet-wave`, …), each run once in under
   900 ms with `transform` only, under
   `.home-mascot-standalone[data-greet=...]`. They're wrapped in
   `@media (prefers-reduced-motion: no-preference)` and skipped when
   `[data-calm=true]`. None of them flash (2.3.1).

## Testing
`domain/pet/greeting.test.ts`:
- Same inputs give the same output. Across 60 consecutive days one couple sees
  more than one line and more than one pose. Two couples on the same day don't
  always match.
- Every line in every pool is at most 90 characters, contains `{name}` at most
  once, and matches none of the guilt words.
- Every pool has at least 8 lines, and every pose is a member of
  `GREETING_POSES`.
- The name is substituted and no `{` survives.
