-- Workout proof syncs as an ordinary entry, which needs one more value in the
-- CHECK on `kind`. Everything else about the row is already right: the payload
-- is opaque JSON, and the ON CONFLICT is already last-write-wins.
--
-- SQLite cannot alter a CHECK in place, so the table is rebuilt exactly as
-- 0002_rpg.sql rebuilt it. Nothing references `entries`, so the drop is safe;
-- its two indexes go with it and are recreated below unchanged.
--
-- 'task' and 'avatar' are carried over from 0002 — this list replaces that one
-- wholesale rather than adding to it, so dropping either would silently make
-- every stored RPG row unwritable.
--
-- A day holds up to two proofs, one per camera, and they travel together as one
-- row: the unique index is (member_id, kind, day), so two rows of kind 'photo'
-- on the same day would collide. Grouping them into one payload is the same
-- shape 'work' already uses for a day's events, and it means the index needs no
-- change here.
CREATE TABLE entries_new (
  id         TEXT PRIMARY KEY,
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (
               kind IN ('mood', 'exercise', 'cycle', 'work', 'task', 'avatar', 'photo')
             ),
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
