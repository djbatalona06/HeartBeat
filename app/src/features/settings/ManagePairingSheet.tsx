import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { ListRow } from '../../ui/ListRow';
import { PrimaryAction } from '../../ui/PrimaryAction';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { leaveCouple, removePartner } from '../pairing/offboard';
import { pairFailure } from './pairing';

/**
 * What can be done to a pairing once it exists.
 *
 * Two doors, both quiet, and a confirmation on each — because both end
 * something. The confirmation says what is *kept* before what is lost: the
 * person reading it is deciding whether this is what they meant, and "your
 * history stays" is the sentence that lets them decide calmly.
 *
 * One primary action per view, and it names the thing it does ("Remove Sam"),
 * so the button is the last place a misreading can hide.
 */
type View = 'menu' | 'remove' | 'leave';

export function ManagePairingSheet({
  open, onClose, partnerName,
}: {
  open: boolean;
  onClose: () => void;
  /** The linked partner's name, or a stand-in when they have not picked one. */
  partnerName: string;
}) {
  const [view, setView] = useState<View>('menu');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const close = () => {
    setView('menu');
    setNote(null);
    onClose();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
      close();
    } catch (e) {
      setNote(pairFailure(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      label="Manage pairing"
      scrimClassName="menu-scrim"
      panelClassName="pair-sheet"
    >
      <span className="pair-sheet-grip" aria-hidden="true" />

      {view === 'menu' ? (
        <>
          <h2 className="section-title">Manage pairing</h2>
          <div className="pair-sheet-rows">
            <ListRow
              label={`Remove ${partnerName}`}
              hint="They are told the next time their phone checks. What you made together stays."
              onClick={() => setView('remove')}
            />
            <ListRow
              label="Leave and start over"
              hint="Everything you logged stays on this phone."
              onClick={() => setView('leave')}
            />
          </div>
          <SecondaryAction onClick={close}>Done</SecondaryAction>
        </>
      ) : null}

      {view === 'remove' ? (
        <>
          <h2 className="section-title">Remove {partnerName}?</h2>
          <p className="section-sub">
            {partnerName} will see that the link was ended, and keeps everything already on their
            phone. Your shared history stays. You can invite someone else straight away.
          </p>
          <PrimaryAction busy={busy} onClick={() => void run(removePartner)}>
            Remove {partnerName}
          </PrimaryAction>
          <SecondaryAction disabled={busy} onClick={() => setView('menu')}>Not now</SecondaryAction>
        </>
      ) : null}

      {view === 'leave' ? (
        <>
          <h2 className="section-title">Leave and start over?</h2>
          <p className="section-sub">
            Everything you logged stays on this phone. {partnerName} keeps their own copy and can
            invite someone new. You can start a new pairing or join a code afterwards.
          </p>
          <PrimaryAction busy={busy} onClick={() => void run(leaveCouple)}>
            Leave
          </PrimaryAction>
          <SecondaryAction disabled={busy} onClick={() => setView('menu')}>Not now</SecondaryAction>
        </>
      ) : null}

      {note ? <p className="pair-note" role="status">{note}</p> : null}
    </Sheet>
  );
}
