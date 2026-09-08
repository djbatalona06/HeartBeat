import { useCallback, useEffect, useState } from 'react';
import { createStudyLink, listStudyLinks, revokeStudyLink, type StudyLink } from '../../pwa/api';

/**
 * Connecting Jenny's study app to the pet.
 *
 * She finishes a deck there, the pet gains XP here. That is the whole of it,
 * and this screen is the whole of the setup: mint a code, paste it into the
 * study app once, done.
 *
 * The code is shown **once**. Nothing on this phone keeps a copy, because
 * keeping one would mean storing a second credential in order to re-display it,
 * and a link that is lost is a link that can be replaced in one tap. Minting a
 * new code retires the old one, so a code pasted into a study app on a phone
 * that is gone stops working the moment a new one is made.
 */

interface StudyLinkBlockProps {
  /** The member bearer. Absent while unpaired, when there is no pet to feed. */
  token: string | undefined;
}

export function StudyLinkBlock({ token }: StudyLinkBlockProps) {
  const [links, setLinks] = useState<StudyLink[] | null>(null);
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setLinks(await listStudyLinks(token));
    } catch {
      // A deploy that predates the endpoint, or no signal. An empty list reads
      // the same as "not connected yet", which is the useful thing to show.
      setLinks([]);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function mint() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createStudyLink(token);
      setMinted(created.token);
      setCopied(false);
      await refresh();
    } catch {
      setError('That did not go through. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await revokeStudyLink(token);
      setMinted(null);
      await refresh();
    } catch {
      setError('That did not go through. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!minted) return;
    // Unavailable on an insecure origin and rejected without a gesture. Either
    // way the code is on screen to be read, so a failure is not a dead end.
    navigator.clipboard?.writeText(minted).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  if (!token) return null;

  const connected = (links?.length ?? 0) > 0;

  return (
    <section className="study">
      <h2 className="study-title">Study app</h2>
      <p className="study-note">
        Finish a deck or a quiz in the study app and the pet gains XP here.
      </p>

      {minted ? (
        <div className="study-code">
          <p className="study-note">
            Paste this into the study app’s settings. It is shown once — make a
            new one any time if it gets lost.
          </p>
          <code className="study-code-value">{minted}</code>
          <button type="button" className="study-button" onClick={copy}>
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
      ) : null}

      {connected && !minted ? (
        <p className="study-note">
          Connected{links?.[0]?.lastUsedAt
            ? `, last session ${new Date(links[0].lastUsedAt).toLocaleDateString()}`
            : ' — no sessions yet'}
          .
        </p>
      ) : null}

      <div className="study-actions">
        <button type="button" className="study-button" onClick={mint} disabled={busy}>
          {connected ? 'Make a new code' : 'Connect the study app'}
        </button>
        {connected ? (
          <button type="button" className="study-button study-button-quiet" onClick={revoke} disabled={busy}>
            Disconnect
          </button>
        ) : null}
      </div>

      {error ? <p className="study-note study-note-bad">{error}</p> : null}
    </section>
  );
}
