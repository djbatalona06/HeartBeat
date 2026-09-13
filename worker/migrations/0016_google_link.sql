-- Google as a second way to prove "I am this member".
--
-- Everything migration 0012 says about GitHub holds here word for word: this is
-- not a way *into* a couple. The six-character pairing code is still the only
-- thing that makes two phones a couple, a link can only be created by a device
-- already authenticated as the member being linked, and recovering returns
-- exactly the member that was linked and never creates one.
--
-- Why a second provider at all: GitHub is a developer's account, and the two
-- people this app is for are not both developers. A recovery mechanism only one
-- of them can realistically use is half a recovery mechanism.

-- One Google account, one member.
--
-- `google_user_id` is the OpenID Connect `sub` — Google's stable, per-client
-- subject identifier. Deliberately not the email address, for the same reason
-- 0012 stores GitHub's numeric id rather than the login: an email can be
-- changed, and a freed address can later be claimed by somebody else, which
-- would hand that person the account. The `sub` never moves.
--
-- There is no column for the address, or the name, or the picture. The scope
-- asked for is `openid` alone, so none of them is ever fetched: this table can
-- recover a couple's data and cannot say who they are. The README's claim that
-- the app holds no email addresses stays true with this feature turned on.
CREATE TABLE IF NOT EXISTS google_links (
  google_user_id TEXT PRIMARY KEY,
  member_id      TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- One link per member, in the other direction too — 0012's reasoning exactly:
-- without this a member could accumulate several Google accounts that each
-- recover it, and every one of them would be a key to a door Settings only
-- shows one of.
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_links_member ON google_links (member_id);

-- Which provider an in-flight round trip belongs to.
--
-- `oauth_states` and `oauth_claims` are reused rather than duplicated — the
-- shape of a single-use, expiring, consumed-by-the-read row is not
-- provider-specific and neither is a word of the reasoning in 0012 about why
-- there is no token column. What *is* provider-specific is which provider was
-- actually consulted, and without this column a state minted by one provider's
-- `start` could be consumed by the other's `callback`.
--
-- That crossing is not obviously exploitable — the intent and the member
-- binding carry the security, and the identity still comes from whichever
-- provider was actually asked — but "not obviously exploitable" is a thin thing
-- to rest an auth boundary on when the fix is one column and one WHERE clause.
--
-- Defaulted to 'github' so every row written before this migration keeps
-- meaning what it meant, and no CHECK constraint: adding a third provider
-- should not need a table rebuild, and the value is written by this codebase
-- rather than by a caller.
ALTER TABLE oauth_states ADD COLUMN provider TEXT NOT NULL DEFAULT 'github';
ALTER TABLE oauth_claims ADD COLUMN provider TEXT NOT NULL DEFAULT 'github';
