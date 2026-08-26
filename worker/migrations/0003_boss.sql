-- The one piece of state that cannot live on the phone.
--
-- Boss HP is contested: two phones each subtracting damage under the entries
-- table's last-write-wins would silently discard one player's hits. Here damage
-- lands as `UPDATE ... SET hp = MAX(0, hp - ?)`, which is atomic in SQL, so
-- concurrent blows from both phones both count.
CREATE TABLE IF NOT EXISTS boss_fights (
  couple_id   TEXT PRIMARY KEY REFERENCES couples(id) ON DELETE CASCADE,
  -- Escalates on victory only. A defeat re-runs the same tier: losing means the
  -- fight is still there, not that it grew while you were down.
  tier        INTEGER NOT NULL DEFAULT 1,
  hp          INTEGER NOT NULL,
  max_hp      INTEGER NOT NULL,
  -- The member ids of whoever has said ready, in the order they said it. Ids
  -- rather than flags so the screen can name who is still being waited on.
  -- Both non-null is the only way a fight starts: one person cannot drag the
  -- other into a fight they would both wear.
  ready_a     TEXT,
  ready_b     TEXT,
  state       TEXT NOT NULL DEFAULT 'gathering'
                CHECK (state IN ('gathering', 'fighting', 'won', 'lost')),
  started_at  INTEGER,
  -- A fight nobody finishes is lost rather than left open forever, so the tier
  -- can be attempted again. Swept by the existing every-minute cron.
  deadline_at INTEGER,
  ended_at    INTEGER,
  updated_at  INTEGER NOT NULL
);

-- The sweep reads exactly this: fights still running whose window has passed.
CREATE INDEX IF NOT EXISTS idx_boss_deadline ON boss_fights (state, deadline_at);
