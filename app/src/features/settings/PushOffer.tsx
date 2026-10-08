import { useEffect, useState } from 'react';
import { saveSettings } from '../../db/database';
import { health } from '../../pwa/api';
import { installState, isIos } from '../../pwa/install';
import { PushError, notificationPermission } from '../../pwa/push';
import { enableReminders } from '../../pwa/reminders';
import { DEFAULT_HOUR } from '../../domain/notify/schedule';
import { shouldOfferPush } from '../../domain/notify/offer';
import type { Settings } from '../../domain/types';
import { PrimaryAction } from '../../ui/PrimaryAction';
import { useBusyAction } from '../../ui/useBusyAction';

/**
 * "Want a nudge tomorrow?", asked the moment something was logged.
 *
 * The Settings switch is where people who already want reminders turn them on;
 * this is for everybody else, at the one moment the app has just been useful.
 * The button is the tap iOS needs before it will show the prompt, so nothing is
 * asked until it is pressed. Whether to show at all is `shouldOfferPush`.
 */
export function PushOffer({ settings, justWon }: { settings: Settings | undefined; justWon: boolean }) {
  const [vapid, setVapid] = useState(settings?.vapidPublicKey);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { busy, run } = useBusyAction(setNote);

  const token = settings?.workerSecret;
  const due = Boolean(settings) && shouldOfferPush({
    permission: notificationPermission(),
    canPrompt: !isIos() || installState() === 'installed',
    paired: Boolean(token && settings?.memberId),
    notifyOn: settings?.notifyOn === true,
    justWon,
    dismissedAt: settings?.pushOfferDismissedAt,
    now: Date.now(),
  });

  // The key is cached by the Settings screen; a phone that never opened it
  // asks the server here, once the offer is actually going to show.
  useEffect(() => {
    if (!due || vapid) return undefined;
    let live = true;
    void health().then((h) => { if (live && h?.vapidPublicKey) setVapid(h.vapidPublicKey); });
    return () => { live = false; };
  }, [due, vapid]);

  if (done) return <p className="section-sub push-offer-done" role="status">Reminders on. The time is in Settings.</p>;
  if (!due || !vapid || !token) return null;

  const turnOn = () => run(
    async () => {
      await enableReminders(vapid, token, settings?.notifyHour ?? DEFAULT_HOUR);
      setDone(true);
    },
    (error) => (error instanceof PushError ? error.message : 'That did not take. Settings has the same switch.'),
  );

  return (
    <section className="panel push-offer">
      <h2 className="section-title">Want a nudge tomorrow?</h2>
      <p className="section-sub">One evening reminder if a day is still empty, and nothing when it is not.</p>
      <div className="push-offer-actions">
        <PrimaryAction onClick={() => void turnOn()} busy={busy}>Remind me</PrimaryAction>
        <button
          type="button"
          className="chip"
          onClick={() => void saveSettings({ pushOfferDismissedAt: Date.now() })}
        >
          Not now
        </button>
      </div>
      {note ? <p className="section-sub" role="alert">{note}</p> : null}
    </section>
  );
}
