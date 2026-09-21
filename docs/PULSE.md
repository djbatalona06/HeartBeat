# PULSE.md — Round 3's makeup upgrade, measured against the tree

Written the same way `TAILWIND.md` and `DEPTH.md` were: the question was asked
in good faith, the answer is mostly "already done", and the part that is not
done is worth doing. Short version: **the Round 3 brief describes an app from
before the depth pass.** Roughly seven tenths of its handoff checklist shipped
in steps 1–7. One item on it is real, unbuilt, and is the best idea in the
document. The proposed CSS-in-JS layer is the one thing to decline, and §4 says
what would change that.

---

## 1 · What the brief asks for, against what is in the tree

The brief's own "do not cut" list, checked one at a time:

| Asked for | State | Where |
|---|---|---|
| Reduced-motion guards | **Ships** | 18 `@media (prefers-reduced-motion: reduce)` blocks, plus `calm`, which folds the system preference and the Settings toggle into one flag so a component never has to check both |
| Safe-area handling | **Ships** | 20+ `env(safe-area-inset-*)` sites — the shell, the tab bar, the sheet, the toast, the menu panel |
| Elevation scale | **Ships** | `--lift-1/2/3`, `--press`, `--shadow-contact`, `--shadow-lift`, all built on the mode-corrected `--shadow-color`. See `DEPTH.md` §B and §C |
| Motion primitives | **Ships** | `--ease-soft` is the overshoot spring the brief proposes, to three decimal places; `--motion-fast/medium/slow` are per-pack |

And the rest of the handoff checklist:

| Asked for | State |
|---|---|
| Fluid type scale with `clamp()` | **Ships** — `--text-lg` through `--text-3xl` |
| No magic numbers for spacing | **Ships** — a 4px scale, `--space-1..7` |
| `theme-color` meta syncs on theme change | **Ships**, and more correctly than the brief's version: `ThemeProvider` reads the palette that is showing rather than `getComputedStyle`, so it is right on the frame the mode flips rather than one frame late |
| Time of day is modelled | **Ships** — `domain/scene/schedule.ts`, with `useHour` sleeping exactly until the hour turns rather than polling |
| Pet mood is modelled | **Ships** — `domain/pet/mood.ts`, derived from the hour and the couple's glow |
| `tokens.test.ts` over both palettes | **Ships** |
| **Anything responds to app state** | **Did not ship.** This is the gap |

Two of the brief's concrete snippets would also have failed CI on arrival. The
elevation scale is written as `rgba(0,0,0,0.04)`, and no pure black is a rule
`scripts/check-ui-review.mjs` enforces on every `.ts`, `.tsx` and `.css` file in
`app/src` — a hand-rolled black shadow is a smudge on the five light palettes,
which is the whole reason `--shadow-color` is emitted mode-corrected. And
`moodToHue` would have walked ten palettes' worth of contrast that
`tokens.test.ts` currently proves.

## 2 · The gap is real, and it is §3 of the brief

Strip out what already ships and one thing is left standing: **the app knows a
great deal about itself and spends none of it on how it looks.** `moodFor()` has
been deriving a mood since the mascot shipped, and exactly one drawing on one
screen has ever read it. `phaseAt()` knows whether it is dawn or night, and only
the garden's own backdrop asks.

That is the makeup upgrade. Not a layer over the app — a wire between two things
already in it.

## 3 · What was built, and the two places it differs from the brief

`--color-accent-live`: the pack's accent, leaned a bounded distance by the pet's
mood. `applyMood` sets one attribute on the root element; the mix lives in
`styles.css`.

**It leans, it does not rotate.** The brief's `hsl(var(--color-accent-h), 70%,
55%)` replaces the accent outright, which erases the five packs — shinobi's rust
and pony's lilac exist so that they are different apps to be in, and a hue
driven by a bird's mood overrules all five. So each pack leans toward a colour
already in its *own* palette: `success` when the pet is happy, `base` when it is
sleepy, so the accent recedes into the page rather than dimming to grey.
`content` is the untouched accent, so the app at rest is the theme as designed.

**The mix is CSS, not TypeScript.** `applyTheme` writes tokens as inline styles,
so an accent computed in TS would go stale on every theme and mode change and
would have to be re-sent by whoever happened to know the mood. A `color-mix`
over `var()` re-resolves against whatever palette is showing, for free. The
strengths are emitted as `--mood-warm`/`--mood-dim` from the constants
`mood.test.ts` measures, so the two sides cannot drift — the same arrangement
`--scrim` and `--glass` already use.

`mood.test.ts` walks five packs × two palettes × three moods and asserts the
button label still clears AA on every accent this can produce, and that the
sleepy lean never spends more than 30% of the separation the pack already had.
The floor is 5.22:1 against AA's 4.5. Lower either strength and the test fails,
which is the point.

Also built: a launch screen in `app/index.html`, inside `#root` so React's first
render removes it without a script. An installed PWA on iOS gets no launch image
unless the page provides one, and a white rectangle on cold start is the single
clearest tell that an app is a website.

## 4 · Pulse, and why not

The brief proposes a ~200-line first-party CSS-in-JS runtime plus a Vite plugin
for build-time extraction. Its four stated jobs, against this repo:

1. **"Co-locates styles with components."** A real benefit, and the only one of
   the four that survives contact. Weigh it against §4's cost.
2. **"Reads directly from `tokens.ts` with type safety."** `tokens.ts` does not
   hold values that a build step could read. It holds *five packs × two
   palettes*, resolved on a phone from a choice in Settings. This is the same
   wall `TAILWIND.md` §1 hits, and it is not a coincidence: anything resolving
   at build time can only ever pass the custom property through.
3. **"Composes motion primitives."** `--ease-soft`, `--press`, `--motion-*` and
   the `calm` flag already compose, in CSS, where the `prefers-reduced-motion`
   query lives.
4. **"Switches on app state without prop drilling or CSS variable
   gymnastics."** This is the one the work above answers directly. `data-mood`
   on the root element cost one line of JavaScript and no runtime — the same
   mechanism `data-theme`, `data-mode` and `data-calm` have used since the
   theme engine was written.

The cost is not the 1.2 KB. It is that `study/index.html` is a single
double-clickable file with the whole standalone bundle inlined, and CI runs
`git diff --exit-code` on it. A build-time CSS extraction plugin puts a second
code generator upstream of a byte-exact gate that a one-line edit to
`useCanvasLoop.ts` has already broken once. That is a CI hazard bought for
benefit (1), which `styles.css` being one file mostly already provides.

**What would change the answer.** Any of these, and this should be reopened:

- The component library outgrows the stylesheet — say 40+ components in
  `app/src/ui/`, where finding the rule is genuinely the slow part.
- A second app or a design-system package needs the tokens, so they have to be
  consumable as values rather than as a stylesheet.
- `styles.css` passes ~10,000 lines and the cost of *finding* a rule overtakes
  the cost of a second generator. It is 7,200 today.

## 5 · What is still open from the brief

Not built here, in the order they are worth doing:

- **Cycle phase tints the wellness card.** The best remaining idea. It needs a
  `Phase` type first — `domain/cycle/predict.ts` predicts dates, and nothing
  names menstrual/follicular/ovulation/luteal. That is a domain module with its
  own tests, not a colour change, which is why it is not bundled in here.
- **Time of day shifts the app background.** `phaseAt()` is ready and the wire
  is the same one `data-mood` uses. Held back because the ground is what
  `veil.test.ts` composites text legibility against, so it needs that test
  extended to four phases before the first line of CSS, not after.
- **Partner activity pulse.** The brief's own first overrun cut. Agreed.
