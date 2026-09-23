# Developing HeartBeat

If you're here from the birthday link, you want the [README](../README.md) instead.

## Installation (for developers)

Prerequisites:

- **Node.js 20+** (CI runs 22) — this repo is an npm workspace spanning
  `app/` and `worker/`
- **.NET SDK 10** — the shared pet home screen renders through a
  WebAssembly build in `game/`, and it runs as part of `npm run dev` and
  `npm run build`, not just CI
- The **`wasm-tools` workload** for that SDK: `dotnet workload install wasm-tools`

Clone and install:

```bash
git clone https://github.com/djbatalona06/heartbeat.git
cd heartbeat
npm install          # installs both workspaces (app/ + worker/)
```

Run it:

```bash
npm run dev          # http://localhost:5173 — builds the game Wasm debug bundle first
npm test             # app + worker tests, and the C# game tests
npm run typecheck    # both workspaces
```

That gets you a working dev server against local data only — nothing syncs
between phones until you also stand up the Worker and a D1 database, which
[`docs/DEPLOY.md`](DEPLOY.md) walks through end to end. `## Local
development` and `## Deploying` below cover what each piece is for.

Anyone is able to add issues or their own suggestions since this project was mainly a bday present for my gf.

## Local development

The domain layer (`app/src/domain/`) is pure — no React, no Dexie — and carries
its tests beside it. Vitest is restricted to `*.test.ts`, so components are not
unit-tested; that is deliberate, not an oversight.

Every write goes through `app/src/db/repository/`; components call those
functions and let the Dexie live query re-render. Nothing in `features/` touches
the database directly.

## The gift

Everything in the records scene is built from three.js primitives at runtime — the
box, the turntable, the cat. There are no model files. Machines without WebGL
get a flat version in DOM and CSS with the same two gestures, and it is walked
by the same tests.

```bash
npm run gift:build         # rebuild birthday.html from gift/src/
npm run gift:build:music   # local-only build with the song embedded
npm run gift:verify        # walk every screen in a real browser and screenshot it
```

The committed file is silent on purpose: the song is a commercial recording, and
publishing it here would be redistribution. `gift:build:music` produces
`birthday-with-music.html`, which is gitignored and meant to be sent directly.
See [NOTICE.md](../NOTICE.md).

## The study page

It is the same component the app mounts, handed a different store: Dexie inside
the PWA, localStorage in the file. Nothing is duplicated, which is the only
reason having it twice is affordable.

```bash
npm run study:build   # rebuild study/index.html from app/src/
```

## The website

`main` publishes the whole repository to GitHub Pages via
`.github/workflows/static.yml`. `index.html` at the root is the front door and
links to the gift; without it the Pages URL serves a 404, because the artifact is
uploaded raw and there is no Jekyll step to render the README.

```bash
npm run site:check   # serve the root as Pages does and check every link resolves
```

`robots.txt` asks crawlers to stay out of `gift/`. That is a request, not access
control: it discourages the photographs from surfacing in image search, but
anyone holding the URL can still open them.

## Layout

```
index.html  landing page                     ->  GitHub Pages
app/        Vite + React + TypeScript PWA    ->  Cloudflare Pages
worker/     Cloudflare Worker + D1           ->  pairing, sync, push
gift/       the birthday piece               ->  one self-contained HTML file
docs/       design spec + deploy guide
```

## Deploying

The app splits across three independent deploy targets — Cloudflare Pages
(`app/`, automated via `.github/workflows/deploy.yml` on push to `main`), a
Cloudflare Worker (`worker/`, automated via
`.github/workflows/worker-deploy.yml` when `worker/**` changes), and GitHub
Pages (this landing page and `gift/`, automated via
`.github/workflows/static.yml`). Both Cloudflare pieces bind the same D1
database.

[`docs/DEPLOY.md`](DEPLOY.md) is the full walkthrough: creating the D1
database, applying migrations, setting Worker secrets, the GitHub Actions
secrets Pages needs, and a troubleshooting section for the usual failure
modes.

CI (`.github/workflows/ci.yml`) is separate, runs on every pull request, and
involves no deploy credentials.

## Status

| Piece | State |
|---|---|
| Repo, build, CI, deploy | Done |
| Theme engine, 5 packs, contrast tests | Done |
| Data model, Dexie schema, D1 schema | Done |
| Pairing (invite link), entry sync | Done |
| Dashboard grid and pet XP bar | Done |
| Work screen | Done |
| Cycle screen, forecast and PIN lock | Done |
| Study: 226 cards, spaced repetition, quiz, standalone build | Done |
| Mood / Exercise screens | Next |
| Quests, achievements, push reminders | After that |

[`docs/DESIGN.md`](DESIGN.md) is the spec for what remains, and explains why
each piece is shaped the way it is.
