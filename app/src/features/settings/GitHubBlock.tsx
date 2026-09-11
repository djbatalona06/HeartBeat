import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { githubClaim, githubLink, githubStart, githubUnlink, type GitHubLink } from '../../pwa/api';
import { savePairing } from '../../db/repository';
import { readGitHubReturn, shouldClaim, type GitHubReturn } from './githubReturn';

/**
 * Optional account recovery through GitHub.
 *
 * **The pairing code is still the only way into a couple.** Nothing here
 * creates a member, a couple or an invite, and signing in with a GitHub
 * account nobody has connected gets you told so and nothing else. What this
 * answers is the question pairing cannot: the phone is gone, and the
 * six-character invite that put it in the couple was single-use and consumed
 * months ago. Before this, recovery ran through the *other* partner — which
 * meant it was impossible for whoever was holding the only phone.
 *
 * So there are two directions and they are not symmetrical:
 *
 *   - **Connect**, from a phone that is already signed in. The bearer it sends
 *     is what proves which member is being connected, and is the only way a
 *     link is ever created.
 *   - **Get back in**, from a phone that is not. It sends nothing and asserts
 *     nothing; which member it turns out to be is GitHub's answer.
 *
 * Renders nothing at all when the deploy has no OAuth app configured. That is
 * a configuration answer rather than a fault — the app is fully functional
 * without it — so it is not worth a line of explanation on everybody's
 * Settings screen forever.
 */

interface GitHubBlockProps {
  /** The bearer, when this device has one. Absent means "not signed in here". */
  token?: string;
  paired: boolean;
}

export function GitHubBlock({ token, paired }: GitHubBlockProps) {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<GitHubLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GitHubReturn | null>(null);

  const refresh = useCallback(async () => {
    setState(await githubLink(token));
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  // The return leg. Read once, then stripped from the URL — a claim code is
  // single-use and a minute old, and leaving it in the address bar only means
  // it is in history and in whatever the browser syncs.
  useEffect(() => {
    const back = readGitHubReturn(params);
    if (!back) return;

    setResult(back);
    setParams({}, { replace: true });

    if (!shouldClaim(back)) return;
    let live = true;
    void (async () => {
      try {
        const claimed = await githubClaim(back.claim, token);
        if (claimed.outcome === 'recovered') {
          // Exactly what pairing writes, because from the app's side this *is*
          // a pairing: an identity and the bearer that proves it. The re-key in
          // `usePairing` notices the identity changed and moves the local rows.
          await savePairing({
            coupleId: claimed.coupleId,
            memberId: claimed.memberId,
            token: claimed.token,
          });
        }
        if (!live) return;
        await refresh();
      } catch (error) {
        if (!live) return;
        setResult({
          outcome: 'failed',
          message: error instanceof Error ? error.message : 'That sign-in did not work.',
          problem: true,
        });
      }
    })();
    return () => { live = false; };
    // Deliberately keyed on the params only. Re-running this because `token`
    // changed would try to exchange a code that has already been spent — and
    // `token` changes precisely *because* a recovery just succeeded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const go = async (intent: 'link' | 'recover') => {
    setBusy(true);
    try {
      // A full navigation rather than a popup: iOS standalone has no window to
      // open, and a popup blocked after an await is the classic way this
      // breaks on exactly the platform the app is built for.
      window.location.assign(await githubStart(intent, token));
    } catch (error) {
      setBusy(false);
      setResult({
        outcome: 'failed',
        message: error instanceof Error ? error.message : 'Could not start that sign-in.',
        problem: true,
      });
    }
  };

  const disconnect = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await githubUnlink(token);
      await refresh();
      setResult({ outcome: 'cancelled', message: 'GitHub disconnected.', problem: false });
    } catch (error) {
      setResult({
        outcome: 'failed',
        message: error instanceof Error ? error.message : 'Could not disconnect.',
        problem: true,
      });
    } finally {
      setBusy(false);
    }
  };

  // Still asking, or this deploy has no OAuth app. Either way, nothing yet.
  if (!state?.configured) return null;

  return (
    <section className="set-block">
      <h2 className="section-title">GitHub</h2>
      <p className="section-sub">
        A way back in if you lose this phone. It is not a login — the pairing
        code is still the only way into the two of you — it just proves you are
        you when the code is long gone.
      </p>

      {result ? (
        <p className="github-note" data-problem={result.problem ? 'true' : undefined} role="status">
          {result.message}
        </p>
      ) : null}

      {state.linked ? (
        <>
          <p className="github-account">
            Connected{state.githubLogin ? <> as <strong>{state.githubLogin}</strong></> : null}.
          </p>
          <button type="button" className="quiet" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        </>
      ) : paired ? (
        <button type="button" className="primary" onClick={() => go('link')} disabled={busy}>
          Connect GitHub
        </button>
      ) : (
        <>
          <p className="github-account">
            Already had an account here? Sign in with the GitHub you connected
            and this phone becomes that member again.
          </p>
          <button type="button" className="primary" onClick={() => go('recover')} disabled={busy}>
            Get back in with GitHub
          </button>
          <p className="github-fineprint">
            This signs the old phone out. One device at a time is what makes
            the token worth anything.
          </p>
        </>
      )}
    </section>
  );
}
