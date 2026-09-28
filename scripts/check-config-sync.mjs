// app/wrangler.toml and worker/wrangler.toml each bind the same D1 database,
// and Cloudflare gives Pages configs and Workers configs no way to share a
// value — so database_id is pasted into both by hand. This catches drift
// between the two copies before a deploy ships against the wrong database.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const readDatabaseId = (path) => {
  const toml = readFileSync(path, 'utf8');
  const match = toml.match(/database_id\s*=\s*"([^"]+)"/);
  if (!match) throw new Error(`${path}: no database_id found`);
  return match[1];
};

const appId = readDatabaseId(join(ROOT, 'app/wrangler.toml'));
const workerId = readDatabaseId(join(ROOT, 'worker/wrangler.toml'));

if (appId !== workerId) {
  console.error(
    `::error::D1 database_id mismatch — app/wrangler.toml has "${appId}", ` +
      `worker/wrangler.toml has "${workerId}". Both must bind the same ` +
      `database; see docs/DEPLOY.md#1-create-the-d1-database-once.`
  );
  process.exit(1);
}

console.log(`app/wrangler.toml and worker/wrangler.toml agree on database_id (${appId})`);

// Preview deploys (.github/workflows/preview.yml) exist so two real phones can
// pair against a pull request without touching the couple's real data. A
// preview block pointed at the production database would do the opposite,
// silently — so it is the one mistake here that must fail loudly.
const appToml = readFileSync(join(ROOT, 'app/wrangler.toml'), 'utf8');
const previewAt = appToml.search(/^\[\[env\.preview\.d1_databases\]\]/m);
if (previewAt >= 0) {
  const previewId = appToml.slice(previewAt).match(/database_id\s*=\s*"([^"]+)"/)?.[1];
  if (!previewId || previewId === appId) {
    console.error(
      `::error::app/wrangler.toml's [env.preview] D1 must be its own database, ` +
        `not production's (${appId}). See "Preview deploys" in docs/DEPLOY.md.`
    );
    process.exit(1);
  }
  console.log(`preview deploys use their own database (${previewId})`);
}
