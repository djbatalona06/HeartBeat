-- Optional account recovery through GitHub.
--
-- The pairing code is still the only way *into* a couple, and this changes
-- nothing about that. What it answers is the other question, which the app had
-- no answer to at all: a phone is lost or replaced, and the six-character
-- invite that put it in the couple was single-use and consumed months ago. The
-- only recovery was for the *other* partner to start a fresh pairing, which
-- meant recovery was impossible for whoever was holding the only phone.
--
-- So this is a second proof of "I am this member", deliberately not a second
-- way to become one. A link can only be created by a device that is already
-- authenticated as that member, and recovering only ever returns the member it
-- was linked to.

-- One GitHub account, one member.
--
-- `github_user_id` is GitHub's numeric id, not the login: a login can be
-- changed, and can later be claimed by somebody else entirely, which would
-- hand that person the account. The id never moves.
CREATE TABLE IF NOT EXISTS github_links (
  github_user_id TEXT PRIMARY KEY,
  member_id      TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- Shown in Settings so "connected" names an account rather than being a
  -- checkbox. Refreshed on every sign-in, because a login can change.
  github_login   TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- One link per member, in the other direction too. Without this a member could
-- accumulate several GitHub accounts that each recover it, and every one of
-- them would be a key to the same door that Settings only shows one of.
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_links_member ON github_links (member_id);

-- In-flight OAuth round trips.
--
-- The `state` parameter has to be unguessable and single-use or the callback
-- will accept a redirect somebody else started, which is exactly the CSRF the
-- parameter exists to stop. Kept server-side rather than signed into a cookie
-- so that consuming one is a delete, and a replayed callback finds nothing.
CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  -- 'link' from an already-paired device, 'recover' from a new one. A recover
  -- state carries no member: which member it turns out to be is GitHub's
  -- answer, not the caller's claim.
  intent     TEXT NOT NULL CHECK (intent IN ('link', 'recover')),
  member_id  TEXT REFERENCES members(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- What the callback leaves behind for the app to collect.
--
-- The callback cannot hand the app a bearer token directly: it is a redirect,
-- so the only channel is the URL, and a token in a URL is in history, in any
-- referrer, and in whatever the browser syncs. Instead the callback stores
-- *who this turned out to be* under a one-time claim code, redirects with only
-- that code, and the app POSTs it straight back to exchange it.
--
-- No token column, deliberately. The obvious shape for this table is "callback
-- rotates the bearer, parks it here, claim hands it over", and that shape
-- leaves a live plaintext bearer sitting at rest in the database for as long
-- as the claim window. Rotating in the *claim* instead means the new token is
-- minted, hashed into members, and returned in one response, and never exists
-- anywhere at rest. This table only ever holds an identity, which the row's
-- own foreign keys already state.
CREATE TABLE IF NOT EXISTS oauth_claims (
  code         TEXT PRIMARY KEY,
  -- 'linked' says the connect succeeded and there is nothing to collect but
  -- the news. 'recovered' says the claim should rotate and return credentials.
  outcome      TEXT NOT NULL CHECK (outcome IN ('linked', 'recovered')),
  member_id    TEXT REFERENCES members(id) ON DELETE CASCADE,
  couple_id    TEXT REFERENCES couples(id) ON DELETE CASCADE,
  github_login TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states (expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_claims_expiry ON oauth_claims (expires_at);
