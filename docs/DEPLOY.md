# Deploying HeartBeat on Cloudflare

HeartBeat splits across **three independent deploy targets**, only one of which
is automated:

| Piece | Where it deploys | Automated? |
|---|---|---|
| `app/` (React PWA + Pages Functions) | Cloudflare **Pages** | ✅ `.github/workflows/deploy.yml`, on push to `main` |
| `worker/` (pairing, sync, push, cron) | Cloudflare **Workers** | ✅ `.github/workflows/worker-deploy.yml` on push to `main` touching `worker/**` |
| `index.html` + `gift/` (landing page) | **GitHub Pages**, not Cloudflare | ✅ `.github/workflows/static.yml` |

Both the Pages app and the Worker bind the **same D1 database**, so the
database is created once and shared. Below is the exact order that works from
a clean Cloudflare account.

## 0. Prerequisites

- A Cloudflare account, and `npx wrangler login` run locally (or an API
  token, for CI).
- Node ≥ 20 (`engines` in `package.json`; CI uses Node 22).
- `npm install` at the repo root — it's an npm workspace (`app` + `worker`).

## 1. Create the D1 database (once)

```bash
cd worker
npx wrangler d1 create heartbeat
```

This prints a `database_id`. Paste it into **both** files that bind it:

- `worker/wrangler.toml`
- `app/wrangler.toml`

(The repo currently ships a real id already — `dcfde6ff-f415-427a-bfc4-c08bd6911699`
— so if you're deploying *this* database as-is you can skip creating a new
one. Create a new one only if you want your own separate instance, e.g.
forking the project for a different couple.)

Apply the schema:

```bash
npm run db:remote     # from worker/ — applies worker/migrations/0001..0004 to the remote D1
```

`app/` has no migrations of its own — its Pages Functions bind the same `DB`,
so this one step covers both surfaces.

## 2. Deploy the Worker

The Worker owns pairing endpoints, sync, and the every-minute cron for the
boss fight/reminders (`worker/wrangler.toml`).

### Automatic (the normal path)

`.github/workflows/worker-deploy.yml` runs on every push to `main` that touches
`worker/**`. It typechecks, tests, verifies the API token can see the account,
**applies D1 migrations, and only then deploys** — new code must never meet an
old schema. It uses the same two repository secrets as the Pages workflow, but
the token needs **Workers Scripts: Edit** on top of what Pages required (step 3).

This used to be a manual `wrangler deploy` from one particular laptop, which
meant a push fix or a schema change depended on that machine and on whoever
remembered the sequence.

### The secrets, once

Push notifications need a VAPID keypair, and secrets are not in the repo, so
these are still set by hand — once, not per deploy:

```bash
cd worker
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

### By hand, if you need to

```bash
cd worker
npm run db:remote      # migrations first, always
npm run deploy         # wrangler deploy
```

Generate a VAPID keypair first if you don't have one (`npx web-push
generate-vapid-keys` or any P-256 keypair, base64url-encoded).

> **The project name and the domain are not the same.** The Pages project is
> **`heartbeat-app`**; it serves at **`heartbeat-eop.pages.dev`**. `PAGES_PROJECT`
> in `deploy.yml` must be the *project*, and `ALLOWED_ORIGIN` in
> `worker/wrangler.toml` must be the *domain*. Using one where the other belongs
> is what made the old deploy check disagree with the deploy itself.

`worker/wrangler.toml` hardcodes `ALLOWED_ORIGIN` to
`https://heartbeat-eop.pages.dev,https://*.heartbeat-eop.pages.dev`, matching
the live Pages project. **If your Pages project uses a different name or a
custom domain, edit this before deploying** — the Worker CORS-rejects any
other origin (`worker/src/cors.ts`).

## 3. Deploy the Pages app

### Option A — automatic (recommended)

`.github/workflows/deploy.yml` runs on every push to `main`. Set it up once:

1. Cloudflare dashboard → **My Profile → API Tokens** → create a token with:
   - **Cloudflare Pages: Edit**
   - **D1: Edit**
   - **Workers AI: Read**
   - **Workers Scripts: Edit** — for `worker-deploy.yml` (step 2)
   - **R2: Edit** — photographs live in an R2 bucket, not in D1

   (the Pages Functions in `app/functions/` bind D1 and Workers AI, per the
   comment at the top of `deploy.yml`; the fourth is what lets the Worker
   workflow publish.)
