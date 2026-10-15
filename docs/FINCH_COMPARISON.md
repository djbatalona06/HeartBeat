# HeartBeat vs. Finch: Self-Care Pet

A feature-by-feature comparison against [Finch: Self-Care Pet](https://finchcare.com)
(the wellness app with a virtual bird companion), written to answer one
question: what is Finch's audience getting that HeartBeat's isn't, and does
any of it actually fit a two-person app rather than a solo one.

**A naming note, because it cost real time to sort out**: `runfinch.com` is
AWS's open-source container-build CLI — a Docker Desktop alternative for
engineers — and has zero feature overlap with either app. It is not covered
here. Every claim below is about Finch: Self-Care Pet, sourced from
[finchcare.com](https://finchcare.com), the [App Store](https://apps.apple.com/us/app/finch-self-care-pet/id1528595748)
and [Google Play](https://play.google.com/store/apps/details?id=com.finch.finch)
listings, Finch's own [help center](https://help.finchcare.com), its
[wiki](https://finch.fandom.com/wiki/Finch_App), and third-party 2026 reviews —
not from using the app directly, since it isn't in this repo. HeartBeat's side
is grounded in the current tree (`main` at the time of writing).

The two apps are not really competing for the same job. Finch is a **solo**
self-care habit coach built around one idle pet. HeartBeat is a **two-person**
shared tracker built around a co-leveled RPG pet. The comparison is still
worth doing in full, because Finch has spent years finding what makes a daily
check-in app worth opening, and several of those answers are genuinely
portable to a couple.

---

## 1 · The core loop, side by side

| | Finch | HeartBeat |
|---|---|---|
| Who's playing | One person, one bird | Two paired people, one shared bird |
| What advances the pet | Completing "journeys" (breathing, reflections, journaling prompts, tasks) fills an **Energy** bar; full energy sends the bird on a timed **Adventure** (6h for an adult) that returns loot | XP from *either* partner logging mood, exercise, study, calendar events, or life events — no idle/passive loop, no timers | `app/src/domain/xp.ts` |
| Ceiling | Bird ages baby → toddler → teen → adult (~a few months) | 50-level curve, deliberately stretched — "level 50 is not months... a couple of years" | `app/src/domain/xp.ts` |
| What you *do* with progress | Dress the bird, decorate its room, unlock journeys | Turn-based battles on a 7-island map, using gear/companion/charges built from the same daily logging | `app/src/domain/rpg/islands.ts` |
| Currency | "Rainbow stones" from adventures/goals — cosmetics only | In-game coins from tasks — cosmetics only, no real money either side | `app/src/domain/rpg/shop.ts` |

The load-bearing difference: Finch's pet is a **companion you keep alive**
(care loop). HeartBeat's pet is a **stat sheet you and a partner co-build**
(RPG loop) — closer to a shared Tamagotchi crossed with a turn-based JRPG than
to Finch's bird. Neither is strictly more sophisticated; they're solving
different problems. Finch needs the loop to work alone, every day, with no
one else watching. HeartBeat needs the loop to feel like *doing something
together* even when only one partner logged anything that day — which is why
`Charges.Bond` (lights when both partners log same-day) and `Charges.Balance`
(lights on 3+ different kinds same-day, `app/src/domain/rpg/charges.ts`) exist
and have no Finch equivalent at all — there's no one else to sync with.

---

## 2 · Mood, journaling, and insight — the biggest real gap

This is the category where Finch's polish is most transferable, because both
apps center a daily mood check-in.

| | Finch | HeartBeat |
|---|---|---|
| Mood input | Single rating → app-suggested tasks tuned to that rating | Three 1–10 sliders (joy, moody, hunger) rendered as a 10-word descriptive scale, side by side for both partners | `app/src/features/mood/MoodPage.tsx`, `mood.ts` |
| Free text | Full mood journal + tagging (people, activities) on Finch Plus | One `note?` field per entry, per person, per day | `app/src/domain/types.ts` |
| **History / trends** | Insights dashboard aggregating mood + goals + journaling over time; Finch Plus adds extended history | **None.** Confirmed no trend chart, graph, or week/month view anywhere in `features/mood` | — |
| Cross-partner comparison | N/A (solo app) | `widestGap()` / `comparisonLine()` — same-day only ("Furthest apart on moody, 4 points between you") | `app/src/features/mood/mood.ts` |

The missing mood **history** is the single sharpest gap in the whole
comparison. HeartBeat computes a genuinely nice same-day sentence
(`moodSummary()`) but throws the number away the next day — there's no way
for a couple to see "we've both been low all week" or "your joy dipped
whenever the cycle app shows PMS week." Finch users specifically cite the
insights dashboard and mood-history view as reasons they keep opening the
app past the novelty phase.

> **Suggestion — mood trend view.** `MoodEntry` already carries `day`,
> `memberId`, and all three meter values (`app/src/domain/types.ts`); Dexie
> already stores every entry, nothing is discarded. A `domain/mood/trends.ts`
> module (pure, testable, in the existing `domain/` layer — see the layering
> rule in `docs/CURRENT_STATE.md` §1) could compute a rolling 7/30-day view per
> meter per partner with no new sync plumbing at all, since the data already
> exists on both phones. This is the highest-leverage, lowest-risk addition in
> this whole document — it's a read over data that's already local.

> **Suggestion — correlate mood with cycle.** HeartBeat already has a real
> cycle-prediction engine (`domain/cycle/predict.ts`) that Finch has no
> equivalent of at all (§6). A trend view that overlays mood against cycle
> phase would be a feature Finch's own users would want and structurally
> can't get from Finch.

---

## 3 · Habit mechanics: streaks, journeys, achievements

Contrary to a first read of the architecture, **HeartBeat already has
streaks** — they're just spent differently than Finch's.

| | Finch | HeartBeat |
|---|---|---|
| Streak counter | Updates on any daily check-in; shown prominently, resets on a missed day | `Task.streak` per task, feeds a **shared HP bonus** in raid battles (`+2 HP/day`, capped at 20); `bestStreak` is also a lifetime achievement counter (tiers at 3/10/30 days) | `app/src/domain/rpg/task.ts`, `vigour.ts`, `achievements/catalogue.ts` |
| Streak-breaks punish? | Yes — a missed day resets the visible streak | **Deliberately no.** `settle()` decays but achievements track *best-ever* streak, which "only ever goes up" | `app/src/domain/achievements/catalogue.ts` |
| Guided habit programs | "Journeys" — curated multi-step programs by category (mindfulness, fitness, work-life, home), gated behind Finch Plus for the full library | **No curated program concept.** Quests are week-long shared day-count targets (`moodDays`, `exerciseDays`, etc.), not step-by-step guided content | `app/src/domain/quests/templates.ts` |
| Breathing / guided exercises | Full library (free tier has some, Plus unlocks all), the single most-cited feature in reviews | **Not present.** `ReflectionsPage` is prompts/quizzes, not breath-paced guided sessions | `app/src/features/activities/ReflectionsPage.tsx` |

The philosophical difference is a genuine strength worth stating plainly: a
missed day in HeartBeat costs nothing lasting (quests just retire, task
streaks decay but the achievement floor never drops), which several Finch
reviews cite as something they *wish* Finch did — a broken streak is one of
the most commonly mentioned frustrations in Finch reviews and Reddit threads.
This isn't a gap to close; it's worth keeping and, if anything, saying so
out loud somewhere in the app (a "your best streak never resets" line would
cost nothing and directly counter a competitor's known pain point).

> **Suggestion — a short guided breathing/grounding activity.** This is
> Finch's most-cited feature and HeartBeat has nothing like it. It doesn't
> need Finch's full "journeys" content library — a single paced-breathing
> screen (visual expand/contract cycle, no audio dependency, works offline)
> that lights the existing `Rest` charge (`domain/rpg/charges.ts`) on
> completion would slot into the current charge system with no new
> mechanics, just a new UI screen plus one repository write. Two-minute
> scope, not a content platform.

> **Suggestion — surface the streak-never-resets framing.** Free: a line
> already true of the code (`achievements/catalogue.ts`'s own doc comment)
> that a UI screen could just say, e.g. next to `bestStreak` on whatever
> shows achievements today.

---

## 4 · Customization economy

Both apps use the same shape — free cosmetic currency earned by doing the
real-world thing, spent on appearance only, no stat-relevant pay-to-win —
but HeartBeat's is considerably deeper.

| | Finch | HeartBeat |
|---|---|---|
| Currency | Rainbow stones, earned from adventures/goals | Coins, earned from tasks | both cosmetic-only, no real money |
| Slots | Outfit + room decoration | 5 gear slots + dyes (recolor) + 4-slot birbhouse (window/wall/floor/perch) + garden (6 plots) | `app/src/domain/rpg/{gear,dyes,furniture,plots}.ts` |
| Rarity / power | None — purely cosmetic | 5-rung tier ladder (common→mythic); **every** item, cosmetic or not, carries a small stat + passive, with diminishing-returns stacking | `app/src/domain/rpg/tiers.ts` |
| Ownership model | Individual (solo app) | Gear/dyes are per-avatar; the birbhouse is **couple-owned** — either partner can rearrange it and both see the same result | `app/src/domain/rpg/furniture.ts` |
| Loot mechanic | Adventure returns items automatically | 3-tier chests (wooden/silver/gilded) with a visible pity counter | `app/src/domain/rpg/chests.ts` |

HeartBeat's customization system is already more elaborate than Finch's on
every axis except one: **presentation surface area**. Finch shows the bird
+ its room on the home screen, permanently, so every outfit change is
visible the instant you open the app. HeartBeat's equivalent (`PartyPage`,
`ChestAlcove`) is a screen you navigate to. That's a UX-emphasis gap, not a
feature gap — HeartBeat has strictly more to show, it's just not the first
thing shown.

> **Suggestion — a persistent pet/house glimpse on the dashboard.** Not a
> new system — `holdingsLoadout`/the birbhouse render already exists
> (`features/party/art/house/`). A small always-visible card on whatever
> screen opens first (mood/dashboard) showing the current pet + birbhouse
> state would borrow Finch's single best piece of screen-real-estate
> psychology — "the thing you decorated is the first thing you see" — for
> free, since the art already exists.

---

## 5 · Social features

| | Finch | HeartBeat |
|---|---|---|
| Who you're social with | A broader friends graph — add multiple friends, send "good vibes" encouragement, hold each other accountable on linked tasks | Exactly one person: the paired partner. By design — see the pairing gate in `docs/DESIGN.md` | `app/src/features/pairing/` |
| Encouragement mechanic | Send good vibes to any friend | `good-vibes` life event, capped at 3/sender/day, explicitly modeled on "Finch's friend feature" per the code comment | `app/src/domain/rpg/lifeEvents.ts` |
| Reactions | N/A found in research | **Cheers** — one cheer per person per event; can cheer a vibe you *received*, not one you *sent*; can't cheer your own hard day | `app/src/db/repository/cheers.ts` |
| Direct messaging | Not a core feature | Shared chat thread between the two partners | `app/src/features/chat/` |
| AI-assisted warmth | Not present | Compliment composer — generates a tone-adjustable compliment (tender/playful/funny/proud) to send the partner | `app/src/features/mood/ComplimentComposer.tsx` |

HeartBeat has already built a version of Finch's most-praised social
mechanic (`good-vibes`, directly credited to Finch in the code comment) and
then added two things Finch doesn't have at all: a reaction/cheer layer and
an AI compliment generator. The gap here isn't features, it's breadth — Finch
"friends" is a graph, HeartBeat is a single relationship by design, and
widening that isn't on the table (it would break the pairing model the
whole app is built on, per `docs/DESIGN.md`). Nothing to fix; noted for
completeness.

---

## 6 · What HeartBeat has that Finch doesn't have at all

Worth stating plainly, since a gaps-focused document can read one-sided
otherwise:

- **Cycle tracking with real prediction** — median cycle length, MAD-based
  spread, luteal-anchored ovulation estimate, explicit uncertainty bands, a
  scoped PIN lock, and an opt-in partner nudge (`domain/cycle/predict.ts`,
  `features/cycle/CycleLock.tsx`). Finch has no cycle feature of any kind.
- **A shared calendar.**
- **A turn-based battle system with a 7-island map**, each island keyed to
  one of the app's own habit categories (movement, nourishment, focus, mood,
  rest, bond, balance) — Finch's "adventures" are a timer, not a game.
- **Offline-first, no-account architecture.** No email, no password, no
  server-side account beyond a pairing code; Finch requires an account.
- **Zero monetization.** No subscription tier, no ads, no IAP anywhere in
  the codebase (confirmed by grep, not just absent UI). Finch Plus is
  $9.99/mo or $69.99/yr and gates the full breathing/reflection library,
  extended mood history, and advanced tagging.

---

## 7 · Structural platform gaps (not fixable by adding a feature)

These are consequences of HeartBeat being a PWA rather than a native app,
called out separately because no amount of in-app work closes them:

- **No home-screen widget.** Finch's App Store listing literally puts
  "Widget" in the name (*Finch: Self-Care Widget Pet*) — the bird-on-your-
  home-screen is core to why people open the app daily. There is no Web
  Widgets API on iOS or Android as of this writing; a PWA cannot ship one.
  Worth knowing as a ceiling, not a backlog item.
- **Push requires an actual Home Screen install on iOS** — a browser tab
  gets nothing. This is why `FirstRunGate`/`WelcomePage` gate so hard on
  install state, and it's real first-session friction a native app doesn't
  have.

---

## 8 · Suggestions, prioritized

Ranked by (impact on the biggest identified gap) ÷ (how much of it already
exists in the current architecture) — cheapest, highest-leverage first.

1. **Mood trend view** (§2) — pure read over data already stored locally,
   no sync changes, no new schema. Closes the single sharpest gap in this
   document.
2. **Streak-never-resets messaging** (§3) — a UI label, zero logic changes,
   turns an existing strength into a stated one.
3. **Dashboard pet/house glimpse** (§4) — reuses existing art and state,
   pure presentation change.
4. **One guided breathing screen** (§3) — new UI, but hooks into the
   existing `Rest` charge with no new mechanic underneath it.
5. **Mood × cycle correlation** (§2) — depends on (1) shipping first;
   larger scope, but plays directly to a category Finch structurally can't
   compete in at all.

Nothing above proposes a friends graph, a subscription tier, or a
solo-use mode — those would cut against the pairing-first, no-monetization
design this app has already committed to, and Finch's version of each is a
different product's answer to a different product's problem.
