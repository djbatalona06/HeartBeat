-- Looking after the pet joins the holdings table: feeding it, and the three
-- small rituals (pet, play, rest).
--
-- SQLite cannot alter a CHECK in place, so the table is rebuilt exactly as
-- 0018_holdings_wager.sql rebuilt it. The nine kinds from 0018 are carried over:
-- this list replaces that one wholesale, so dropping any of them would silently
-- make every stored row of that kind unwritable.
--
-- Writability is deliberately NOT expressed here. A care act has exactly one
-- writer for life -- the member who did it -- so it is absent from the
-- `excluded.kind IN (...)` clause of UPSERT_SQL in app/functions/api/holdings.ts,
-- the same as a cheer. Both phones *see* it (PARTNER_VISIBLE_KINDS, client-side);
-- neither can rewrite the other's.
--
-- `seq` and its index came in with 0019_sync_seq.sql and must be carried through
-- any rebuild, or every pull after this one would page by nothing.

CREATE TABLE holdings_new (
  id         TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (
               kind IN (
                 'inventory', 'pet', 'avatar', 'quest', 'task',
                 'lifeEvent', 'cheer', 'world', 'wager', 'care'
               )
             ),
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  seq        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, id)
);

INSERT INTO holdings_new (id, kind, couple_id, member_id, payload, updated_at, seq)
  SELECT id, kind, couple_id, member_id, payload, updated_at, seq FROM holdings;

DROP TABLE holdings;
ALTER TABLE holdings_new RENAME TO holdings;

CREATE INDEX IF NOT EXISTS idx_holdings_couple ON holdings (couple_id, updated_at);
CREATE INDEX IF NOT EXISTS holdings_couple_seq ON holdings (couple_id, seq);
