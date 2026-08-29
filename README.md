# HeartBeat

A gamified life tracker for two people. Moods, workouts, cycles and calendars in
one place, on both phones, with nudges that arrive whether the app is open or not.

If you got here from a birthday present: hello. Start below.

---

## Getting it on your phone

It installs like an app but arrives through Safari. Four steps.

**1 · Open the app link in Safari.** Not Chrome, and not the browser inside
Instagram or Messages — actual Safari. iPhone only allows web apps to install
from there.

**2 · Tap Share, then Add to Home Screen.** This step is not cosmetic. iOS
refuses to deliver notifications to a web app unless it has been added to the
Home Screen and opened from that icon.

**3 · Open it from the icon and allow notifications.** iOS only shows the
permission prompt on a tap inside the installed app. If you decline by accident,
the only way back is to delete the icon and add it again — so say yes.

**4 · Tap the invite link.** One tap and the two phones are paired. No account,
no password, no phone number.

Android is simpler: Chrome will offer to install it, and notifications work
without the Home Screen step.

## What's on it

The home screen is a grid of four, plus your pet.

| Tile | What it holds |
|---|---|
| **Settings** | Pairing, the theme picker, your partner's name and photo, calendar |
| **Exercise** | A workout log, and camera proof — front and back — that you did it |
| **Mood** | Three sliders, 1–10: hunger, joy, moody. Both of you, side by side |
| **Work** | A shared calendar, filled from a file you export from your own |

The **pet** is the point. It gains XP when either of you logs something, and
levels up on quests that get set from a few questions during setup. Rep ranges,
streaks, achievements worth a big bonus. Neglect it and it sulks.

## Themes

Five, switchable any time under Settings: Hello Kitty, SpongeBob, Naruto, The
Last Airbender, My Little Pony. Each is a palette plus a hand-drawn animated
backdrop. Every artwork is original — see [NOTICE.md](NOTICE.md).

Backdrops pause when the app is in the background, respect your phone's
reduced-motion setting, and damp under **Calm mode**. Palette contrast is
enforced by tests, so a theme cannot ship with text you can't read.

## Privacy

Your phone holds the record. The server holds a copy so the other phone can read
it, and that is the whole reason it exists — a shared tracker that shares nothing
is just two separate apps.

Concretely: mood, exercise, cycle and calendar entries are stored on the server,
readable only by the two devices paired to your couple. Photos and camera proof
stay on your own phone and are never uploaded. There are no accounts, no email
addresses, no analytics, and no third parties.

Invite links expire after fifteen minutes and work exactly once. A couple is two
people; a third join is refused.

---

## The gift

[`gift/`](gift) holds the birthday piece this repo grew out of.
`gift/birthday.html` is one self-contained file — every photograph, both
typefaces and three.js are inside it. Download it, double-click it, and it works
with no internet, forever.

Six screens: a gate, a title, an envelope, a letter that types itself, the
records, and the guide to installing the app. The records are the middle of it —
every photograph pressed as vinyl, standing in a file box you flip
through — dragged sideways with a mouse, swiped up and down with a thumb. On a
desktop you tap one; on a phone you hold it and carry it across. Either way it
lands on a pink turntable, the arm swings over, and it turns at a real 33⅓ rpm. Tap it again to see the photograph full
screen. Play them all, or press *make the heart*, and the records rise out of
the box and re-form the heart the original piece was built around.

Everything in that scene is built from three.js primitives at runtime — the
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
See [NOTICE.md](NOTICE.md).

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
docs/       design spec
```

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 60 app tests + 7 worker tests
npm run typecheck
```

The domain layer (`app/src/domain/`) is pure — no React, no Dexie — and carries
its tests beside it. Vitest is restricted to `*.test.ts`, so components are not
unit-tested; that is deliberate, not an oversight.

Every write goes through `app/src/db/repository.ts`; components call those
functions and let the Dexie live query re-render. Nothing in `features/` touches
the database directly.

## Deploying the app

Cloudflare Pages, via `.github/workflows/deploy.yml`, on pushes to `main`.

Create an API token at **Cloudflare → My Profile → API Tokens** with the
**Cloudflare Pages: Edit** permission, then add two repository secrets under
**Settings → Secrets and variables → Actions**:

| Secret | Where to find it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token you just created |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard sidebar, or `npx wrangler whoami` |

CI (`.github/workflows/ci.yml`) is separate, runs on every pull request, and
involves no deploy credentials.

## Deploying the Worker

Needed for pairing and notifications.

```bash
cd worker
npx wrangler d1 create heartbeat      # paste the id into wrangler.toml
npm run db:remote                     # apply migrations

npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY

npm run deploy
```

If you host the app anywhere other than `heartbeat.pages.dev`, update
`ALLOWED_ORIGIN` in `worker/wrangler.toml` or the browser will block every
request. It takes a comma-separated list and accepts a single-label wildcard
such as `https://*.heartbeat.pages.dev` for preview deploys.

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
| Mood / Exercise screens | Next |
| Quests, achievements, push reminders | After that |

[`docs/DESIGN.md`](docs/DESIGN.md) is the spec for what remains, and explains why
each piece is shaped the way it is.

## Licence

MIT. See [NOTICE.md](NOTICE.md) for the artwork and trademark position.
