# Dashboard redesign — design

**Status:** decisions settled 2026-09-24 (item E). Not built yet. Build it after D, since both edit `DashboardPage.tsx`.

## What Home renders today
Checked against `app/src/features/dashboard/DashboardPage.tsx`, top to bottom:

1. **Mascot** (`.home-mascot-standalone`): mood face from `moodFor({ hour, glow })`,
   dye, radiance.
2. **Pet header** (`.home-pet`): name, `Lv N · into/needed XP`, the bar, the blurb.
3. **`VitalsPanel`**: the attributes, the stage, and the **shared streak**
   (`StreakLine`, from `coupleVitals(day)`).
4. **`TogetherPanel`**: only when paired.
5. **Invite** (`.home-invite`): only when unpaired. It has a "Pair up" tile and a "Move" tile.
6. **Today** (`.home-today`): open dailies and goals with a `+` tick, plus the
   equipped gear strip.
7. **`QuestBoard`**.
8. **`FeedPanel`**: life events and **cheers** (`putCheer`).

Things outside audits often call "missing" that already exist:
- the **streak** (item 3),
- **cheers** (item 8),
- the **wager** (`features/exercise/WagerPanel.tsx`, `domain/wager/engine.ts`),
- **chest anticipation**: pity floors are visible on the Party page
  (`PartyPage` passes `avatar.chestPity` into the chest alcove and prints the
  odds with pity applied).

None of these needs building. The one real gap is below.

## Problem
The app's core loop is logging (mood, a workout, a study/work session). Those
logs feed the streak, the vitals, the garden's charges and the pet. But Home has
**no entry point to any of them**. The only logging control on Home is the `+`
on dailies. Mood, Move and Work are reached through the tab bar or the menu
(`app/src/nav.ts`). An unpaired phone gets a "Move" tile. A paired one gets
nothing. So the screen that asks "what does today still want from me" can't
answer "log it".

## Decisions
| Question | Decision |
|---|---|
| Inline forms on Home, or links? | **Links.** Each logging page already has its own form, validation and receipt. Duplicating a form on Home is two places to keep in step, the same trap `ChestReveal` avoids by existing once. |
| Which logs? | The three that light a charge by themselves: **Mood** → `/mood`, **Move** → `/exercise`, **Work** → `/work`. Rest, Gratitude and Nourish are flags on the mood check-in, so the Mood link covers them. |
| Shows done/not done? | **Settled: either of you.** Yes, from `todaysCharges(day)` (`db/repository/charges.ts`), the query Eve's Garden already runs. No new repository code. A lit charge means *either* of you logged it today, which is exactly what the garden will use. The label says "today" rather than "you". |
| Where on the page? | **Settled:** straight after the pet header (`.home-pet`), before `VitalsPanel`. Since B merged, the order is mascot, greeting line, pet header, log row, vitals. |
| What moves out? | Nothing is removed. The unpaired invite's "Move" tile becomes redundant, so it's dropped and only "Pair up" remains. That's the one deletion. |
| Guilt | No red, no "missed", no counts of what is left. An unlit log is a plain button and a lit one gets a check. This follows the tone rule the greeting and the notify schedule already hold. |
| New component? | One: `features/dashboard/LogStrip.tsx`. It's a row of compact `Link`s, not `Tile`s, because a `Tile` is 120 px tall and three of them would push the pet card off the screen. Its CSS (`.home-log*`) sits next to the `.home-*` rules. A lit link gets a check badge in the `--color-accent-live` / `--color-accent-text` pair that `mood.test.ts` proves for contrast. |

## Design
- `LogStrip({ day })`: `useLiveQuery(() => todaysCharges(day), [day])`, then renders
  three links in a row, each with an icon (`mood`, `dumbbell`, `calendar`, the
  icons `nav.ts` already uses), a label, and `aria-label="Log mood (done today)"`
  when lit.
- `DashboardPage` renders `<LogStrip day={day} />` between `.home-pet` and
  `<VitalsPanel>`, and removes the second `Tile` in `.home-invite`.
- No schema, sync, repository or domain change.

## Testing
No new domain logic, so no new unit tests. Run `npm run visual` (Home in both themes,
axe clean at 390 px wide, three links not wrapping), and check by hand that each
link shows lit after logging on its page.
