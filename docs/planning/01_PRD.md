# 01 · PRD — Product Requirements

## Problem

Heartbeat is a PWA for two people (mood, workouts, cycle, calendar, a shared pet
and a garden game). The game layer is deep (seven islands, five companions with
skill kits, chests, gear, charges) but it reads as a **pet game with an RPG on
top** rather than as a reward for the wellness habits underneath:

- Every basic attack, defence and magic move **looks the same** in the fight.
- Skill effects are all **white**, so nothing says *whose* move it was.
- The fight scene has **no calm / reduced-motion path**, although the dashboard
  level-up and the chest both have one.
- A level-up is a hop and a glow; what it **opened** is found by looking, not told.
- Two real defects/gaps sit beside this: the study quiz timer keeps running while
  the app is backgrounded, and the long-horizon goals are only partly visible.

## Who it is for

Two people, one shared pet, paired phones. No accounts, no email. Privacy is a
promise the README makes; nothing here may weaken it.

## Goals

1. Wellness actions visibly change the game world, and the world reads as the
   reward for the habit.
2. Level-ups **mean more**: each one says what it opened and is felt on both phones.
3. Each of the five companions has **original** attack / defence / magic effects.
4. The whole app, including the fight canvas, meets WCAG 2.2 AA.
5. The quiz timer is fair on a phone that gets phone calls.

## Requirements

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| T1 | The quiz question timer pauses while the page is hidden and resumes where it was; it never restarts | Must | A |
| S1 | Under calm mode and `prefers-reduced-motion`, the fight scene plays no tweens and adds no delay; the information still appears | Must | B |
| S2 | Skill and strike effects use the active theme's accent, not white | Must | B |
| S3 | `strike()` is told the move (`physical` / `defensive` / `magic`) and the companion (`themeId`) | Must | C |
| S4 | 15 distinct effects (5 companions × 3 moves) built from the existing five shapes with per-companion palette, count and timing | Must | C |
| S5 | One bespoke signature piece per companion (hybrid art) | Should | C |
| S6 | The turn's announcement names the move and its effect, so the canvas is never the only channel | Must | C |
| G1 | A locked-goals card shows the next long-horizon unlocks with exact numbers ("1,047 of 1,200") | Should | D |
| W1 | Copy names the person before the pet ("you moved" before "Mochi attacked") | Should | D |
| L1 | Every milestone kind (plot, skill, tether, stat, prestige) gets the big level-up moment | Should | E |
| L2 | The level-up shows one line naming what opened, read from `milestonesAt(level)`, announced via the toast region | Should | E |
| A1 | Garden playable by keyboard alone and with VoiceOver; AA contrast for all new palettes in both modes; 200% zoom clean | Must | F |

## Non-goals

- **No new currency.** Coins, energy and MP already exist and studying pays them.
- **Nothing subtracts.** Daily life never takes anything away; health exists only
  inside a boss fight. No unlock may expire, decay or carry a countdown.
- **No per-person pet, no classes.** One shared pet; stats stay flat across members.
- **No real-money code, no email, no third-party backend.**
- **No new holding kind or D1 table this round** (see `05_SCHEMA.md`).
- **No rights-holder names or likenesses** in any companion kit, effect or art.

## Success

- A fight with each of the five companions, each move type, produces visibly
  different effects in that companion's colours; under calm it produces none of
  the motion and all of the information.
- A quiz question left in the background for 30 s returns with the countdown where
  it was.
- Every fight stays winnable with **no charges and no gear** (existing C# test).
- CI stays green: typecheck, tests, build, `npm run visual` (axe), Lighthouse.
