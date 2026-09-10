-- The RPG layer, on the couple's account rather than only on one phone.
--
-- `entries` already carries everything that is keyed by a day — mood, exercise,
-- cycle, work, photographs — and the shared pet's XP has its own table. What
-- had no server table at all was everything that is keyed by a *row*: gear
-- inventory, hatched companions, the coin-and-XP sheet, tasks, and the weekly
-- quest. Those lived and died with the device, so reinstalling the app, or
-- recovering onto a new phone with the GitHub link added in 0012, brought back
-- a couple's whole history and none of their possessions.
--
-- Deliberately one table rather than five. Every one of these is the same
-- shape — an opaque JSON row with an id and a last-write time — and five tables
-- would be five migrations, five endpoints and five upserts to keep identical.
-- The kinds are a CHECK constraint so a typo is still a write that fails rather
-- than a row nobody ever reads back.
CREATE TABLE IF NOT EXISTS holdings (
  -- The client's own primary key for the row, carried through unchanged so a
  -- pulled row can be matched to the local one it is a version of.
  id         TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('inventory', 'pet', 'avatar', 'quest', 'task')),
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  -- Who it belongs to. Four of the five kinds are written only ever by their
  -- own member's device, which is what makes last-write-wins provably safe for
  -- them: there is no second writer to conflict with. `quest` is the exception
  -- and is couple-shared by design — see the endpoint.
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  -- Composite, because the client's id is only unique within its own kind: an
  -- avatar is keyed by member id and a quest by a uuid, and nothing stops
  -- those colliding across kinds in principle.
  PRIMARY KEY (kind, id)
);

-- The pull is always "this couple, everything since a cursor", which is the
-- only read this table has.
CREATE INDEX IF NOT EXISTS idx_holdings_couple ON holdings (couple_id, updated_at);
