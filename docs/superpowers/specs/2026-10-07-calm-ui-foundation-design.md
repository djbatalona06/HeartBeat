# Calm UI: foundation, retune, `ui/` primitives, Home pilot — design

**Status:** decisions settled 2026-10-07. Not built yet. Pieces A (foundation) and
B (visual language) of the rebuild mapped in `docs/ui-map.md`, in one spec. Piece C
(Eve's Garden, Raid Gate, heart vial, habitat) and `gift/` are out of scope.

## Decisions

| Question | Decision |
|---|---|
| Preserve or overhaul? | **Evolve.** Five packs, mascots, routes and screen inventory stay. Levers 1–4 of `frontend_taste` §11.D only. |
| Direction | **Calm, roomy.** Dials ≈ variance 5 / motion 3 / density 3. Reference feel: Apple Health, Things 3. |
| Where the room comes from | **Show less per screen.** Enforce `docs/ONE-SCROLL.md`; secondary content moves to panes or a `Sheet`. Nothing is deleted. |
| Styling language | **Native CSS** over the runtime tokens: `@layer`, nesting, container queries. No Tailwind, no CSS-in-JS, no CSS Modules (`docs/TAILWIND.md`, `docs/PULSE.md`). |
| Lint | **A vitest file, not stylelint.** No new dependency. |
| Colour | **Ground colours only** (`base`, `surface`, `surfaceMuted`, `border`), desaturated per pack. Accent, text, success, danger untouched. |
| Pilot page | **Home**, split into three panes. |
| Delivery | **Four PRs**, each through `staging`. |

## 1 · Foundation (PR 1, no visual change)

**Layers.** New entry `app/src/styles/index.css` opens with

```css
@layer reset, tokens, base, ui, features, legacy, overrides;
```

The current `styles.css` content is imported into `legacy` unchanged.
`main.tsx`, `standalone.tsx` and `harness.tsx` import `./styles/index.css` instead
of `./styles.css`. One import site per entry keeps `cssCodeSplit: false` and both
standalone artefacts behaving as now.

**Split.** The 105 sections leave `legacy` for partials, grouped by owner
(`ui-map.md` §3 is the index; confirm owners before moving):

- `styles/base/` — preamble, shell, depth, film grain, motion, motion-damped
- `styles/ui/<component>.css` — one per `ui/` component and layout primitive
- `styles/features/<feature>.css` — one per `features/<feature>/`
- `styles/engine/` — Eve's Garden, charge meter, heart vial, Raid Gate, garden
  backdrops, big tree, habitat (moved verbatim; restyling them is piece C)

Source order inside each layer is preserved, so the cascade is unchanged.

**z-index.** The scale already exists in `themes/tokens.ts`: `--z-scene 0`,
`--z-content 1`, `--z-chrome 6`, `--z-overlay 40`, `--z-sheet 45`, `--z-toast 50`.
Rule: anything stacking against the page uses a token; a raw `1`–`4` is allowed only
inside a parent with `isolation: isolate`. The 21 raw values are moved onto that rule.

**Guardrail test.** `app/src/styles/styles.test.ts` reads every partial and fails on:

1. a `var(--x)` that is neither defined in `tokens.ts` / a stylesheet nor set from a
   component (`'--x'` as a style key in any `.tsx`). All 14 names `ui-map.md` §4 lists
   as undefined are set from components today, so the test passes on day one
   without a hand-kept allowlist.
2. a raw `z-index` number outside an `isolation: isolate` parent.
3. a hex colour outside `themes/`, except as a `var()` fallback (the preamble and
   the crash fallback use those on purpose: they paint before tokens are applied).

**Dead rules.** Delete only the confirmed-dead: `.shop-grid`, `.shop-item-art`,
`.shop-item-button`, `.shop-item-name`, `.shop-item-price`, `.shop-item-rarity`,
`.login-award`, `.login-award-said` (8). The other 16 candidates are built at
runtime (`tilecard-${variant}`, `bar-fill-${tint}`, `grade-${grade}`,
`.garden-dpad-*`, the move bar's `.is-*`) and stay.

**Gate.** `npm run visual` frames before and after PR 1 are byte-identical in the
same container. (Committed baselines still come from CI, per `CLAUDE.md`.)

## 2 · The calm retune (PR 2)

**Type** (`SHARED_TOKENS` in `themes/tokens.ts`):

| Token | Now | New |
|---|---|---|
| `--text-xs` | 12px | 13px |
| `--text-sm` | 13.5px | 15px |
| `--text-base` | 15.5px | 17px |
| `--text-lg` | clamp(17px, 4.4vw, 19px) | clamp(19px, 5vw, 21px) |
| `--text-xl`, `--text-2xl`, `--text-3xl` | — | unchanged |
| `--line-body` | 1.55 | 1.5 |

`tokens.test.ts` gains: no `--text-*` below 13px.

**Spacing.** `--space-1…7` unchanged. `--stack` 18px → 24px. New
`--section-gap: var(--space-6)`. `--shell-gutter` 18px → 20px.

**Motion.** `--ease-soft` becomes `cubic-bezier(0.34, 1.1, 0.5, 1)`. The old curve
moves to a new `--ease-reward: cubic-bezier(0.34, 1.4, 0.5, 1)`, used only by bar
fills, chest reveals and the level-up moment. Per-pack `motion` values unchanged.

**Blur.** Remove `backdrop-filter` from "today" (`styles.css:539` on `cf8d494`) and
the wallet badge (`:1487`, `:1524`); they take solid `--color-surface`. Tab bar,
menu, messages, command menu and scrims keep theirs.

**Ground colours.** For every pack × palette, `base`, `surface`, `surfaceMuted`
and `border` keep their OKLCH hue and lightness and have chroma clamped:

| Token | Max OKLCH chroma |
|---|---|
| `base`, `surface` | 0.02 |
| `surfaceMuted`, `border` | 0.04 |

Alpha is kept. A one-off script computes the values; they are written as literals in
`themes/packs/*.tsx`, so there is no runtime transform and `applyTheme` is
untouched. A small `oklch()` helper (sRGB → OKLab → OKLCH, ~25 lines) lives in
`themes/` for the script and the test; no colour library is added.

**`themes/calm.test.ts`**, 5 packs × 2 palettes:

- ground chroma within the ceilings above
- `text` ≥ 4.5:1 on `base`, `surface`, `surfaceMuted` (alpha composited over `base`)
- `textMuted` ≥ 3:1 on `surface` (the existing bar in `tokens.test.ts`: muted text is
  only used at ≥18px or bold), extended to the composited `rgba()` tones that test skips
- accent-vs-`base` contrast ≥ its value before the retune (the old figures are pinned
  in the test)

`veil.test.ts` and `mood.test.ts` run unchanged. If one fails, the ground colour is
adjusted; a threshold is never relaxed.

## 3 · `ui/` primitives (PR 3)

Each component's rules live in `styles/ui/<name>.css`, nested, in the `ui` layer.
Class names unchanged.

- **One elevation.** `TileCard`, `ListRow` groups, `StatChip`: `--color-surface` +
  `--hairline` border, no shadow. Shadows only on `Sheet`, `Toast`, popups, menu.
- **Accent budget.** Filled accent: `PrimaryAction` only. Accent as state: selected
  chip, active tab, focus ring. `SecondaryAction`, `Chip`, inactive tabs, card
  borders: text and border tokens.
- **Container queries.** `TileCard` and `ListRow` set `container-type: inline-size`
  and lay out from their own width (stacked under ~280px, inline above), so one
  tile works full-width on a pane and half-width in a grid. Neither has a width
  `@media` rule today; this is additive.
- **`Screen`.** `sub` becomes optional (omitted → no `.page-sub` element). `.page`
  spaces children by `--stack` and `section`s by `--section-gap`, so pages stop
  setting their own outer margins.
- **Kept exactly:** `:focus-visible` rings, `--tap` 48px, `forced-colors`,
  `prefers-contrast`, every `prefers-reduced-motion` and `data-calm` block.

Only Home's page code changes in this spec. The other 24 pages adopt the primitives
as they are; their own one-scroll passes are later specs.

## 4 · Home pilot (PR 4)

Home already renders through `Screen`. It is 4.27 screens tall today (the
`ONE-SCROLL.md` table). It becomes a `SwipePane` with `tabs`:

| Pane | Contents |
|---|---|
| **Today** | `PetStage`, `LogStrip`, `TodaySection` (first 5, then "See all" opens a `Sheet`), `PairInvite` when unpaired |
| **Us** | `VitalsPanel`, `TogetherPanel` (paired only), `GoalsCard` |
| **Adventure** | `BossGateCard`, `QuestBoard`, `FeedPanel` |

Nothing is removed. The existing ordering rules hold: pet first, log row directly
under it, no guilt copy. Home keeps its `sub` (paired state and day are status, not
explanation, so they do not belong behind the (i)).

**Target:** the Today pane at or under `TARGET_VIEWPORTS` (1.25) at 390×844 with the
new type, measured with `npm run pair:live` as in `ONE-SCROLL.md`. Update that
table's Home row.

## Testing and rollout

Every PR, before push: `npm run typecheck`, `npm test`, `npm run visual` (both
themes, axe on every route, no console errors), the Lighthouse gate, and
`npm run study:build` as the **last** step in PRs 2–4 (all three touch code
`standalone.tsx` reaches). Delete the untracked frames `visual` leaves in
`app/tools/baselines/`.

New tests: `styles/styles.test.ts` (PR 1), `themes/calm.test.ts` and the
`tokens.test.ts` floor (PR 2). Components stay untested by design; PRs 3–4 attach
before/after screenshots of two packs in light and dark.

Flow per PR: feature branch → `staging` (two phones) → `main`.

Performance reference: the owner's iPhone. Blur removal and Home's split are checked
by hand in Safari's timeline before and after; not a CI gate.

## Out of scope

The other 24 pages' one-scroll passes, piece C (engine-adjacent sections), `gift/`,
Lightning CSS, the film grain, per-pack motion values, accent/text/state colours.
