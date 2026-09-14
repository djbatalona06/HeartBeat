-- Eve's Garden's world progress crosses to the other phone.
--
-- `holdings` is generic — an opaque JSON payload with an id, an owner and a
-- last-write time — so nothing about this table changes except the list of
-- kinds it accepts. SQLite cannot alter a CHECK in place, so the table is
-- rebuilt exactly as 0014_holdings_social.sql rebuilt it, which in turn
-- followed 0005_entry_kinds.sql.
--
-- The seven kinds from 0014 are carried over: this list replaces that one
-- wholesale rather than adding to it, so dropping any of them would silently
-- make every stored row of that kind unwritable.
--
-- `world` is the second kind either partner may *write*, after `quest`. That
-- rule is not expressed here and must not be: it lives in one place, the
-- `excluded.kind IN ('quest', 'world')` clause of UPSERT_SQL in
-- app/functions/api/holdings.ts, pinned against the client's
-- PARTNER_WRITABLE_KINDS by a test that parses the clause rather than
-- restating it.
--
-- Why it is safe to grant: a world row is not really a blob under
-- last-write-wins. `clearStage` in app/src/domain/rpg/world.ts only ever
-- appends a monster id the row does not already hold, so two phones that both
-- clear a stage converge instead of clobbering, and the worst an offline phone
-- can cost is a re-clear of a stage it had already beaten — which the
-- repository treats as a no-op.
--
-- One row per couple, keyed by the couple id, so this adds no rows worth
-- speaking of to a table that is already small.
CREATE TABLE holdings_new (
  id         TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (
               kind IN (
                 'inventory', 'pet', 'avatar', 'quest', 'task',
                 'lifeEvent', 'cheer', 'world'
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
