# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install (run from repo root — npm workspaces)
npm install

# Dev server (app only)
npm run dev          # http://localhost:5173

# Build (production, must set APP_BASE for correct SW scope)
APP_BASE=/ npm run build

# Tests
npm test             # all workspaces (app + worker)
npm run test --workspace app
npm run test --workspace worker

# Typecheck
npm run typecheck    # both workspaces

# Single test file
cd app && npx vitest run src/db/repository/entries.test.ts

# Gift page
npm run gift:build   # rebuild gift/birthday.html
npm run gift:verify  # headless browser walk of every screen

# Study page (rebuild after ANY change to app/src/styles.css — see pitfalls)
npm run study:build  # rebuild study/index.html
```

## Architecture

This is a **PWA for two people** (couples tracker: mood, workouts, cycle, calendar, pet/RPG). It deploys across three independent targets:

| Directory | What it is | Deploy target |
|-----------|-----------|--------------|
| `app/` | Vite + React + TypeScript SPA/PWA | Cloudflare Pages — project `heartbeat-app`, served at `heartbeat-eop.pages.dev` |
| `worker/` | Cloudflare Worker (pairing, sync, push) | Cloudflare Worker via `worker-deploy.yml` (migrations, then deploy) |
| `index.html` + `gift/` | Landing page + birthday piece | GitHub Pages |

Both Cloudflare pieces bind the **same D1 database**.

### Data flow

All writes go through `app/src/db/repository/`. Components call repository functions; Dexie live queries drive re-renders. Nothing in `features/` touches the database directly.

- **Local DB**: Dexie (IndexedDB), schema in `app/src/db/database.ts`
- **Remote sync**: Cloudflare Worker (`worker/src/`) reads/writes D1; the app POSTs to `/api/*` Pages Functions in `app/functions/`. Two round trips, deliberately separate: `/api/entries` carries everything keyed by a **day** (mood, exercise, cycle, work, photos) and `/api/holdings` everything keyed by a **row** (inventory, pets, avatars, tasks, quests, life events, cheers). They have their own watermarks in `Settings`, so one failing does not stall the other.
- **Domain logic**: `app/src/domain/` — pure TypeScript, no React, no Dexie. Tests live beside each module (`*.test.ts`). Vitest is restricted to `*.test.ts` only; components are not unit-tested by design.

### Key domain modules

- `domain/xp.ts` — XP/level calculations for the shared pet, 50 levels on a
  four-band curve (the 2–10 band is byte-for-byte what shipped)
- `domain/rpg/tiers.ts` — the Common→Mythic ladder every ownable thing lands on
- `domain/rpg/raidStats.ts` — the seven raid stats; `loadout.ts` turns what a
  couple owns into a sheet
- `domain/rpg/companionSkills.ts` — one skill kit per mascot, keyed by theme id
- `domain/rpg/raidGate.ts` — who stands in the arch, and when the gate opens
- `domain/rpg/chests.ts` — three chests, three pity counters
- `domain/rpg/milestones.ts` — what each of the 50 levels is actually worth
- `domain/rpg/plots.ts` — the garden's ground (earned, not bought) and what
  grows in it
- `domain/quests/` — quest definitions, progress tracking, completion logic
- `domain/achievements/` — achievement state derived from synced data
- `domain/rpg/` — boss fights, party stats
- `db/repository/` — single source of truth for all DB operations; one module per section behind a barrel

### Deploy secrets (GitHub Actions)

Two workflows deploy: `deploy.yml` (Pages, every push to `main`) and `worker-deploy.yml` (the Worker, on pushes touching `worker/**` — it applies D1 migrations before deploying). Both need the same two repo secrets:

- `CLOUDFLARE_API_TOKEN` — must have **Cloudflare Pages: Edit** + **D1: Edit** + **Workers AI: Read** + **Workers Scripts: Edit** (the last one for `worker-deploy.yml`)
- `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard sidebar

Optional, and set on the **Pages project** rather than as repo secrets:
`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` turn on GitHub account recovery.
Unset is a supported configuration — the feature hides itself and the pairing
code remains the only way into a couple either way. See §8 of `docs/DEPLOY.md`.

The deploy step runs from `app/` so wrangler reads `app/wrangler.toml` for D1/Workers AI bindings. Deploying from the repo root would leave functions unbound and every `/api` call would 500.

Full deploy walkthrough: `docs/DEPLOY.md`

## Known patterns and pitfalls

- **`db/repository/` is a directory, not a file.** It used to be one ~1500-line `repository.ts` that every unit appended to, and three PRs broke `main` conflicting on its last line. Each section is now its own module, re-exported by `repository/index.ts`. **Adding a section means adding a file plus one `export *` line in alphabetical order** — never appending to an existing section. `repository/index.test.ts` fails if a section file is missing from the barrel. Sections import each other directly (`./petXp`), never through `./index`, which would make the graph cyclic. `id()` and `now()` live in `repository/shared.ts`.
- **`REKEY_TABLES` allowlist**: only `settings` should be in the exemption list — `quests` and `achievements` must be re-keyed on identity change.
- **Day keys use member timezone**, not UTC — use the member's zone for `noteDays`, `endOfDay`, and any "days" count.
- **Achievement dedup**: award IDs must be deterministic (e.g. `ach-<code>`, `quest-<id>`) so both devices don't double-credit the same event.
- **`loadSettings()` inside live queries**: never call it inside a `useLiveQuery` callback — it triggers a sync rewrite that re-fires the query up to 20× per foreground cycle.
- **Editing `app/src/styles.css` means running `npm run study:build` and committing `study/index.html`** — the study page inlines the whole stylesheet (`cssCodeSplit: false`), so any rule anywhere changes that committed artefact, and CI fails on `git diff --exit-code -- study/index.html`.
- **Holdings sync has two kind lists, not one.** `PARTNER_WRITABLE_KINDS` (`domain/sync/holdings.ts`) is who may overwrite a row — a security property, mirrored in the `excluded.kind IN (...)` clause of `UPSERT_SQL` and pinned by a test that parses that clause. `PARTNER_VISIBLE_KINDS` is whose rows a device will apply locally. Life events and cheers are visible without being writable. Adding a kind to the visible list is a display decision; adding one to the writable list is a security decision.
- **`Rarity` is `Tier`, and `'godly'` is gone.** The ladder is `common → rare →
  epic → legendary → mythic` and lives in `domain/rpg/tiers.ts`, not in
  `gear.ts`. Nothing stored carries a tier — gear and pets are catalogue lookups
  by id — so the rename orphaned nothing, and the **ids were deliberately left
  alone**: `horse-godly` is a legendary companion, and renaming it would lose
  somebody a pet they had hatched. `normalizeTier` covers a token that reached a
  device before the rename.
- **Everything ownable carries a stat.** Gear, furniture, dyes and companions
  all land on the tier ladder, and `loadout.test.ts` walks the real catalogues
  to say so — add a cushion with no number behind it and that test fails.
  Furniture and dyes take their rung from their existing **price**
  (`tierForPrice`) rather than a hand-assigned tier, so the shop and the fight
  cannot drift apart.
- **A source's passive lands on its first raid stat and nowhere else**, and
  passives stack with a 0.7 falloff and a 30% cap, **sorted before stacking**.
  Unsorted, the same seven items are worth different amounts on two phones and
  the two disagree about how hard a boss hit.
- **The Raid Gate opens on every mount, and that is the design**, not a bug —
  it is a ritual, and it opens with last time's companion already ringed so
  re-entering is one tap. It is rendered *instead of* `EveGardenPage`'s garden
  rather than over it, which is what keeps Phaser and the 3.5 MB WebAssembly
  runtime from booting for a screen somebody backs out of. Both effects are
  guarded on `companion`; keep them that way.
- **A skill kit is character, not palette.** `companionSkills.test.ts` fails if
  a rights holder's name appears anywhere in that file, the same guard
  `pets.test.ts` and `mascots/roster.test.ts` already carry. Kits belong to the
  five originals in `features/pet/mascots/`.
- **Two lists hold the skill VFX together**: `companionSkills.ts` names a `vfx`
  per skill, `scene/vfx.ts` maps it to one of five motions, and
  `scene/vfx.test.ts` fails in both directions — an unmapped skill and a mapped
  shape nobody casts.
- **Chest pity is per chest**, stored on `Avatar.chestPity` (optional, no
  migration). The rescale at a floor is `applyFloor` from `pets.ts`, not a
  second copy. `chests.test.ts` asserts each window is reached between one run
  in four and one in twenty — a window reached half the time is the real drop
  rate wearing a second name.
- **A paid chest must never hand back nothing.** Gear refines, a companion
  deepens its bond, a cosmetic is refunded at list price;
  `repository/chests.test.ts` drives sixty consecutive draws to prove it. The
  odds module stops short of ownership on purpose — that is the repository's
  question, and keeping it there is why the odds can be tested without a
  database.
- **Nothing in a Dexie transaction may `await` a non-Dexie promise.** A dynamic
  `import()` inside `openChestFor` ended the transaction halfway through paying
  for a chest; every module it needs is imported statically.
- **Garden plots are earned, not bought.** `milestones.ts` opens them by pet
  level; `plots.ts` turns that into ground. `normalizeGarden` drops a plant in
  ground the couple's level no longer reaches — real rather than theoretical,
  because the plot ladder is derived from pet XP and pet XP is reconciled
  against the server, so a device can briefly hold a garden ahead of the level
  it can prove. `plantFlora` derives the level **inside** the transaction for
  the same reason; never take it as an argument.
- **The garden does not use the birbhouse catalogue.** A rainy window and a
  round rug do not go outdoors. `FLORA` is the garden's own, and nothing in it
  is mythic — the top rung should be something you won, and `KIND_TIERS` in
  `chests.ts` reads the catalogue to work that out for itself.
- **There are two level numbers and they are different on purpose.** C# owns
  the combat rank that gates the action bar, pinned by `IslandTests`; the pet's
  level is the fifty-rung curve in `domain/xp.ts` that the couple climbs.
  Milestones hang off the second. `EveGardenPage`'s victory banner reads the
  pet's, because the first would announce a plot opening on the wrong level.
- **`ChestAlcove` has one implementation, rendered twice.** The Shop tab and
  `GardenDrawer` both use it. Do not fork it — two sets of published odds is
  two chances to publish a number that is not the number.
- **A new holding kind means four edits**, and only a test keeps them in step: `HOLDING_KINDS` (client), `KINDS` (`app/functions/api/holdings.ts`), the D1 `CHECK` (a new migration — SQLite cannot alter one in place, so rebuild the table as `0005_entry_kinds.sql` does), and a `storeFor` case. `worker/src/holdings.test.ts` asserts all four agree.

## Ponytail (sister repo)

`djbatalona06/ponytail` is an AI coding skill/plugin that enforces a minimal-code ladder ("does this need to exist? → reuse? → stdlib? → native? → installed dep? → one line?"). Install in Claude Code with:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

It reduces token usage and output size across sessions without dropping safety guards. See [github.com/djbatalona06/ponytail](https://github.com/djbatalona06/ponytail) for full docs.
