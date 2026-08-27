-- The message thread. Unlike entries, which are one row per member per kind per
-- day, a message is an event: it happens once, at a time, and is never revised.
-- So there is no unique index to collide with and no upsert — only inserts.
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- The pull is "everything in my couple since T", ordered by when it was said.
CREATE INDEX IF NOT EXISTS idx_messages_pull ON messages (couple_id, created_at);
