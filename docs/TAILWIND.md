# TAILWIND.md — would Tailwind help, and what would it cost

Written because the question keeps coming up, and because the honest answer has
two halves that get quoted separately. Short version: **not as things stand, and
the reason is specific rather than taste.** The conditions that would change the
answer are in §5, and they are real conditions, not a polite hedge.

---

## 1 · The thing that decides it

`themes/tokens.ts`:

```ts
export function applyTheme(theme: Theme, calm: boolean, mode: ThemeMode): void {
  const root = document.documentElement;
  const vars = themeToCssVars(theme, mode);
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  ...
}
```

Every colour, radius, duration, shadow and font in this app is **a CSS custom
property written as an inline style on the root element at runtime**, from a
choice a couple made in Settings. Five packs × two modes, switchable without
re-rendering a single component — that is the design, and `packs/` exists
because of it.

Tailwind resolves at **build time**. It cannot know what `--color-accent` is,
because nothing knows until somebody picks a theme on their phone.

That does not make Tailwind unusable. It makes it a **pass-through**: every
themed utility would have to be an arbitrary value wrapping the same custom
property the stylesheet already writes.

```html
<!-- what the stylesheet says today -->
<div class="tile">

<!-- what Tailwind would say -->
<div class="bg-[var(--color-surface)] border-[var(--border-width)]
            border-[color:var(--color-border)] rounded-[var(--radius-large)]
            shadow-[var(--shadow-lift)] p-[var(--space-4)] min-h-[120px]">
```

The second is not a design system. It is the first one retyped at every call
site, with the cascade removed. Tailwind's actual value proposition — a
constrained palette of utilities that stops arbitrary values — is precisely what
a runtime theme engine cannot accept, because every value is arbitrary to the
compiler by construction.

**This is the whole argument.** Everything below is consequences and honesty
about what is genuinely lost.

---

## 2 · What it would cost, concretely

| Cost | Detail |
|---|---|
| Build | A PostCSS pipeline into a Vite build that currently has none, plus `unplugin-dotnet-wasm` and three separate configs (`vite.config.ts`, `vite.standalone.config.ts`, `vite.harness.config.ts`) that would each need it. |
| The artefacts | `study/index.html` and `gift/birthday.html` are committed single-file builds, diff-checked by CI. Both inline the stylesheet. Tailwind's output is generated from a content scan, so the artefact's bytes become a function of *which files the scanner walked* — a config change nobody thought was visual turns CI red on a file nobody edited. |
| The contrast guard | `veil.test.ts` composites `SCRIM_STRENGTH` and `GLASS_STRENGTH` against six palette tokens and proves text over the live garden clears AA. It reads `tokens.ts`. That survives — but only because the tokens survive, which is the point: Tailwind would sit on top of the system that is actually doing the work. |
| ~6,350 lines | Not "legacy CSS". It carries the reasoning — why `--scrim` is 72% and not 70%, why the tab bar is a bar and not a rail, why `.shell::after` and not `body::after`. A utility class holds no comment. Migrating means either discarding that or moving it to a place nobody reads. |
| Review | "A raw button fails review" is about to become a grep-based CI check (step 7). Grepping for a bare `<button>` in a file of semantic classes is easy. Grepping for one in a file where every element carries thirty utilities is not. |

**Estimated honestly: one to two weeks of full-time migration** to arrive at
visual parity with what exists, with a real risk of subtle regressions in the
five packs nobody would catch without the screenshot harness that does not exist
yet. That is the same span as the entire remaining UI overhaul.

---

## 3 · What is genuinely lost by not adopting it

The case against should not be a strawman, so:

- **No dead-code elimination for CSS.** The stylesheet ships whole, 129 KB raw
  / ~19 KB gzipped. Tailwind's JIT ships only what is used. ~19 KB gzipped for
  an app that already precaches ~1 MB is not the constraint, but it is real and
  it will grow.
- **No enforced constraint.** Nothing stops a new rule using `14px` instead of
  `var(--space-4)`. Tailwind makes that awkward by default; here it is a
  convention held by review. Step 7's grep check exists partly to cover this,
  and a grep is weaker than a compiler.
- **Colocation.** Reading `TileCard.tsx` does not tell you what a tile looks
  like; you have to open `styles.css` and search. That is a real cost paid on
  every single change, and it is the strongest argument in Tailwind's favour.
- **Onboarding.** Tailwind is a transferable skill; this stylesheet's
  conventions are not. For a two-person project this matters little; it would
  matter a lot with contributors.
- **Dead CSS accumulates silently.** `.odds-row[data-rarity='godly']` sat in
  the file for the length of a rename, referencing a token
  `domain/rpg/tiers.ts` had removed — the odds table renders `RARITIES`, which
  is `TIERS`, which has no `godly` rung, so it could not match. It was found by
  hand while writing this document and deleted in the same change. Tailwind
  would have dropped it automatically and silently. That is a genuine cost of
  the current approach, and one rule is unlikely to be the only instance.

---

## 4 · The cheaper things that buy most of the same ground

Ranked by value per hour, and none of them is a migration:

1. **A grep check for raw hex and raw px in `styles.css`** — the constraint
   Tailwind enforces, as ten lines of CI, in a repo that is already adding
   grep-based checks in step 7. Catches the drift; keeps the comments.
2. **Delete the dead rules.** `godly` is one; there are likely more. One
   afternoon, and it removes the clearest realised cost above.
3. **A token reference in `docs/design-system.md`** (step 7 ships this anyway) —
   the discoverability half of colocation, without the syntax.
4. **Split `styles.css`** into imported sections mirroring `features/`. At 6,350
   lines the search problem is mostly a *size* problem, and Vite handles CSS
   `@import` at build time with no runtime cost. This is the single highest-value
   item on the list and it is maybe a day.

Item 4 addresses the colocation complaint more honestly than Tailwind would, and
it does not touch a single component.

---

## 5 · What would change the answer

Stated as conditions, so this document can be checked rather than re-argued:

- **The runtime theme engine goes away** — one palette, or themes compiled per
  build. Then Tailwind's constraint model applies and most of §1 evaporates.
- **The team grows past two.** The onboarding and colocation costs scale with
  headcount; the migration cost does not.
- **A component library gets adopted** that assumes Tailwind (shadcn/ui and
  most of its descendants). Fighting that is worse than migrating.
- **`styles.css` passes ~10,000 lines with §4.4 already done.** At that point
  the size problem is structural rather than organisational.

None of the four holds today. If one starts to, the migration is a known
quantity — and §4.4 makes it *easier*, not harder, because per-feature
stylesheets are what you would convert file by file.

---

## 6 · Where this leaves the 2.5D work

Worth saying plainly, because it was the question that prompted this document:
**adopting Tailwind would not have changed a line of tranches A–E.**

Grain, contact shadows, the depth-aware press, the foreground plane and the tier
ring are all either custom properties on `:root`, values derived from
`--shadow-color` and `--color-accent` with `color-mix`, or an SVG group. Every
one of them has to resolve at runtime against a palette chosen on a phone. In a
Tailwind build they would be written in exactly the same place, in exactly the
same syntax, and referenced from a utility class that added nothing.

The 2.5D look and the styling system are orthogonal questions. This one can be
answered later without holding anything up.
