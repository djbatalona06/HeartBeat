-- Session revocation, and a record of who joined when.
--
-- Pairing was the whole security perimeter and it was a one-way door: a device
-- that redeemed an invite held a working bearer token forever, with no way to
-- turn it off short of editing the database by hand. A phone that is lost,
-- sold, or handed to someone else stayed paired.
--
-- `revoked_at` is checked by authenticate() on both surfaces, so a revoked
-- token stops working everywhere at once — the Worker and the Pages Functions
-- read the same members table, which is what made one flag enough.
--
-- The row is kept rather than deleted: entries, messages and tasks all
-- reference members(id), and removing the row would cascade away the person's
-- half of the couple's history. Revoking a device is not forgetting a person.
ALTER TABLE members ADD COLUMN revoked_at INTEGER;

-- Who joined, who was refused, and who was revoked.
--
-- There was no audit trail at all before this, so "was that third join actually
-- refused?" had no answer other than reasoning about the code. Kept
-- deliberately thin: a country from Cloudflare's own header and a hash of the
-- user agent, never an IP and never the raw string. This is a couple's private
-- app and the log should not become the most sensitive table in it.
CREATE TABLE IF NOT EXISTS auth_events (
  id         TEXT PRIMARY KEY,
  couple_id  TEXT,
  -- Not a foreign key: a refused join has no member row to point at, and that
  -- is exactly the event most worth keeping.
  member_id  TEXT,
  kind       TEXT NOT NULL CHECK (
               kind IN ('pair_start', 'pair_join', 'join_refused', 'revoke', 'token_rejected')
             ),
  -- Free text, short: the refusal reason, or which device was revoked.
  detail     TEXT NOT NULL DEFAULT '',
  country    TEXT NOT NULL DEFAULT '',
  ua_hash    TEXT NOT NULL DEFAULT '',
  at         INTEGER NOT NULL
);

-- Read one way: this couple's recent events, newest first, for the Settings
-- screen. The bare `at` index is for the cron sweep.
CREATE INDEX IF NOT EXISTS idx_auth_events_couple ON auth_events (couple_id, at);
CREATE INDEX IF NOT EXISTS idx_auth_events_age ON auth_events (at);
