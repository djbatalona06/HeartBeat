-- A couple is the unit of sharing. Everything else hangs off it.
CREATE TABLE IF NOT EXISTS couples (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Two members per couple. `token` is the bearer this device authenticates with;
-- it is generated on pairing and never leaves the two devices.
CREATE TABLE IF NOT EXISTS members (
  id           TEXT PRIMARY KEY,
  couple_id    TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  tracks_cycle INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_couple ON members (couple_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_token ON members (token_hash);

-- Single-use invite. Short-lived on purpose: a pairing link that works forever
-- is a permanent key to the couple's data sitting in a chat thread.
CREATE TABLE IF NOT EXISTS invites (
  token       TEXT PRIMARY KEY,
  couple_id   TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invites_couple ON invites (couple_id);

-- The shared record. One row per (member, kind, day); the payload is opaque
-- JSON so a new field on the client needs no migration here.
CREATE TABLE IF NOT EXISTS entries (
  id         TEXT PRIMARY KEY,
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('mood', 'exercise', 'cycle', 'work')),
  day        TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- One row per member per kind per day; a re-log updates rather than stacking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_unique ON entries (member_id, kind, day);
-- The sync pull is "everything in my couple since T", so index that path.
CREATE INDEX IF NOT EXISTS idx_entries_pull ON entries (couple_id, updated_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_member ON push_subscriptions (member_id);

-- Reminders the phone has asked the server to deliver later.
CREATE TABLE IF NOT EXISTS scheduled_nudges (
  key          TEXT PRIMARY KEY,
  couple_id    TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id    TEXT NOT NULL,
  fire_at      INTEGER NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  path         TEXT NOT NULL,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_nudges_due ON scheduled_nudges (delivered_at, fire_at);

-- The shared pet, one row per couple.
CREATE TABLE IF NOT EXISTS pets (
  couple_id TEXT PRIMARY KEY REFERENCES couples(id) ON DELETE CASCADE,
  level     INTEGER NOT NULL DEFAULT 1,
  xp        INTEGER NOT NULL DEFAULT 0,
  mood      TEXT NOT NULL DEFAULT 'content',
  fed_at    INTEGER NOT NULL
);
