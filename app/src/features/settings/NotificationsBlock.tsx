import { useEffect, useRef, useState } from 'react';
import { loadSettings, saveSettings } from '../../db/database';
import { clearNudges, health, subscribePush, unsubscribePush } from '../../pwa/api';
import { PushError, enablePush, notificationPermission } from '../../pwa/push';
import { replanNudges } from '../../pwa/nudgeSync';
import {
  DEFAULT_HOUR,
  NIGHT_UNTIL,
  NUDGE_KINDS,
  isNightHour,
  type NudgeKind,
} from '../../domain/notify/schedule';
import type { Settings } from '../../domain/types';
import { useBusyAction } from '../../ui/useBusyAction';

/**
 * Turning reminders on, and being honest about when they cannot be.
 *
 * The one rule that shapes every branch here: **permission is requested only
 * from a tap.** iOS surfaces the prompt no other way inside an installed app,
 * and a denial can only be undone by deleting the icon and adding it again.
 * Asking on mount, or on a render that happens to run after a state change,
 * spends a chance the person cannot get back. So there is a button, and the
 * button is the only thing that calls `enablePush`.
 *
 * The states are told apart rather than collapsed into "off". A browser that
 * cannot do push, a permission already denied, and a server that is not
 * answering are three different problems with three different answers, and
 * showing one switch for all of them means the person taps a control that
 * cannot work and learns nothing.
 */

type Backend = 'checking' | 'ready' | 'no-push' | 'down';

/**
 * What each switch is, in the words a person would use.
 *
 * Kept beside the UI rather than in `schedule.ts`, which is pure and has no
 * business knowing how a checkbox is labelled — and `NUDGE_KINDS` drives the
 * list, so a new kind with no copy is a type error here rather than a switch
 * that renders as `away`.
 */
const KIND_COPY: Record<NudgeKind, { name: string; what: string }> = {
  daily: {
    name: 'The daily one',
    what: 'At the time above, and never on a day you have already logged.',
  },
  away: {
    name: 'After a few days away',
    what: 'One line, once — not once a day. Turn it off if you would rather the app said nothing.',
  },
};

export function NotificationsBlock() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [backend, setBackend] = useState<Backend>('checking');
  const vapid = useRef<string | null>(null);
  const [permission, setPermission] = useState(notificationPermission);
  const [note, setNote] = useState<string | null>(null);
  const { busy, run } = useBusyAction(setNote);

  useEffect(() => {
    let live = true;
    void loadSettings().then((next) => { if (live) setSettings(next); });
    void health().then((h) => {
      if (!live) return;
      if (!h) return setBackend('down');
      if (!h.vapidPublicKey) return setBackend('no-push');
      vapid.current = h.vapidPublicKey;
      setBackend('ready');
      void saveSettings({ vapidPublicKey: h.vapidPublicKey });
    });
    return () => { live = false; };
  }, []);

  /**
   * Recompute the queue and post it, replacing whatever was there.
   *
   * The planning itself is `pwa/nudgeSync.ts`, which is also what runs on
   * launch and on every foreground — this screen used to hold the only copy,
   * which is why the queue could run dry three days after somebody last looked
   * at it. Safe to call twice: the endpoint replaces rather than appends.
   *
   * It reads the hour and the kinds from Settings rather than taking them, so
   * every caller below saves first and then re-plans.
   */
  const schedule = () => replanNudges().then((count) => count ?? 0);

  if (!settings) return null;

  const token = settings.workerSecret;
  const memberId = settings.memberId;
  const hour = settings.notifyHour ?? DEFAULT_HOUR;
  const on = settings.notifyOn === true && permission === 'granted';
  const blocked = blockedReason({ permission, paired: Boolean(token && memberId), backend });

  const refresh = async () => setSettings(await loadSettings());

  /** Saves a change, then re-posts the queue if reminders are on. */
  const changeAndReplan = async (patch: Partial<Settings>, failure: string) => {
    await saveSettings(patch);
    await refresh();
    if (on && token && memberId) await run(async () => { await schedule(); }, failure);
  };

  const turnOn = () => run(
    async () => {
      if (!token || !memberId || !vapid.current) return;
      setNote(null);
      // The tap is here, and nowhere else.
      const sub = await enablePush(vapid.current);
      await subscribePush(token, sub);
      await saveSettings({ notifyOn: true, notifyHour: hour, pushEndpoint: sub.endpoint });
      const count = await schedule();
      setPermission(notificationPermission());
      await refresh();
      setNote(count > 0
        ? `Reminders on. ${count} queued for the next few days.`
        : 'Reminders on. Nothing queued — every day ahead is already logged.');
    },
    (error) => (error instanceof PushError
      ? error.message
      : 'That did not take. Nothing has changed, and it is safe to try again.'),
    () => setPermission(notificationPermission()),
  );

  const turnOff = () => run(
    async () => {
      if (!token) return;
      setNote(null);
      await clearNudges(token);
      if (settings.pushEndpoint) await unsubscribePush(token, settings.pushEndpoint);
      await saveSettings({ notifyOn: false, pushEndpoint: undefined });
      await refresh();
      setNote('Reminders off. Nothing else changes.');
    },
    'The server did not answer, so reminders may still arrive. Try again when you are back online.',
  );

  /**
   * Turn one kind of reminder off without turning reminders off.
   *
   * Re-posts the whole queue rather than trying to delete the rows for one
   * kind: the endpoint replaces, so a full re-plan is both simpler and the only
   * version that cannot leave a stale nudge behind for a kind nobody wants.
   */
  const changeKind = (kind: NudgeKind, wanted: boolean) => changeAndReplan(
    { notifyKinds: { ...(settings.notifyKinds ?? {}), [kind]: wanted } },
    'Saved here, but the server did not take it yet.',
  );

  return (
    <section className="notify">
      <h2 className="notify-title">Reminders</h2>
      <p className="notify-lead">
        One a day at most, skipped on a day you have already logged. Nothing is
        ever taken away for missing one.
      </p>

      {blocked ? (
        <p className="notify-blocked" role="status">{blocked}</p>
      ) : (
        <ReminderControls
          on={on}
          busy={busy}
          checking={backend === 'checking'}
          hour={hour}
          kinds={settings.notifyKinds}
          onToggle={() => void (on ? turnOff() : turnOn())}
          onHour={(next) => void changeAndReplan(
            { notifyHour: next },
            'The new time is saved here, but the server did not take it yet.',
          )}
          onKind={(kind, wanted) => void changeKind(kind, wanted)}
        />
      )}

      {note ? <p className="notify-note" role="status">{note}</p> : null}
    </section>
  );
}

