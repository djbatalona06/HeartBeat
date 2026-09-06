-- Crash reports from the app's error boundary.
--
-- Before this there was no boundary and no reporting: a component throw in
-- production was a white screen, and the only way to learn about it was for
-- someone to say the app broke. Kept in D1 rather than sent to a third party
-- for the same reason transcription runs on Workers AI — this is a couple's
-- private app, and a crash carries route names and component names from it.
--
-- Rows are swept after seven days by the Worker's every-minute cron. A crash
-- older than that is either fixed or has happened again since.
CREATE TABLE IF NOT EXISTS client_errors (
  id              TEXT PRIMARY KEY,
  couple_id       TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  member_id       TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- Which boundary caught it: 'app' for the whole shell, 'route' for one page.
  scope           TEXT NOT NULL,
  message         TEXT NOT NULL,
  stack           TEXT NOT NULL DEFAULT '',
  component_stack TEXT NOT NULL DEFAULT '',
  route           TEXT NOT NULL DEFAULT '',
  -- The client's clock, which can be wrong, and the server's, which cannot.
  at              INTEGER NOT NULL,
  received_at     INTEGER NOT NULL
);

-- The sweep reads by age; the only other read is "what has been failing lately"
-- for one couple. Both are covered here.
CREATE INDEX IF NOT EXISTS idx_client_errors_age ON client_errors (received_at);
CREATE INDEX IF NOT EXISTS idx_client_errors_couple ON client_errors (couple_id, received_at);
