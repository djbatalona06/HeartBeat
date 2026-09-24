import { useEffect, useState } from 'react';
import { health, type Health } from '../../pwa/api';

/**
 * "Is this actually turned on for us?", answered without a curl command.
 *
 * Four features self-disable cleanly when a deploy hasn't configured them:
 * Workers AI, push, GitHub recovery, Google recovery. `/api/health` already
 * reports all four as booleans — this is the one place that turns them into
 * sentences instead of leaving "why doesn't the invite notification work" to
 * whoever is willing to open dev tools.
 *
 * Renders nothing while still checking, and a plain admission rather than a
 * guess if the server never answers — four confident lines built on a health
 * check that itself failed would be worse than saying nothing.
 */
export function WhatsOnBlock() {
  const [status, setStatus] = useState<'checking' | 'down' | Health>('checking');

  useEffect(() => {
    let live = true;
    void health().then((h) => { if (live) setStatus(h ?? 'down'); });
    return () => { live = false; };
  }, []);

  if (status === 'checking') return null;

  return (
    <section className="set-block">
      <h2 className="section-title">What&rsquo;s on</h2>
      <p className="section-sub">
        A few features turn themselves off when a deploy hasn&rsquo;t configured
        them. Nothing here is something you can change — it just says what
        this one is currently running with.
      </p>
      {status === 'down' ? (
        <p className="section-sub">
          The server isn&rsquo;t answering right now, so this can&rsquo;t say what&rsquo;s on.
        </p>
      ) : (
        <ul className="whats-on-list">
          <li>{sentence('Ask your pet', status.ai, "this deploy hasn't turned on Workers AI")}</li>
          <li>{sentence('Push notifications', status.push === true, 'this deploy has no notification key set up')}</li>
          <li>{sentence('GitHub sign-in', status.github === true, "this deploy hasn't connected a GitHub app")}</li>
          <li>{sentence('Google sign-in', status.google === true, "this deploy hasn't connected a Google app")}</li>
        </ul>
      )}
    </section>
  );
}

function sentence(name: string, on: boolean, offReason: string): string {
  return on ? `${name}: on.` : `${name}: off — ${offReason}.`;
}
