import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  providerClaim, providerLink, providerStart, providerUnlink,
  type AuthProvider, type ProviderLink,
} from '../../pwa/api';
import { savePairing } from '../../db/repository';
import {
  PROVIDER_NAMES, readRecoveryReturn, shouldClaim, type RecoveryReturn,
} from './recoveryReturn';

/**
 * Optional account recovery, through GitHub or Google.
 *
 * **The pairing code is still the only way into a couple.** Nothing here
 * creates a member, a couple or an invite, and signing in with an account
 * nobody has connected gets you told so and nothing else. What this answers is
 * the question pairing cannot: the phone is gone, and the six-character invite
 * that put it in the couple was single-use and consumed months ago. Before
 * this, recovery ran through the *other* partner — which meant it was
 * impossible for whoever was holding the only phone.
 *
 * So there are two directions and they are not symmetrical:
 *
 *   - **Connect**, from a phone that is already signed in. The bearer it sends
 *     is what proves which member is being connected, and is the only way a
 *     link is ever created.
 *   - **Get back in**, from a phone that is not. It sends nothing and asserts
 *     nothing; which member it turns out to be is the provider's answer.
 *
 * Two providers rather than one because GitHub is a developer's account, and
 * the two people this app is for are not both developers — a way back in that
 * only one of them can realistically use is half a way back in. They are
 * configured independently, and a member may connect both: two doors, two
 * keys, and neither table knows about the other.
 *
 * Renders nothing at all when the deploy has no OAuth app configured. That is
 * a configuration answer rather than a fault — the app is fully functional
 * without it — so it is not worth a line of explanation on everybody's
 * Settings screen forever.
 */

interface RecoveryBlockProps {
  /** The bearer, when this device has one. Absent means "not signed in here". */
  token?: string;
  paired: boolean;
}

const PROVIDERS: AuthProvider[] = ['github', 'google'];

export function RecoveryBlock({ token, paired }: RecoveryBlockProps) {
  const [params, setParams] = useSearchParams();
  const [links, setLinks] = useState<Partial<Record<AuthProvider, ProviderLink | null>>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RecoveryReturn | null>(null);

  const refresh = useCallback(async () => {
    const answered = await Promise.all(
      PROVIDERS.map(async (provider) => [provider, await providerLink(provider, token)] as const),
    );
    setLinks(Object.fromEntries(answered));
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  // The return leg. Read once, then stripped from the URL — a claim code is
  // single-use and a minute old, and leaving it in the address bar only means
  // it is in history and in whatever the browser syncs.
  useEffect(() => {
    const back = readRecoveryReturn(params);
    if (!back) return;

    setResult(back);
    setParams({}, { replace: true });

    if (!shouldClaim(back)) return;
    let live = true;
    void (async () => {
      try {
        // Exchanged against the provider that sent us here. Sending it to the
        // other one finds nothing: the claim is scoped by provider in SQL.
        const claimed = await providerClaim(back.provider, back.claim, token);
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
          provider: back.provider,
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

  const go = async (provider: AuthProvider, intent: 'link' | 'recover') => {
    setBusy(true);
    try {
      // A full navigation rather than a popup: iOS standalone has no window to
      // open, and a popup blocked after an await is the classic way this
      // breaks on exactly the platform the app is built for.
      window.location.assign(await providerStart(provider, intent, token));
    } catch (error) {
      setBusy(false);
      setResult({
        provider,
        outcome: 'failed',
        message: error instanceof Error ? error.message : 'Could not start that sign-in.',
        problem: true,
      });
    }
  };

  const disconnect = async (provider: AuthProvider) => {
    if (!token) return;
    setBusy(true);
    try {
      await providerUnlink(provider, token);
      await refresh();
      setResult({
        provider,
        outcome: 'cancelled',
        message: `${PROVIDER_NAMES[provider]} disconnected.`,
        problem: false,
      });
    } catch (error) {
      setResult({
        provider,
        outcome: 'failed',
        message: error instanceof Error ? error.message : 'Could not disconnect.',
        problem: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const available = PROVIDERS.filter((provider) => links[provider]?.configured);

  // Still asking, or this deploy has no OAuth app at all. Either way, nothing.
  if (available.length === 0) return null;

  return (
    <section className="set-block">
      <h2 className="section-title">A way back in</h2>
      <p className="section-sub">
        For if you lose this phone. It is not a login — the pairing code is
        still the only way into the two of you — it just proves you are you when
        the code is long gone.
      </p>

      {result ? (
        <p className="github-note" data-problem={result.problem ? 'true' : undefined} role="status">
          {result.message}
        </p>
      ) : null}

      {available.map((provider) => {
        const link = links[provider]!;
        const name = PROVIDER_NAMES[provider];
        return (
          <div className="recovery-provider" key={provider}>
            {link.linked ? (
              <>
                <p className="github-account">
                  {name} connected
                  {link.githubLogin ? <> as <strong>{link.githubLogin}</strong></> : null}.
                </p>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => disconnect(provider)}
                  disabled={busy}
                >
                  Disconnect {name}
                </button>
              </>
            ) : paired ? (
              <button
                type="button"
                className="primary"
                onClick={() => go(provider, 'link')}
                disabled={busy}
              >
                Connect {name}
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={() => go(provider, 'recover')}
                disabled={busy}
              >
                Get back in with {name}
              </button>
            )}
          </div>
        );
      })}

      {!paired ? (
        <p className="github-fineprint">
          Signing back in signs the old phone out. One device at a time is what
          makes the token worth anything.
        </p>
      ) : null}
    </section>
  );
}
