# ONE-SCROLL.md — every page in about one screen

## Goal

Every page shows what it is for in one phone screen (390×844) plus, at most, a
short scroll. Nobody should have to dig for the thing they came for.

Today's ceiling is `MAX_VIEWPORTS = 3` in `app/src/ui/layout/contract.ts`, and it
is only a dev warning. Three screens is the current limit. One screen is the
target.

## What already exists

Reuse these. Nothing new needs to be invented.

| Piece | Where | Used by today |
|---|---|---|
| `Screen` + `SwipePane` (≤3 panes, scroll-snap, dots or `tabs`, keyboard) | `app/src/ui/layout/` | `Screen` on most pages; `SwipePane` only on Birb (it had no users before) |
| `Sheet` (a bottom sheet for secondary content) | `app/src/ui/Sheet.tsx` | popups, Boss Gate |
| Collapsibles (`aria-expanded` button + chevron) | the Merchant, `InfoBubble` | Shop |
| `InfoBubble` guides | `app/src/ui/InfoBubble.tsx`, `features/guide/guides.ts` | every page title |

## The rules

1. **Above the fold:** the page title, the one thing the page is for, and its
   one primary action.
2. **Secondary content** goes into a second or third `SwipePane` pane, or a
   `Sheet`. A fourth stacked panel is never the answer.
3. **Lists** show five items, then a "See all" button opens a `Sheet`.
4. **Explanations** go behind the (i). Inline `section-sub` paragraphs are the
   biggest height cost on most pages.
5. **Long forms** become steps inside a `Sheet`.

## Page by page

| Page | Pane 1 (the point) | Pane 2 / 3, or a Sheet |
|---|---|---|
| Home | birb hero + Today | the cards → pane 2 |
| Shop | the chests | Merchant → pane 2 |
| Birb | companions | look (colours + costumes) · room + garden plots |
| Raid | Island Path (shipped one-scroll in this PR) | sheet + gear diff · boss + adventures (collapsed) |
| Partner | their birb + days together | Good vibes feed · sending one opens a Sheet |
| Bag | slot grid + amulet | stat sheet |
| Tasks | dailies | habits · to-dos; Finished and Kept up open in a Sheet |
| Mood | three meters + rest/gratitude/nourish flags | the note · cycle log |
| Move | the sets | how it went + proof · history |
| Work | the month | the agenda |
| Study | today's due cards | the decks |
| You (Settings) | grouped rows: Theme, Calm, Cycle, The two of you, You | each row opens a Sheet |
| Eve's Garden | already a fixed-height game screen | — |

## Measured

`npm run pair:live` measures every page on a linked phone at 390×844 and prints
the table. It is the only harness with a paired phone, and nearly every page
sits behind PairGate, so `visual.mjs` would only ever measure the pairing
screen. A fresh couple has no data, so these numbers are floors, not a typical
day.

| Page | Screens (2026-10-06) | Status |
|---|---|---|
| Home | 4.27 | next |
| Settings | 4.01 | |
| Tasks | 3.48 | |
| Mood | 2.57 | |
| Move | 2.49 | |
| Raid | 2.00 | Island Path shipped; still over |
| Shop | 1.79 | |
| Bag | 1.49 | |
| Work | 1.27 | |
| **Birb** | **1.00** (Look 1.24, Room & yard 1.07) | **done** |
| Partner | 1.00 | done |

### Birb, as shipped

- Hero: the birbhouse room with your bird in it, who it walks with, coins, and
  the one primary action (Hatch an egg), with Adventure beside it.
- `SwipePane` with `tabs`: **Companions** (three compact rows; "See all" opens a
  `Sheet` with the full cards; egg odds in a collapsed drawer) · **Look** (the
  colours, three across) · **Room & yard** (what furnished itself, then the
  plots).
- The explanations moved behind the (i).

Two `SwipePane` fixes came with it. Panes you are not on are `inert`, because
`aria-hidden` alone left their buttons in the tab order. The track also takes
the height of the pane you are on, where before a short pane inherited the
tallest one's height and the page scrolled into blank space.

## Phases

Each phase is its own PR, so one long page never blocks the rest.

- **P0 · Measure.** ✅ Done, in `pair-live.mjs` rather than `visual.mjs` (see
  above).
- **P1 · Contract.** ✅ `TARGET_VIEWPORTS = 1.25` in `contract.ts`, tested, and
  warned about in dev.
- **P2 · Primary tabs.** Home, Quests, Shop, Partner, Bag, Birb (Birb done).
- **P3 · Menu pages.** Tasks, Mood, Move, Work, Study, You.
- **P4 · Gate.** `pair-live.mjs` fails any route over 1.5 viewports. Pages that are
  not done yet sit on an allowlist, and that list is only allowed to shrink.

## Things to watch

- **Hiding is not deleting.** Moving something into a pane or a Sheet must keep
  it reachable by keyboard and screen reader. `SwipePane` already handles that,
  so use it rather than a hand-rolled carousel.
- **Don't hide the primary action behind a swipe.** If a page's main button ends
  up in pane 2, the page split is wrong.
- **`study/index.html` goes stale** whenever `styles.css` or app source changes.
  Run `npm run study:build` last in every phase PR.
