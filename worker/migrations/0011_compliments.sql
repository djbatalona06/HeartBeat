-- Generated compliments: what was sent, and how many were asked for.
--
-- `compliment_usage` is a counter, not a log of content. Generation costs money
-- to serve, so it is gated the way dictation is, and one row per member per day
-- answers "how many today" without scanning anything.
--
-- It gets its own table rather than borrowing auth_events, which was the first
-- shape and the wrong one: writing fake 'token_rejected' rows to count usage
-- would have made the audit trail lie about the thing it exists to record.
CREATE TABLE IF NOT EXISTS compliment_usage (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- YYYY-MM-DD in the member's own timezone, sent by the phone that knows it.
  day       TEXT NOT NULL,
  asked     INTEGER NOT NULL DEFAULT 0,
  sent      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member_id, day)
);

-- One compliment that was actually sent.
--
-- Kept so the recipient's Mood page can show it after the notification is
-- dismissed — a push that opens to nothing is worse than no push. The text is
-- whatever the sender chose or wrote, never what the model returned unedited,
-- because nothing is sent unread.
CREATE TABLE IF NOT EXISTS compliments (
  id         TEXT PRIMARY KEY,
  couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  -- Who wrote it and who it is for. Both, because the sender's own Mood page
  -- should show what they sent, not only what they were sent.
  from_id    TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  -- True when the sender took one of the model's lines as-is. Only ever used to
  -- know whether the feature is pulling its weight.
  generated  INTEGER NOT NULL DEFAULT 0,
  -- When it should land. Now, or a time the sender picked.
  deliver_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_compliments_to ON compliments (to_id, deliver_at);
CREATE INDEX IF NOT EXISTS idx_compliments_couple ON compliments (couple_id, created_at);
