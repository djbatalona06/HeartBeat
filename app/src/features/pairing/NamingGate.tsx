import { useState, type ReactNode } from 'react';
import { MAX_DISPLAY_NAME, acknowledgeNamingGate } from '../../db/repository';
import { saveProfile } from '../settings/profile';
import { PrimaryAction } from '../../ui/PrimaryAction';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { partnerLinkMessage } from './namingGate';

/**
 * The screen a phone sees the moment pairing actually completes.
 *
 * `PairGate` answers "are there two of you yet"; this answers the very next
 * question, once there are — who, specifically, is the other one, and what do
 * they call you. It fires exactly once per device (`namingGateSeen`, set the
 * moment this resolves, named or skipped), on whichever phone is the one to
 * discover a real partner while it still has no name of its own — see
 * `useNamingGate`, which is where "a real partner" is actually decided.
 *
 * Unlike `PairGate`, nothing is left open behind it — not even Settings.
 * Every other gate in this app leaves Settings reachable because it is the
 * only door through it (pairing itself lives there); this one is entirely
 * self-contained, so blocking Settings too means the confirmation and the
 * prompt appear the instant the second member row arrives, rather than only
 * once the person happens to navigate away from the page they joined on.
 *
 * Deliberately not a hard requirement, all the same: this app never makes a
 * name mandatory anywhere else (see `GenderBlock`'s "Prefer not to say"), and
 * a naming screen that could not be gotten past would be the one exception.
 * "Skip for now" is a local write with no network in it, so it can never be
 * the thing standing between somebody and the rest of the app.
 */
export interface NamingGateProps {
  ready: boolean;
  show: boolean;
  partnerName: string | undefined;
  workerSecret: string | undefined;
  children: ReactNode;
}

export function NamingGate({ ready, show, partnerName, workerSecret, children }: NamingGateProps) {
  // Same rule as PairGate: nothing renders on a guess.
  if (!ready) return null;
  if (!show) return <>{children}</>;
  return <NamingInvitation partnerName={partnerName} workerSecret={workerSecret} />;
}

function NamingInvitation({
  partnerName, workerSecret,
}: {
  partnerName: string | undefined;
  workerSecret: string | undefined;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const finish = async (displayName: string | null) => {
    setBusy(true);
    setNote(null);
    try {
      if (displayName) await saveProfile({ displayName }, workerSecret);
      await acknowledgeNamingGate();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not save. You can try again, or skip for now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <p className="gate-mark" aria-hidden="true">
        <span>&hearts;</span>
        <span>&hearts;</span>
      </p>
      <h1 className="gate-title">You’re paired</h1>
      <p className="gate-body">{partnerLinkMessage(partnerName)}</p>
      <form
        className="pair-join"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed) void finish(trimmed);
        }}
      >
        <input
          className="field"
          value={name}
          maxLength={MAX_DISPLAY_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should they call you?"
          aria-label="Your name"
          autoFocus
        />
        <PrimaryAction type="submit" busy={busy} disabled={!name.trim()}>
          Save and continue
        </PrimaryAction>
      </form>
      <SecondaryAction busy={busy} onClick={() => void finish(null)}>
        Skip for now
      </SecondaryAction>
      {note ? <p className="pair-note">{note}</p> : null}
      <p className="gate-note">
        Whatever you type here is what shows up on their phone, and you can
        change it later from Settings.
      </p>
    </div>
  );
}
