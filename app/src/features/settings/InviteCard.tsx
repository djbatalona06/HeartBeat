import { useState } from 'react';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { formatCountdown, inviteShareText } from './pairing';

/**
 * The invite code, big enough to read aloud across a room, and one tap from the
 * share sheet for when the other person is not in the room.
 *
 * Single-use and short-lived on purpose: a pairing link that works forever is a
 * permanent key to the couple's data sitting in a chat thread.
 *
 * Share only appears where the browser has one (`navigator.share`), and Copy
 * stays either way — the share sheet can be dismissed, and a person who wanted
 * the clipboard should not have to find out that it cannot be reached.
 */
export function InviteCard({ code, msLeft }: { code: string; msLeft: number }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const share = () => {
    navigator
      .share({ title: 'HeartBeat', text: inviteShareText(code, window.location.origin) })
      // Dismissing the sheet rejects with AbortError. That is a choice, not a fault.
      .catch(() => {});
  };

  return (
    <div className="invite">
      <span className="invite-code">{code}</span>
      <div className="invite-actions">
        {canShare ? <SecondaryAction onClick={share}>Share</SecondaryAction> : null}
        <SecondaryAction
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </SecondaryAction>
      </div>
      <p className="invite-left">
        Good for <strong>{formatCountdown(msLeft)}</strong> more, and only once.
      </p>
    </div>
  );
}
