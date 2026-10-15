# Duck Life vs HeartBeat: what to borrow, what makes us different

Research note, 2026-10-14. Goal: decide how feeding, nurturing and house-building
should work in HeartBeat, and where we deliberately do not copy Duck Life.

## 0 · How sure am I about the Duck Life facts?

The Cool Math Games page itself could not be opened from this container (the
network blocked the host). Everything below comes from search snippets of the
Duck Life fan wiki and Cool Math's own history blog, so treat details as
"probably right", not verified. Things I could **not** confirm are marked.

Sources:
- [Duck Life series (fan wiki)](https://ducklife.fandom.com/wiki/Duck_Life_(series))
- [Duck Life (fan wiki)](https://ducklife.fandom.com/wiki/Duck_Life)
- [Duck Life 4 (fan wiki)](https://ducklife.fandom.com/wiki/Duck_Life_4)
- [Minigames (fan wiki)](https://ducklife.fandom.com/wiki/Minigames)
- [The History of Duck Life (Cool Math Games blog)](https://www.coolmathgames.com/blog/the-history-of-duck-life-a-storied-series)

## 1 · What Duck Life is (the short version)

- You raise **one duck** and train it for **races**. Made by Wix Games, first
  game 2010, Flash-era, several sequels since.
- The first game's loop: **feed the duck** (restores energy) → **train** running,
  swimming, flying (mini-games raise those stats) → **race** → winnings buy more.
- Duck Life 4 widens it: six terrains (Grassland, Swamp, Mountains, Glacier,
  City, Volcano), six stats (Running, Swimming, Flying, Energy, Climbing,
  Jumping), and 5 training types with 3 mini-games each. Duck Life 9 (2024) is
  the first 3D one.
- Mood of the game: solo, short sessions, "make number go up, win the race".

Not confirmed: exact shop items, whether energy is a hard limit on training in
every version, and how saving works on Cool Math.

## 2 · What HeartBeat already has (checked in the code)

| Duck Life idea | HeartBeat today |
|---|---|
| Stats that grow | `domain/rpg/vitals.ts`: vitality / serenity / bond, **derived** from the logs you both made, never stored |
| Evolving the duck | Egg → Hatchling → Juvenile → Adult → Elder, gated on XP **and** a shared streak **and** both of you logging |
| Spending money | Coins, shop, chests with published odds, companions, dyes |
| A place for the pet | **The birbhouse**: `domain/rpg/furniture.ts`, 4 slots (window, wall, floor, perch), 8 pieces. Couple-owned, upgrade-only, furnishes itself |
| A garden | Earned plots by pet level (`plots.ts`), planting on `/birb` |
| Races | Boss fights on ten islands, powered by what you logged that day |
| Sad pet if you slack | Deliberately **absent**: the pet dims to a floor and never goes unhappy (`vitals.ts` radiance) |

### The gap: nothing to *do* for the pet

`Pet.fedAt` exists in the type, in the Dexie row and in the server's `/api/pet`
row. A grep shows it is copied around and **never set by any feed action**. It is
a leftover slot waiting for a feature. The "feed" in the app is the social feed
(cheers), not feeding. So today the pet is fed only indirectly, by logging.

## 3 · What makes HeartBeat stand out

These are the differences to protect. If a new feature erodes one, rethink it.

1. **Two people, one pet.** Duck Life is solo. Ours is shared, and the rules are
   built so one partner cannot raise it alone (stage gates ask for a shared
   streak and both of you in the same week).
2. **The pet is fed by real life.** Duck Life trains through mini-games. Ours
   grows from mood check-ins, workouts, rest, gratitude, eating well. Playing
   the app *is* the habit.
3. **No guilt.** No sad or dying pet. It dims to a floor and lights up again the
   moment either of you logs. There is no screen that says whose fault it was.
4. **A kind streak.** One of you can carry a day for both; shields are earned by
   the pair; today is not a miss until it is over.
5. **Idempotent by design.** Stats are computed from the day log, so two phones
   can never double-count. Duck Life has no sync problem because it has no
   second person.
6. **Fair money.** Chest odds are printed, a paid chest never returns nothing,
   and every fight is winnable with no gear.
7. **Calm mode.** Reduced motion, no-WebGL and Save-Data all have real paths.
8. **A house that is *ours*.** Either of you can improve it and both see it.

## 4 · Recommended pet features

Each one follows the same rule: **it costs something real you already did, and
it never punishes you for skipping.**

### 4.1 Feeding

Duck Life: tap food to refill energy. A straight copy would give HeartBeat a
hunger bar, and a hunger bar is a guilt machine. Do this instead:

- **Meals are earned by logging, not by a timer.** Logging Nourish on the mood
  check-in (already exists as `ateWell`) puts a "meal" in a shared pantry.
  Workouts earn a "snack". Gratitude earns a "treat".
- **Either of you can feed.** One taps feed, both phones see the pet eat. Feeding
  sets `fedAt` (the field already exists and syncs).
- **What feeding does:** a warm glow, a small bond bump, and a chance of a
  favourite food reaction. It does **not** gate anything and there is **no
  starving**. If nobody feeds for days, the pet is simply "peckish" in its
  idle pose, never sad.
- **Per-companion favourites:** each of the five mascots likes one food. Feeding
  the favourite gives a little extra sparkle. (Character, not stats, same rule
  as `companionSkills.ts`.)
- **Derive it, don't count it.** A pantry stored as a counter would need the
  award queue and dedup machinery `petXp.ts` needed. Instead derive
  "meals available" = meals earned from the day log minus feedings recorded, with
  deterministic ids (`feed-<day>-<kind>`), so two phones converge.

Open question for you: should a meal be shareable *to* your partner's side
("I fed it for you"), like a Good Vibe? My lean: yes, as a free gesture like a
cheer, paying nothing, so it cannot be farmed.

### 4.2 Nurturing

Duck Life trains stats through mini-games. Ours should nurture through **small
shared rituals**, not grinding:

- **Pet, play, rest** as three quick, once-a-day gestures per person. Each leans
  on one attribute (play → vitality, rest → serenity, pet together → bond).
- **A "both did it today" moment.** When both partners do the same ritual, the
  pet reacts with a bigger animation. That is the cooperative payoff.
- **Bond grows slowly and cannot fall.** Same rule as `unlocks.ts`: lifetime
  totals only, nothing that can be lost.
- **Evolution stays gated by habits**, not by pressing the nurture button more.
  Nurture adds colour and bond, it never replaces the streak requirement.

### 4.3 Building the house

The birbhouse is already the best part. Today it has 4 slots and 8 pieces, and
**no placing** (it furnishes itself with your best owned piece per slot). Growth
that fits the existing rules:

- **More rooms, not just more furniture.** Unlock a kitchen (feeding bowl and
  pantry, ties 4.1 to the house), a bedroom (rest ritual), a playroom. Rooms open
  by pet level, same idea as garden plots (`milestones.ts`).
- **More slots per room**, still auto-placed and still upgrade-only, so two
  phones can never delete each other's furniture. Keep every drawing in the
  shared 100x100 space.
- **A "built together" item.** One piece per room that needs both partners to
  contribute (for example each of you adds half the cost). A couple-only goal
  that Duck Life has no equivalent of.
- **Keep it gift-shaped.** Either partner can buy a piece *for* the house as a
  surprise; the other finds it next time they open the app.
- **Keep cosmetic stats honest:** `loadout.test.ts` already demands every
  ownable thing carry a stat, so a new piece must land on the tier ladder.

## 5 · What I would *not* copy from Duck Life

- Hunger that drains with time (a punishment clock).
- Energy as a hard cap on playing (a paywall-shaped limit).
- A solo race loop with no partner (we already have boss fights that read
  your real logs).
- Anything that makes one partner look like they let the pet down.

## 6 · Suggested build order

1. **Feed (smallest):** meal sources from existing flags, a feed action that sets
   `fedAt`, a pantry derived from the day log, one animation. Needs a test that
   two phones feeding the same meal converge on one row.
2. **House rooms:** add a kitchen with a bowl so feeding has a place to happen.
3. **Nurture rituals:** play / rest / pet, with the shared-reaction moment.
4. **Built-together pieces.**

Per `CLAUDE.md`: pure rules go in `domain/` with tests beside them, every write
goes through a new file in `db/repository/` plus one `export *` line in
alphabetical order, and a new holding kind needs the four edits (client list,
`KINDS` in `functions/api/holdings.ts`, a D1 migration, a `storeFor` case).

## 7 · Try it yourself

Open `app/src/domain/rpg/furniture.ts` and add one new piece to the `FURNITURE`
list (for example a floor "Food bowl"). Then run
`cd app && npx vitest run src/domain/rpg/furniture.test.ts` and
`npx vitest run src/domain/rpg/loadout.test.ts` and read which tests fail and
why. Those failures are the app teaching you its own rules (price → tier →
stat), and fixing them is the fastest way to learn how the house works.
