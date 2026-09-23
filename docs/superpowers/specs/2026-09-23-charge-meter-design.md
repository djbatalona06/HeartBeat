# Charge meter beside the move pad — design

**Status:** approved 2026-09-23. Follows PR #93 (themed moves, logging as charges).

## Problem
PR #93 moved logging out of the fight buttons into a strip of tappable charge
chips under the move bar. Logging still lived in the garden. The ask: the log
should be a **visual meter**, not a button, laid out **side by side** with the
move pad.

## Decisions
| Question | Decision |
|---|---|
| Where do Rest, Gratitude and a good meal get logged? | Three toggles on the Mood check-in, stored as optional flags on the mood row. |
| What does the meter show? | Both: a segmented charge meter beside the pad, and a boost bar on each move. |
| Phone layout | Side by side on every width: pad about 2/3, meter about 1/3 (minimum 6.5rem). |

## Design
1. **Data.** `MoodEntry` gains optional `rested`, `grateful` and `ateWell`. The entries payload is opaque JSON, so there's no migration, and the flags sync to the partner. `putMood` writes the flags along with the meters.
2. **Mood page.** A "Today I was" group of three library `Chip`s above the note, saved by the existing button. `flagsChanged` counts a flip as unsaved.
3. **Charges.** `chargesFor({ rows })` reads Rest, Gratitude and Nourish from the flags, from either partner. The PR #93 award-id path is removed.
4. **XP.** The garden pays each lit charge's XP once a day under `garden-<day>-<activity>`, the same id on both phones, deduped by `awardPetXp`.
5. **UI.**
   - `ChargeMeter` has no buttons. It shows 6 loggable segments, a divider, then Both and 3 kinds. The weakness segment carries a ✦, an outline and a pulse, which is off in calm or reduced motion. A visually hidden sentence reads the meter to screen readers.
   - `ActionBar` gets a boost bar per move from `moveLift`, a TS mirror of the `Charges.cs` and `Loadout.cs` multipliers whose constants are read by tests. The bar is full at +150%.
   - `.garden-controls` is a two-column grid.
   - `ChargeStrip.tsx` and `logging.ts` are deleted.

## Testing
- `charges.test.ts`: flag rows, Bond and Balance, `payingActivities`, `moveLift` values, and the C# constants.
- `mood.test.ts`: `flagsOf` and `flagsChanged`.
- A headless walk of the Mood toggle feeding the garden meter at 390px and 1024px.
