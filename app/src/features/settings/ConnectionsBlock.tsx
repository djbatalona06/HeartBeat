import { useState } from 'react';
import type { Settings } from '../../domain/types';
import { setAppBadge } from '../../db/repository';
import { supportsAppBadge } from '../../pwa/badge';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { saveCalendarIcs } from '../work/saveCalendar';
import { NotificationsBlock } from './NotificationsBlock';
import { RecoveryBlock } from './RecoveryBlock';
import { StudyLinkBlock } from './StudyLinkBlock';

/**
 * Everything HeartBeat can talk to besides your partner, in one place.
 *
 * Reminders, the study app and account recovery used to sit at three different
 * heights of one long page, with nothing to say they were the same kind of
 * thing: optional, off until turned on, and each able to be undone. They are
 * moved here unchanged — each still owns its own logic and hides itself when
 * the deploy has not configured it — and two things that leave the app for
 * somewhere else join them: the calendar, out to Apple or Google Calendar, and
 * the count on the app icon.
 *
 * The rule the whole group keeps: nothing is on until you turn it on, and
 * nothing asks for a permission until you tap.
 */
export function ConnectionsBlock({
  settings, paired,
}: {
  settings: Settings | undefined;
  paired: boolean;
}) {
  return (
    <div className="connections">
      <section className="set-block">
        <h2 className="section-title">Connections</h2>
        <p className="section-sub">
          What HeartBeat can reach beyond the two of you. Each one is optional, and none is on
          until you turn it on.
        </p>
      </section>

      <NotificationsBlock />
      <StudyLinkBlock token={settings?.workerSecret} />
      <RecoveryBlock token={settings?.workerSecret} paired={paired} />
      <OnThisPhone settings={settings} />
    </div>
  );
}

function OnThisPhone({ settings }: { settings: Settings | undefined }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveCalendar = async () => {
    setBusy(true);
    try {
      setNote(
        (await saveCalendarIcs(settings?.timeZone ?? 'UTC'))
          ? 'Saved. Open the .ics file to add it to Apple or Google Calendar.'
          : 'There is nothing on the calendar to save yet.',
      );
    } catch {
      setNote('This phone would not save a file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="set-block">
      <h2 className="section-title">On this phone</h2>
      <SecondaryAction busy={busy} onClick={() => void saveCalendar()}>
        Save the calendar for Apple or Google Calendar
      </SecondaryAction>
      {note ? <p className="pair-note" role="status">{note}</p> : null}

      {supportsAppBadge() ? (
        <label className="set-toggle">
          <input
            type="checkbox"
            checked={settings?.appBadge === true}
            onChange={(e) => void setAppBadge(e.target.checked)}
          />
          <span>
            Show what is waiting on the app icon. It needs Reminders turned on above, and it clears
            itself when you switch it off.
          </span>
        </label>
      ) : null}
    </section>
  );
}
