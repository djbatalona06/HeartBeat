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