interface BlockedInput {
  permission: ReturnType<typeof notificationPermission>;
  paired: boolean;
  backend: Backend;
}

/** Every reason this cannot work, said plainly and in the order they bite. */
function blockedReason({ permission, paired, backend }: BlockedInput): string | null {
  if (permission === 'unsupported') return 'This browser cannot show notifications.';
  if (permission === 'denied') {
    return 'Notifications are blocked for this app. On a phone that usually means removing the icon from the home screen and adding it again.';
  }
  if (!paired) return 'Pair the two phones first — there is nobody to remind you about yet.';
  if (backend === 'down') {
    return 'The server is not answering, so reminders cannot be scheduled. Everything else still works offline.';
  }
  if (backend === 'no-push') {
    return 'This deployment has no notification key configured, so reminders are not available.';
  }
  return null;
}

interface ReminderControlsProps {
  on: boolean;
  busy: boolean;
  checking: boolean;
  hour: number;
  kinds: Settings['notifyKinds'];
  onToggle: () => void;
  onHour: (hour: number) => void;
  onKind: (kind: NudgeKind, wanted: boolean) => void;
}

function ReminderControls({ on, busy, checking, hour, kinds, onToggle, onHour, onKind }: ReminderControlsProps) {
  return (
    <>
      <div className="notify-row">
        <span className="notify-state">{on ? 'On' : 'Off'}</span>
        <button
          className="notify-switch"
          type="button"
          disabled={busy || checking}
          onClick={onToggle}
        >
          {busy ? 'One moment…' : on ? 'Turn off' : 'Turn on'}
        </button>
      </div>

      <label className="notify-hour">
        <span>What time</span>
        <select value={hour} disabled={busy} onChange={(e) => onHour(Number(e.target.value))}>
          {/* Every hour is still offered. Refusing to list the night ones
              would be deciding for somebody who works nights that they are
              wrong about their own day. What changes is that the app says
              out loud what it will actually do with the choice, rather than
              accepting it and quietly waking them at three. */}
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00{isNightHour(h) ? ' — arrives in the morning' : ''}
            </option>
          ))}
        </select>
      </label>

      {isNightHour(hour) ? (
        <p className="notify-note" role="status">
          {String(hour).padStart(2, '0')}:00 is inside the quiet hours, so this
          one will arrive at {String(NIGHT_UNTIL).padStart(2, '0')}:00 instead.
          Nothing is lost — it waits rather than being skipped.
        </p>
      ) : null}

      {on && NUDGE_KINDS.every((k) => kinds?.[k] === false) ? (
        <p className="notify-note" role="status">
          Both kinds are off, so nothing will arrive even though reminders
          are on. Turn one back on below, or turn reminders off above —
          either is fine, and neither loses anything.
        </p>
      ) : null}

      <fieldset className="notify-kinds">
        {/* Two switches rather than one, because the two pushes are not the
            same promise. The daily one is an invitation you asked for; the
            other is the app noticing you were away. Somebody can reasonably
            want the first and not the second, and making them choose
            between both and neither is how people turn reminders off
            altogether. */}
        <legend>What to send</legend>
        {NUDGE_KINDS.map((kind) => (
          <label className="notify-kind" key={kind}>
            <input
              type="checkbox"
              checked={kinds?.[kind] !== false}
              disabled={busy}
              onChange={(e) => onKind(kind, e.target.checked)}
            />
            <span className="notify-kind-name">{KIND_COPY[kind].name}</span>
            <span className="notify-kind-what">{KIND_COPY[kind].what}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}
