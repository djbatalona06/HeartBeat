-- Life events and cheers cross to the other phone.
--
-- `holdings` was already generic — an opaque JSON payload with an id, an owner
-- and a last-write time — so nothing about this table needs to change except
-- the list of kinds it will accept. SQLite cannot alter a CHECK in place, so
-- the table is rebuilt exactly as 0005_entry_kinds.sql rebuilt `entries`.
-- Nothing references `holdings`, so the drop is safe; its one index goes with
-- it and is recreated below unchanged.
--
-- The five kinds from 0013 are carried over: this list replaces that one
-- wholesale rather than adding to it, so dropping any of them would silently
-- make every stored RPG row unwritable.
--
-- These two are the first kinds that are *visible* to both phones without
-- being *writable* by both. That distinction is not expressed here and must
-- not be: the write rule lives in one place, the `excluded.kind IN ('quest')`
-- clause of UPSERT_SQL in app/functions/api/holdings.ts, and it stays exactly
-- as it is. A life event and a cheer each have one writer for life — the
-- person who made it — which is what keeps last-write-wins safe for them.
CREATE TABLE holdings_new (
  id         TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (
               kind IN (
                 'inventory', 'pet', 'avatar', 'quest', 'task',
                 'lifeEvent', 'cheer'
               )
             ),
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);

INSERT INTO holdings_new (id, kind, couple_id, member_id, payload, updated_at)
  SELECT id, kind, couple_id, member_id, payload, updated_at FROM holdings;

DROP TABLE holdings;
ALTER TABLE holdings_new RENAME TO holdings;

-- The pull is always "this couple, everything since a cursor", which is still
-- the only read this table has.
CREATE INDEX IF NOT EXISTS idx_holdings_couple ON holdings (couple_id, updated_at);
