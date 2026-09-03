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
cd app && npx vitest run src/db/repository.test.ts

# Gift page
npm run gift:build   # rebuild gift/birthday.html
npm run gift:verify  # headless browser walk of every screen
```

## Architecture

This is a **PWA for two people** (couples tracker: mood, workouts, cycle, calendar, pet/RPG). It deploys across three independent targets:

| Directory | What it is | Deploy target |
|-----------|-----------|--------------|
| `app/` | Vite + React + TypeScript SPA/PWA | Cloudflare Pages (`heartbeat-eop`) |
| `worker/` | Cloudflare Worker (pairing, sync, push) | Cloudflare Worker (manual deploy) |
| `index.html` + `gift/` | Landing page + birthday piece | GitHub Pages |

Both Cloudflare pieces bind the **same D1 database**.

### Data flow

All writes go through `app/src/db/repository.ts`. Components call repository functions; Dexie live queries drive re-renders. Nothing in `features/` touches the database directly.

- **Local DB**: Dexie (IndexedDB), schema in `app/src/db/database.ts`
- **Remote sync**: Cloudflare Worker (`worker/src/`) reads/writes D1; the app POSTs to `/api/*` Pages Functions in `app/functions/`
- **Domain logic**: `app/src/domain/` — pure TypeScript, no React, no Dexie. Tests live beside each module (`*.test.ts`). Vitest is restricted to `*.test.ts` only; components are not unit-tested by design.

### Key domain modules

- `domain/xp.ts` — XP/level calculations for the shared pet
- `domain/quests/` — quest definitions, progress tracking, completion logic
- `domain/achievements/` — achievement state derived from synced data
- `domain/rpg/` — boss fights, party stats
- `db/repository.ts` — single source of truth for all DB operations (~1500 lines, seven banner sections)

### Deploy secrets (GitHub Actions)

The `deploy.yml` workflow (triggers on push to `main`) requires two repo secrets:

- `CLOUDFLARE_API_TOKEN` — must have **Cloudflare Pages: Edit** + **D1: Edit** + **Workers AI: Read**
- `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard sidebar

The deploy step runs from `app/` so wrangler reads `app/wrangler.toml` for D1/Workers AI bindings. Deploying from the repo root would leave functions unbound and every `/api` call would 500.

Full deploy walkthrough: `docs/DEPLOY.md`

## Known patterns and pitfalls

- **`repository.ts` append convention**: multiple units have been appended to the end of this file. Three merge conflicts have been caused by two PRs touching the same last line. Consider splitting into `repository/quests.ts`, `repository/achievements.ts`, etc. before adding more sections.
- **`REKEY_TABLES` allowlist**: only `settings` should be in the exemption list — `quests` and `achievements` must be re-keyed on identity change.
- **Day keys use member timezone**, not UTC — use the member's zone for `noteDays`, `endOfDay`, and any "days" count.
- **Achievement dedup**: award IDs must be deterministic (e.g. `ach-<code>`, `quest-<id>`) so both devices don't double-credit the same event.
- **`loadSettings()` inside live queries**: never call it inside a `useLiveQuery` callback — it triggers a sync rewrite that re-fires the query up to 20× per foreground cycle.

## Ponytail (sister repo)

`djbatalona06/ponytail` is an AI coding skill/plugin that enforces a minimal-code ladder ("does this need to exist? → reuse? → stdlib? → native? → installed dep? → one line?"). Install in Claude Code with:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

It reduces token usage and output size across sessions without dropping safety guards. See [github.com/djbatalona06/ponytail](https://github.com/djbatalona06/ponytail) for full docs.