2. In the GitHub repo: **Settings → Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN` — the token above
   - `CLOUDFLARE_ACCOUNT_ID` — dashboard sidebar, or `npx wrangler whoami`
3. Push to `main`. The workflow: `npm ci` → `npm run build` (with
   `APP_BASE=/`) → verifies the token can see the account and creates the
   `heartbeat-app` Pages project if missing →
   `wrangler pages deploy` from inside `app/` (so it picks up
   `app/wrangler.toml`'s bindings).

### Option B — manual

```bash
npm run build          # from repo root, APP_BASE=/ if not already default
cd app
npx wrangler pages project create heartbeat-app --production-branch=main   # first time only
npx wrangler pages deploy --project-name=heartbeat-app --branch=main
```

Must be run from `app/` (not repo root) — `wrangler` reads
`app/wrangler.toml` for the `AI` and `DB` bindings; deploying from the root
would ship a static build whose `/api/*` functions 500 at runtime with no
bindings.

## 4. Verify

- `https://heartbeat-eop.pages.dev/api/health` →
  `{"ok":true,"db":true,"ai":true}`.
  If `db`/`ai` come back `false`, the binding in `app/wrangler.toml` didn't
  take — redeploy from `app/`.
- Open the app on a phone, pair two devices via the invite link, confirm a
  mood/task entry syncs.
- `npx wrangler tail` (in `worker/`) to watch the Worker live, e.g. while
  testing pairing or push.

## 5. Custom domain (optional)

If you attach a custom domain to the Pages project (Cloudflare dashboard →
Pages project → Custom domains), update `ALLOWED_ORIGIN` in
`worker/wrangler.toml` to include it, then redeploy the Worker (step 2) —
otherwise the browser gets CORS-blocked on every call to the Worker's
endpoints.

## What CI (`ci.yml`) does *not* do

`.github/workflows/ci.yml` runs typecheck/test/build on every PR but holds
**no Cloudflare credentials on purpose** (it runs on fork PRs too) — it never
deploys anything. Only `deploy.yml`, gated to `main`, has secrets.

## Don't confuse this with GitHub Pages

`static.yml` publishes the *entire repo* (root `index.html` + `gift/`) to
GitHub Pages — that's the birthday-gift landing page, unrelated to Cloudflare
and needs no Cloudflare credentials at all.

## Troubleshooting

**`Deploy` workflow fails at "Create the Pages project if it does not
exist" with `Authentication error [code: 10000]`.** The
`CLOUDFLARE_API_TOKEN` secret is missing, expired, or lacks one of the three
permissions in step 3. Create a fresh token with **Cloudflare Pages: Edit**,
**D1: Edit**, and **Workers AI: Read**, then update the
`CLOUDFLARE_API_TOKEN` repository secret and re-run the workflow (or push
again).

**`db`/`ai` are `false` at `/api/health`.** The build was deployed from the
repo root instead of `app/`, so `wrangler` never read `app/wrangler.toml`'s
bindings. Redeploy with `wrangler pages deploy` run from inside `app/`.

**Pairing or sync calls are CORS-blocked in the browser console.** The
calling origin isn't in the Worker's `ALLOWED_ORIGIN` (step 2/5). Add it and
redeploy the Worker — Pages redeploys don't touch the Worker.

---

**Summary of one-time setup, in order:** create D1 → apply migrations → set
Worker secrets (VAPID keys) → `wrangler deploy` the Worker → set the two
GitHub Actions secrets → push to `main` (Pages deploys itself from there on).


## 7. Photographs (R2)

Workout proof and profile faces used to be base64 inside D1 — `entries.payload`
and `members.photo_data_uri`. D1 has a row-size ceiling and is not a blob store,
so months of gym photographs walk towards it while slowing unrelated queries.

The bytes now live in an R2 bucket called **`heartbeat`**, bound as
`MEDIA` in both `app/wrangler.toml` and `worker/wrangler.toml`. D1 keeps a
content-addressed key (`media/<coupleId>/<memberId>/<sha256>.<ext>`).

`deploy.yml` creates the bucket if it is missing, so the only thing to do by
hand is add **R2: Edit** to the API token (step 3). To create it yourself
instead:

```bash
npx wrangler r2 bucket create heartbeat
```

**The bucket is never public.** `app/functions/api/media.ts` authenticates every
read and write and compares the couple segment of the key against the caller, so
one couple cannot read another's photograph even holding a valid token. Making
it public would be a wider hole than the pairing perimeter the app is built on.

### Carrying the existing photographs over

New captures go straight to R2. Anything already in D1 stays there until the
backfill is run — which is the part that actually relieves the row-size problem:

```bash
export CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=...
node worker/scripts/backfill-media.mjs            # dry run: reports what would move
node worker/scripts/backfill-media.mjs --commit   # do it
```

It is safe to run twice: keys are the SHA-256 of the bytes, so re-uploading
writes the same object to the same name, and a row that already has a key is
skipped. It deletes nothing — `photo_data_uri` and the base64 in old payloads
stay put so a phone that has not updated keeps working. A later migration drops
them once nothing reads them.

## 8. GitHub sign-in (optional)

**Entirely optional.** The app is fully functional without it, and the
six-character pairing code remains the *only* way into a couple whether this is
configured or not. If the two variables below are unset, `/api/health` reports
`github: false`, the Settings section renders nothing at all, and every route
under `/api/auth/github/` answers `503` in words. Nothing else changes.

### What it is for

Pairing has one failure it cannot answer: a phone is lost or replaced, and the
invite that put it in the couple was single-use and consumed months ago. The
only recovery was for the *other* partner to start a fresh pairing — which
meant recovery was impossible for whoever was holding the only phone.

So this is a second proof of *"I am this member"*, and deliberately not a
second way to become one:

- **Connecting** requires a device already authenticated as that member. Its
  bearer token is what says which member is being connected.
- **Recovering** returns exactly the member that was connected, and never
  creates one. Signing in with a GitHub account nobody has connected gets you
  told so and nothing else — no account, no empty couple, no offer to make one.
- Recovery **rotates the bearer**, because `members` holds one `token_hash` per
  member. The old phone is signed out. That is the point for a lost phone, and
  it is also the safety property: if somebody else reaches it, the person it
  belongs to finds out immediately.

### Create the OAuth app

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.
2. **Homepage URL**: `https://heartbeat-eop.pages.dev`
3. **Authorization callback URL**:
   `https://heartbeat-eop.pages.dev/api/auth/github/callback`
   This must match exactly. The app derives the same URL from the incoming
   request rather than from configuration, so there is nothing to keep in step
   — but GitHub compares it against what you type here.
4. Generate a client secret.

No scopes are requested. An empty scope still identifies the account, which is
the entire purpose; `read:user` would additionally read their profile and
anything with `repo` in it would read their code, and a couples' mood tracker
has no business holding either. The consent screen says so.

### Add the two secrets

These are **Pages project** secrets, not repository secrets and not additions
to `CLOUDFLARE_API_TOKEN`:

```bash
npx wrangler pages secret put GITHUB_CLIENT_ID   --project-name heartbeat-app
npx wrangler pages secret put GITHUB_CLIENT_SECRET --project-name heartbeat-app
```

Or in the dashboard: **Workers & Pages → heartbeat-app → Settings →
Environment variables → Add (encrypt)**. Add them to Production; add them to
Preview too if you want the feature on preview deployments, which have a
different hostname and therefore need their own callback URL registered.

Confirm with:

```bash
curl -s https://heartbeat-eop.pages.dev/api/health | jq .github   # expect true
```

### Migration

The tables (`github_links`, `oauth_states`, `oauth_claims`) come from
`worker/migrations/0012_github_link.sql`, which `worker-deploy.yml` applies
before deploying like every other migration. Nothing here needs a manual step.

### What recovery does and does not bring back

Recovery restores **identity** — the member, the couple and a fresh bearer —
and with it everything the server holds for that couple: mood, exercise, cycle
and work entries, workout photographs, the message thread, the shared pet's XP,
and boss fights.

It does **not** bring back the RPG layer. Gear inventory, companions, quests,
tasks and the coin wallet are local-only Dexie tables today with no server
table behind them, so they live and die with the device. That is a gap in the
sync rather than in recovery, and it is the same gap a reinstall has always
had.
