-- A server-assigned order for both sync tables.
--
-- Both pulls used to page by `updated_at > cursor`, and `updated_at` is the
-- writing phone's own clock reading. A row is stamped when it is *made* and
-- arrives when that phone next syncs, which can be hours later. By then the
-- other phone's cursor has already moved past the stamp (its own fresh rows
-- came back in its pull), so the late row is never served to it — not late,
-- never. That is how a partner's pet pick, mascot, dye or avatar could vanish
-- from the other phone for good.
--
-- `seq` is assigned by the server at the moment a row is written — MAX+1 per
-- couple inside the upsert, which D1 serialises — so it orders rows by when the
-- *server* saw them. A pull pages by `seq > after` instead, and a late row gets
-- a seq above every cursor already handed out. `updated_at` keeps its one real
-- job, last-write-wins between two versions of the same row.
--
-- Existing rows are backfilled from rowid, which is monotonic within a table.
-- Clients that have never pulled by seq start at 0 and re-read everything
-- once; applying is idempotent (last-write-wins, and the world row unions), so
-- that one full pull is also what recovers rows the old cursor skipped.
--
-- A later migration that rebuilds either table (as 0005/0014/0017 did to widen
-- a CHECK) must carry `seq` and its index across, or every client re-pulls
-- from scratch and new rows land at seq 0.
ALTER TABLE holdings ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
UPDATE holdings SET seq = rowid;
CREATE INDEX IF NOT EXISTS holdings_couple_seq ON holdings (couple_id, seq);

ALTER TABLE entries ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
UPDATE entries SET seq = rowid;
CREATE INDEX IF NOT EXISTS entries_couple_seq ON entries (couple_id, seq);
