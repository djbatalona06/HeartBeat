-- The weekly wager joins the holdings table.
--
-- SQLite cannot alter a CHECK in place, so the table is rebuilt exactly as
-- 0017_holdings_world.sql rebuilt it, which in turn followed
-- 0014_holdings_social.sql and 0005_entry_kinds.sql before that.
--
-- The eight kinds from 0017 are carried over: this list replaces that one
-- wholesale rather than adding to it, so dropping any of them would silently
-- make every stored row of that kind unwritable.
--
-- Writability is deliberately NOT expressed here. A wager is the couple's --
-- either of them may start one or change the target -- so either may write the
-- row, and that rule lives in one place: the `excluded.kind IN (...)` clause of
-- UPSERT_SQL in app/functions/api/holdings.ts, mirrored client-side by
-- PARTNER_WRITABLE_KINDS and pinned by worker/src/holdings.test.ts. Restating
-- it in a migration would be a second copy that cannot be kept in step.

CREATE TABLE holdings_new (
  id         TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (
               kind IN (
                 'inventory', 'pet', 'avatar', 'quest', 'task',
                 'lifeEvent', 'cheer', 'world', 'wager'
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
