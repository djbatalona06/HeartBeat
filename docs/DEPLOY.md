# Deploying HeartBeat on Cloudflare

This is the single source of truth for deployment. [README.md](../README.md)
only summarizes it — edit here, not there.

HeartBeat splits across **three independent deploy targets**, only one of
which is automated:

| Piece | Where it deploys | Automated? |
|---|---|---|
| `app/` (React PWA + Pages Functions) | Cloudflare **Pages** | ✅ [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), on push to `main` |
| `worker/` (pairing, sync, push, cron) | Cloudflare **Workers** | ❌ manual only — no workflow deploys it |
| `index.html` + `gift/` (landing page) | **GitHub Pages**, not Cloudflare | ✅ [`.github/workflows/static.yml`](../.github/workflows/static.yml) |

Both the Pages app and the Worker bind the **same D1 database**, so the
database is created once and shared. Below is the exact order that works from
a clean Cloudflare account.

## 0. Prerequisites

- A Cloudflare account, and `npx wrangler login` run locally (or an API
  token, for CI).
- Node ≥ 20 (`engines` in [`package.json`](../package.json); CI uses Node 22).
- `npm install` at the repo root — it's an npm workspace (`app` + `worker`).

## 1. Create the D1 database (once)

```bash
cd worker
npx wrangler d1 create heartbeat
```

This prints a `database_id`. Paste it into **both** files that bind it:

- [`worker/wrangler.toml`](../worker/wrangler.toml) — `[[d1_databases]] database_id`
- [`app/wrangler.toml`](../app/wrangler.toml) — `[[d1_databases]] database_id`

There is no way to share this value across a Pages config and a Workers
config, so it is pasted twice by hand. `npm run check:config` (also run in
CI) fails loudly if the two copies ever drift — run it after editing either
file.

(The repo currently ships a real id already — `dcfde6ff-f415-427a-bfc4-c08bd6911699`
— so if you're deploying *this* database as-is you can skip creating a new
one. Create a new one only if you want your own separate instance, e.g.
forking the project for a different couple.)

Apply the schema:

```bash
npm run db:remote     # from worker/ — applies worker/migrations/0001..0004 to the remote D1
```

`app/` has no migrations of its own — its Pages Functions bind the same
`DB`, so this one step covers both surfaces.

## 2. Deploy the Worker (manual — not in CI)

The Worker owns pairing endpoints, sync, and the every-minute cron for the
boss fight/reminders ([`worker/wrangler.toml`](../worker/wrangler.toml)
`[triggers]`). Nothing deploys it automatically, so do this by hand whenever
`worker/` changes:

```bash
cd worker
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npm run deploy         # wrangler deploy
```

Generate a VAPID keypair first if you don't have one
(`npx web-push generate-vapid-keys` or any P-256 keypair, base64url-encoded).

`worker/wrangler.toml`'s `[vars] ALLOWED_ORIGIN` hardcodes
`https://heartbeat.pages.dev,https://*.heartbeat.pages.dev`. **If your Pages
project uses a different name or a custom domain, edit this before
deploying** — the Worker CORS-rejects any other origin
([`worker/src/cors.ts`](../worker/src/cors.ts)).

## 3. Deploy the Pages app

### Option A — automatic (recommended)

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs on
every push to `main`. Set it up once:

1. Cloudflare dashboard → **My Profile → API Tokens** → create a token with:
   - **Cloudflare Pages: Edit**
   - **D1: Edit**
   - **Workers AI: Read**

   (all three — the Pages Functions in `app/functions/` bind D1 and Workers
   AI.)
2. In the GitHub repo: **Settings → Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN` — the token above
   - `CLOUDFLARE_ACCOUNT_ID` — dashboard sidebar, or `npx wrangler whoami`
3. Push to `main`. The workflow: `npm ci` → `npm run build` (with
   `APP_BASE=/`) → creates the `heartbeat` Pages project if missing →
   `wrangler pages deploy` from inside `app/` (so it picks up
   `app/wrangler.toml`'s bindings).

### Option B — manual

```bash
npm run build          # from repo root, APP_BASE=/ if not already default
cd app
npx wrangler pages project create heartbeat --production-branch=main   # first time only
npx wrangler pages deploy --project-name=heartbeat --branch=main
```

Must be run from `app/` (not repo root) — `wrangler` reads
`app/wrangler.toml` for the `AI` and `DB` bindings; deploying from the root
would ship a static build whose `/api/*` functions 500 at runtime with no
bindings.

## 4. Verify

- `https://<your-pages-domain>/api/health` → `{"ok":true,"db":true,"ai":true}`.
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

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs
typecheck/config-sync/test/build on every PR but holds **no Cloudflare
credentials on purpose** (it runs on fork PRs too) — it never deploys
anything. Only `deploy.yml`, gated to `main`, has secrets.

## Don't confuse this with GitHub Pages

`static.yml` publishes the *entire repo* (root `index.html` + `gift/`) to
GitHub Pages — that's the birthday-gift landing page, unrelated to Cloudflare
and needs no Cloudflare credentials at all.

---

**Summary of one-time setup, in order:** create D1 → apply migrations → set
Worker secrets (VAPID keys) → `wrangler deploy` the Worker → set the two
GitHub Actions secrets → push to `main` (Pages deploys itself from there on).
