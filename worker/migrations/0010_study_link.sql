-- The link to Jenny's study app.
--
-- Her study PWA is a separate app on a separate origin with its own storage,
-- and it has no accounts at all — its only identity is an email compared
-- against a localStorage flag. So it cannot authenticate as a member, and it
-- must not be handed a member's bearer: that token reads and writes the
-- couple's whole record, and this integration needs to do exactly one thing.
--
-- It gets its own token instead, scoped to /api/study/session and nothing else.
-- Hashed like every other token here, revocable from the same Settings screen
-- as a paired device, and carrying the timezone the member was in when it was
-- minted — the server has no other way to know what "today" means to them, and
-- the daily XP ceiling has to agree with the person's idea of a day.
CREATE TABLE IF NOT EXISTS study_tokens (
  token_hash TEXT PRIMARY KEY,
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- An IANA zone name, e.g. America/Los_Angeles.
  time_zone  TEXT NOT NULL DEFAULT 'UTC',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_study_tokens_member ON study_tokens (member_id);

-- What the study app has already been credited for today.
--
-- The pet ledger (pet_xp_awards) deduplicates a replayed session, but it cannot
-- answer "how much has studying added today" without scanning it, and the daily
-- ceiling needs that on every request. One row per member per day.
CREATE TABLE IF NOT EXISTS study_days (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- YYYY-MM-DD in the member's own timezone, not UTC.
  day       TEXT NOT NULL,
  xp        INTEGER NOT NULL DEFAULT 0,
  sessions  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member_id, day)
);
