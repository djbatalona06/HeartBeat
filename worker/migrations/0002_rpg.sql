-- The RPG layer syncs as ordinary entries: the payload is already opaque JSON
-- and the ON CONFLICT is already last-write-wins, so the only thing standing in
-- the way is the CHECK constraint on `kind`.
--
-- SQLite cannot alter a CHECK in place, so the table is rebuilt. Nothing
-- references `entries`, so the drop is safe; its two indexes go with it and are
-- recreated below unchanged.
CREATE TABLE entries_new (
  id         TEXT PRIMARY KEY,
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('mood', 'exercise', 'cycle', 'work', 'task', 'avatar')),
  day        TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO entries_new (id, couple_id, member_id, kind, day, payload, updated_at)
  SELECT id, couple_id, member_id, kind, day, payload, updated_at FROM entries;

DROP TABLE entries;
ALTER TABLE entries_new RENAME TO entries;

-- One row per member per kind per day; a re-log updates rather than stacking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_unique ON entries (member_id, kind, day);
-- The sync pull is "everything in my couple since T", so index that path.
CREATE INDEX IF NOT EXISTS idx_entries_pull ON entries (couple_id, updated_at);
