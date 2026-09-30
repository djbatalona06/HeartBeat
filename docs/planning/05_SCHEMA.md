# 05 · Backend Schema

## This round: no schema change

| Area | Change | Why none is needed |
|---|---|---|
| Fight effects | None | `strike()` gains two arguments; nothing is stored |
| Calm / accent | None | Both come from the existing theme context |
| Quiz timer | None | `clock.ts` state lives in the component |
| Level-up reveal | None | Derived from `levelProgress(pet.xp)` and `MILESTONES`; "last shown" is local `hb.petLevelSeen` |
| Partner sees level-up | None | The level derives from the **shared** pet, so both phones cross the same boundary |
| Locked goals (Phase D) | None | Reads lifetime totals that already exist |

## Why no new holding kind

A new kind is **four edits plus a migration**: `HOLDING_KINDS` (client), `KINDS`
(`app/functions/api/holdings.ts`), the D1 `CHECK` (rebuild the table; SQLite cannot
alter one), and a `storeFor` case; `worker/src/holdings.test.ts` holds all four in
step. `PARTNER_WRITABLE_KINDS` is a security list; `PARTNER_VISIBLE_KINDS` is a
display list. Nothing this round needs to cross devices that doesn't already.

## Data each feature reads (all existing)

| Need | Source |
|---|---|
| Pet XP / level | `db/repository/petXp.ts`, `/api/pet`; curve in `domain/xp.ts` (`MAX_LEVEL` 50) |
| What each level opens | `domain/rpg/milestones.ts` (`MILESTONES`, `milestonesAt`, `nextMilestone`) |
| Loyalty tier / next tier | `domain/rpg/together.ts` (`nextTier`, `pointsToNext`); rendered today by `features/pet/TogetherPanel.tsx` |
| Companion kit | `domain/rpg/companionSkills.ts` (`COMPANION_KITS`, `kitFor`, `fireSkill`, `moveKeyFor`) |
| Today's charges | `domain/rpg/charges.ts`; `MoodEntry.{rested,grateful,ateWell}` (optional, sync with the mood row) |
| Quiz card progress | `domain/study/srs.ts` (`CardProgress`), personal, not partner-writable |

## Adjacent, deferred (need schema; from `docs/AUDIT_ROADMAP.md`)

- **Quests/achievements don't survive device loss** — a new D1 table plus API, same
  shape as `holdings.ts`. Own PR.
- **Data export** of a couple's record — read-only, keyed by `coupleId`.

## Privacy

Nothing here adds an email, an account, a new token, or data that leaves a device.
The study bridge keeps its scoped token exactly as stored today.
