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

# Study page (rebuild LAST, after any change to styles.css or to app source — see pitfalls)
npm run study:build  # rebuild study/index.html

# Visual walk (needs app/dist, so build first)
npm run visual       # every route in two themes, axe on each, console errors
```

### `npm run build` needs the .NET SDK, and so does anything downstream of it

The game core is C# compiled to WebAssembly (`game/`, targeting `net10.0`), so
`APP_BASE=/ npm run build` needs `dotnet` plus the `wasm-tools` workload.
`npm run visual` needs the build's output, and `npm test` runs `game:test`
through `dotnet test`. Without the SDK all three fail, and the two build-shaped
CI gates — visual regression and Lighthouse — cannot be reproduced at all.

`.claude/hooks/session-start.sh` installs both on web sessions so this is not
something anybody has to remember. It is registered in `.claude/settings.json`
and takes effect for sessions started **after** it reaches `main`.

**A change to the build config or to `app/tools/` must be run before it is
pushed.** This is not general caution — a one-line change to `app/tools/visual.mjs`
broke `main` for six consecutive CI runs while every other local gate passed
green, because the harness could not be executed in a container that had no
SDK. The failure was only visible from CI, three commits later.

Two notes on the Ubuntu-packaged SDK the hook installs:

- It comes from `universe` rather than `dot.net/v1/dotnet-install.sh`, because
  the container's egress proxy denies `builds.dotnet.microsoft.com` by policy.
  CI is unaffected and still uses `actions/setup-dotnet@v6`.
- Installing it needs `apt-get update` first. The image's package index is
  older than the archive pool, so a straight install fetches URLs that have
  already moved and dies in 404s.

`npm run visual` writes ten frames into `app/tools/baselines/` and leaves them
**untracked**. Delete them; do not commit them. The pixel compare is byte-exact
and container fonts are not CI's fonts — real baselines come from a CI run's
`visual-frames` artifact. See §"Baselines are not committed yet" in
`docs/design-system.md`.

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
- `domain/rpg/companionSkills.ts` — one skill kit per mascot, keyed by theme id:
  the names of its four moves, plus two skills and a passive
- `domain/rpg/charges.ts` — what today's logging lights up in a fight
- `domain/rpg/islands.ts` — the seven islands and their bosses, a tested mirror
  of `game/.../Data/Island<N>.cs` for the screens that must not boot wasm
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
- **`study/index.html` goes stale on far more than CSS, and rebuilding it is the *last* thing you do.** The rule used to read "editing `app/src/styles.css` means running `npm run study:build`", which is true and incomplete: the artefact inlines the whole stylesheet (`cssCodeSplit: false`) *and* the whole standalone bundle — React, the theme engine, all five backdrops — so **any** change to code reachable from `app/src/standalone.tsx` changes it too. A one-line edit to `themes/useCanvasLoop.ts` moved twelve bytes of minified output and failed CI on `git diff --exit-code -- study/index.html`. Run `npm run study:build` after the final source edit of the change, not in the middle of it — a rebuild that happens before one more commit lands is a rebuild that did not happen.
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
  guarded on `companion`; keep them that way. **Every effect that reads
  `client.current` must also list `companion` in its deps**: the client only
  exists after the gate's pick, and a ref changing re-runs nothing, so an
  effect without it runs once behind the gate, finds no client, and never asks
  again. That left the garden on "Waking the garden…" for every fresh visit.
- **A skill kit is character, not palette.** `companionSkills.test.ts` fails if
  a rights holder's name appears anywhere in that file, the same guard
  `pets.test.ts` and `mascots/roster.test.ts` already carry. Kits belong to the
  five originals in `features/pet/mascots/`.
- **Two lists hold the skill VFX together**: `companionSkills.ts` names a `vfx`
  per skill, `scene/vfx.ts` maps it to one of five motions, and
  `scene/vfx.test.ts` fails in both directions — an unmapped skill and a mapped
  shape nobody casts.
- **A chest holds `PRIZES_PER_CHEST` items and the counter steps once per
  chest.** A chest counts as a miss only when all three items missed, so the
  published 6/9/12 windows are reached far more rarely than the one-item
  arithmetic they were chosen with — 1 in 56, 1 in 212, 1 in 3081. They were
  kept because they are published; `chests.test.ts` holds the figures, the
  argument, and a tripwire that fails if the item count, a chest's weights or a
  window moves. **The floor lifts one item, not all three** — applied to every
  item it is a jackpot wearing the word insurance.
- **Chest pity is per chest**, stored on `Avatar.chestPity` (optional, no
  migration). The rescale at a floor is `applyFloor` from `pets.ts`, not a
  second copy.
- **A paid chest must never hand back nothing, and that is now per item.** Gear
  refines, a companion deepens its bond, a cosmetic is refunded — and the
  **refund is capped at the item's share of the price**, because every furniture
  piece is `rare` at 120–180 coins while the wooden chest costs 90, which made
  owning the set a money printer. The owned sets are updated *inside* the grant
  loop, or one chest hands over the same new rug three times. The odds module
  stops short of ownership on purpose — that is the repository's question, and
  keeping it there is why the odds can be tested without a database.
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
- **The birbhouse furnishes itself, and only upwards.** There is no placing:
  `buyFurniture` calls `refurnishHouse` in the same transaction, which takes
  the **better of the stored piece and this member's best owned piece, per
  slot** — highest price, then catalogue order (`compareFurniture`). Upgrade-only
  is load-bearing, not caution: `Pet.house` is couple-level while `inventory`
  is per-member and not partner-visible, so recomputing the room from one
  inventory and storing it would have two phones taking turns deleting each
  other's furniture. Auto-placement decides *which* piece, never *where* —
  every drawing in `art/house/` uses absolute coordinates in one shared
  100×100 space.
- **The garden does not use the birbhouse catalogue.** A rainy window and a
  round rug do not go outdoors. `FLORA` is the garden's own, and nothing in it
  is mythic — the top rung should be something you won, and `KIND_TIERS` in
  `chests.ts` reads the catalogue to work that out for itself.
- **A move is not a log, and a log is not a move.** The move bar is the
  companion's physical / defensive / magic moves (plus Mend at 4 and Together
  at 10), named per kit in `companionSkills.ts` and priced in C#. Logging a
  workout, a study session or a mood lights a **charge** for the day
  (`domain/rpg/charges.ts` decides which, `Charges.cs` what each is worth); a
  charge on the monster's weakness makes every hit land at 1.5×. **The garden
  has no logging controls** — `ChargeMeter` beside the move pad only shows what
  other pages wrote. Rest, Gratitude and Nourish are the optional `rested` /
  `grateful` / `ateWell` flags on a `MoodEntry`, ticked on the mood check-in;
  they sync with the mood row, so a partner's flag lights both gardens. The
  garden pays each lit charge's XP once a day under `garden-<day>-<activity>`,
  deterministic so two phones never double-pay; never add the phone to that id. **Every fight must stay winnable with no charges and no gear**:
  `IslandTests` simulates every stage of all seven islands uncharged, and a
  charge may only ever help (`BattleTests.AChargeNeverCostsAnything`).
- **The raid sheet reaches the fight.** `holdingsLoadout` + `loadoutSheet` is
  the one assembly, used by the party page and by `EveGardenPage`, and its
  totals go to C# at `beginBattle`. `Loadout.cs` puts every stat through
  `cap × t / (t + 60)`; `gearLift` in `loadout.ts` restates that curve for the
  move bar's "+N% gear" and `loadout.test.ts` reads the C# constants. The caps
  are held by `IslandTests.GearHelpsButDoesNotSkipAnIsland`.
- **Seven islands, one level band each.** Island *k* is entered at combat rank
  `1 + 4(k−1)` and its boss beaten at `8 + 4(k−1)`; `Progression.MaxLevel` is
  34 and growth past 10 compounds at 7%. Monster heals fade to nothing by
  round 20 (`Battle.MonsterHealFadeRounds`) — without it an under-levelled
  healer made a fight that could never end. The gate and the world map read
  bosses from `domain/rpg/islands.ts`, which `islands.test.ts` parses the C#
  to hold in step; change a monster's name, HP or sprite key in C# and that
  test tells you to change the mirror. Sprites for islands 2–7 live in
  `domain/rpg/monsterSprites.ts` and are spread into `SPRITES`.
- **There are two level numbers and they are different on purpose.** C# owns
  the combat rank that gates the move bar, pinned by `IslandTests`; the pet's
  level is the fifty-rung curve in `domain/xp.ts` that the couple climbs.
  Milestones hang off the second. `EveGardenPage`'s victory banner reads the
  pet's, because the first would announce a plot opening on the wrong level.
- **`ChestAlcove`, `ChestArt` and `ChestReveal` each have one implementation,
  rendered twice.** The Shop tab and `GardenDrawer` both open chests. Do not
  fork any of them — two sets of published odds is two chances to publish a
  number that is not the number, two chest drawings is two chances for the
  cheap one to look like the dear one, and two reveals is two chances to
  describe a duplicate as nothing.
- **`--color-accent-live` is a lean, not a new colour.** The pet's mood moves
  the accent by mixing it toward another token *in the same palette* —
  `success` when happy, `base` when sleepy — so each of the five packs leans
  its own way and none is overruled. The mix lives in `styles.css` under
  `:root[data-mood=...]` rather than in `themeToCssVars`, because `applyTheme`
  writes tokens as inline styles and a TS-computed accent would go stale on
  every theme and mode change; the only JavaScript is `applyMood`, one
  attribute. The strengths are emitted as `--mood-warm`/`--mood-dim` from the
  constants `mood.test.ts` measures, and that test walks 5 packs × 2 palettes
  × 3 moods to prove the button label still clears AA. **A hue rotation here
  would erase the packs and escape every contrast proof** — see `docs/PULSE.md`
  §3 and §4, which is also the written answer on why there is no CSS-in-JS
  layer.
- **A `useLiveQuery` keeps its last answer while its deps change.** When `settings.coupleId` arrives, a query keyed on it still returns what it read *before* settings loaded until the new read lands. So "undefined means loading" is not enough whenever the old answer was a real value (such as `null` for "no pet"). Tag the result with the key it was read for, as `petRead.for` does in `DashboardPage`, and treat a mismatch as still loading. Without the tag, the level-up check waved the greeting pose through for a frame.
- **The mascots are 3D, standing on their SVGs.** `mascots/index.ts` wraps each
  drawing in `withDepth` (`Mascot3D.tsx`): the SVG paints first, and the canvas
  fades in over it once three.js has drawn a frame. The SVGs and `face.tsx` are
  therefore **not dead code** — they are the loading state, the offline state
  and the no-WebGL state. Everything 3D lives in `mascots/3d/`, one builder per
  mascot at the drawings' own viewBox coordinates (`P(sx, sy)`, `S(n)`).
  - **One WebGL context for every mascot on screen** (`3d/engine.ts`): pets are
    drawn into one hidden renderer and copied onto their own 2D canvases. It is
    released the moment the last mascot unmounts, which is what lets the Raid
    Gate hand over to Phaser without two contexts alive. Never give a mascot
    its own `WebGLRenderer`.
  - **Colours are read off each pet's canvas, not the root**, so a dye (custom
    properties on a wrapper) repaints that one pet. The shader does no colour
    management on purpose: the lit face of a part *is* the CSS colour.
  - **`mascot3d-*.js` is lazy and kept out of the precache**, like Phaser. Code
    under `mascots/3d/` must make **no value imports from outside `3d/`** other
    than `three`: Rollup pulls a manual chunk's plain dependencies into it, the
    entry chunk then imports them from there, and three.js gets modulepreloaded
    on every boot. That happened once with `../roster`; `lighthouse.mjs` now
    fails a build that preloads the chunk. Type imports are fine.
  - Idle motion is `3d/pose.ts`, pure and tested. Under calm (`data-calm`, which
    folds in reduced motion) the pose is independent of time and the loop draws
    once and stops.
- **Shop, Birb and Raid are one page; the Bag is another.** `shop/ShopPage.tsx`
  renders whichever `ShopSection`s its route asks for — `/shop` the chests and
  purchases, `/birb` companions, colours and the room, `/raid` the sheet and the
  boss. `/party` (all of them at once) is now a redirect. Gear is **worn only on
  the Bag** (`assets/AssetsPage.tsx`), on a 2×2 slot grid with the amulet beside
  it; finished to-dos, streaks and the achievement shelf live under Tasks.
- **The amulet slot is gated by pet level, not member level.** `slotOpen` /
  `AMULET_UNLOCK_LEVEL` in `gear.ts` is a slot gate, separate from the per-item
  `canEquip`. It is enforced on the Bag's grid only: `equipItem` does not check
  it and an amulet already on is never stripped.
- **A new holding kind means four edits**, and only a test keeps them in step: `HOLDING_KINDS` (client), `KINDS` (`app/functions/api/holdings.ts`), the D1 `CHECK` (a new migration — SQLite cannot alter one in place, so rebuild the table as `0005_entry_kinds.sql` does), and a `storeFor` case. `worker/src/holdings.test.ts` asserts all four agree.

## Ponytail (sister repo)

`djbatalona06/ponytail` is an AI coding skill/plugin that enforces a minimal-code ladder ("does this need to exist? → reuse? → stdlib? → native? → installed dep? → one line?"). Install in Claude Code with:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

It reduces token usage and output size across sessions without dropping safety guards. See [github.com/djbatalona06/ponytail](https://github.com/djbatalona06/ponytail) for full docs.
