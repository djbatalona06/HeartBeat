import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveSettings } from '../../db/database';
import { installState, isIos } from '../../pwa/install';
import { providerLink } from '../../pwa/api';

const REPO_URL = 'https://github.com/djbatalona06/HeartBeat';

/**
 * The subpage a browser visitor meets before the rest of the app — never the
 * app itself. `FirstRunGate` sends anyone here whose `installState()` is not
 * `'installed'`, which is the same test the app already had lying unused: a
 * standalone check nothing imported. This is the screen that finally spends it.
 *
 * A soft gate, not a wall: "look around anyway" sets `guestAcknowledged` and
 * lets a visitor through regardless, remembered so it is asked once.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // Whether this deploy offers GitHub recovery at all. Asked without a token,
  // which the endpoint allows precisely so this screen — which nobody on it is
  // signed in to — can find out. Never throws; a null answer is "no".
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([providerLink('github'), providerLink('google')]).then((links) => {
      // Either provider being configured is enough to offer the way back in.
      if (live) setRecovery(links.some((link) => link?.configured));
    });
    return () => { live = false; };
  }, []);
  const state = installState();
  const inAppBrowser = state === 'unsupported-browser';

  async function lookAroundAnyway() {
    setBusy(true);
    try {
      await saveSettings({ guestAcknowledged: true });
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page welcome">
      <header className="page-head">
        <h1 className="page-title">HeartBeat</h1>
        <p className="page-sub">A gamified life tracker for two people.</p>
      </header>

      <section className="panel">
        <h2 className="section-title">What it does</h2>
        <ul className="welcome-list">
          <li>
            <strong>Mood.</strong> Hunger, joy and moody, one to ten, both of
            you side by side.
          </li>
          <li>
            <strong>Exercise.</strong> A workout log, and camera proof that
            you did it.
          </li>
          <li>
            <strong>Work.</strong> A shared calendar, filled from a file you
            export.
          </li>
          <li>
            <strong>The pet.</strong> Gains XP when either of you logs
            something. One pet, shared.
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2 className="section-title">Getting it on your phone</h2>
        {inAppBrowser ? (
          <p className="section-sub">
            This looks like the browser built into another app — Instagram or
            Messages, usually. Those cannot install anything. Open this page
            in Safari instead, then come back to these steps.
          </p>
        ) : null}
        <ol className="welcome-steps">
          <li>
            <strong>Open the app link in Safari.</strong> Not Chrome, and not
            the browser inside another app{isIos() ? '' : ' — iPhone only lets web apps install from Safari'}.
          </li>
          <li>
            <strong>Share → Add to Home Screen.</strong> Not cosmetic — iOS
            refuses to deliver notifications to a web app unless it was added
            to the Home Screen and opened from that icon.
          </li>
          <li>
            <strong>Open it from the icon, then allow notifications.</strong>
            {' '}The prompt only appears on a tap inside the installed app.
            Decline by accident and the only way back is to delete the icon
            and re-add it.
          </li>
          <li>
            <strong>Enter the pairing code.</strong> One of you starts a
            pairing and reads out a six-character code; the other types it
            in. No account, no password, no phone number.
          </li>
        </ol>
      </section>

      <section className="panel">
        <h2 className="section-title">FAQ</h2>
        <dl className="welcome-faq">
          <dt>Is my data private?</dt>
          <dd>
            Yes. It lives on your phone; the server keeps a copy only so the
            other phone can read it. No accounts, no analytics, nothing sold.
          </dd>
          <dt>Why does it need two phones?</dt>
          <dd>
            The pet, the calendar and the thread all belong to a couple, not
            a person. One phone can still look around — see below — but
            nothing is shared until a second one joins.
          </dd>
          <dt>Can I use it alone?</dt>
          <dd>
            You can look around without pairing. Most of what makes it worth
            using is the second column, though.
          </dd>
          <dt>What if I delete the app?</dt>
          <dd>
            The icon goes, and the notification permission goes with it. What
            you logged stays on the server for your partner to see. Getting it
            back onto a phone means pairing again — which needs your partner,
            unless you connected GitHub first, which is what that is for.
          </dd>
        </dl>
      </section>

      {/* Only when the deploy actually has an OAuth app. The pairing code is
          still the only way *into* a couple, so this is never an alternative
          to the steps above — it is the way back for somebody who has already
          done them once. */}
      {recovery ? (
        <section className="panel">
          <h2 className="section-title">Been here before?</h2>
          <p className="section-sub">
            If you were already part of a couple here and connected GitHub,
            you can sign back in with it rather than pairing again. It is not
            a login — it only proves you are you, so this phone can pick up
            where the old one left off.
          </p>
          <Link className="primary welcome-recover" to="/settings">
            Get back in &rarr;
          </Link>
        </section>
      ) : null}

      <a className="welcome-repo" href={REPO_URL} target="_blank" rel="noreferrer">
        <span aria-hidden="true">&#9679;</span> github.com/djbatalona06/HeartBeat
      </a>

      <button type="button" className="quiet welcome-guest" onClick={lookAroundAnyway} disabled={busy}>
        Look around anyway &rarr;
      </button>
    </div>
  );
}
