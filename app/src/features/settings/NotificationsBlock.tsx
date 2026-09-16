import { useCallback, useEffect, useState } from 'react';
import { db, loadSettings, saveSettings } from '../../db/database';
import { clearNudges, health, putNudges, subscribePush, unsubscribePush } from '../../pwa/api';
import { PushError, enablePush, notificationPermission } from '../../pwa/push';
import {
  DEFAULT_HOUR,
  NIGHT_UNTIL,
  NUDGE_KINDS,
  isNightHour,
  lastTogetherDay,
  loggedDaysFrom,
  planNudges,
  type NudgeKind,
} from '../../domain/notify/schedule';
import { todayKey } from '../../domain/day';
import type { Settings } from '../../domain/types';

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
  const [vapid, setVapid] = useState<string | null>(null);
  const [permission, setPermission] = useState(notificationPermission());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadSettings().then((next) => { if (live) setSettings(next); });
    void health().then((h) => {
      if (!live) return;
      if (!h) return setBackend('down');
      if (!h.vapidPublicKey) return setBackend('no-push');
      setVapid(h.vapidPublicKey);
      setBackend('ready');
      void saveSettings({ vapidPublicKey: h.vapidPublicKey });
    });
    return () => { live = false; };
  }, []);

  /**
   * Recompute the queue and post it, replacing whatever was there.
   *
   * Called after enabling and after the hour changes, and safe either way: the
   * endpoint replaces rather than appends, so posting twice leaves one queue.
   */
  const schedule = useCallback(async (
    token: string, hour: number, memberId: string,
  ) => {
    const [moods, exercises, cycles, work] = await Promise.all([
      db.moods.toArray(),
      db.exercises.toArray(),
      db.cycles.toArray(),
      db.work.toArray(),
    ]);
    const current = await loadSettings();
    const timeZone = current.timeZone;
    const logged = loggedDaysFrom(moods, exercises, cycles, work);
    const plan = planNudges({
      memberId,
      timeZone,
      hour,
      today: todayKey(timeZone),
      now: Date.now(),
      loggedDays: logged,
      lastTogether: lastTogetherDay(logged),
      // Read here rather than taken as an argument: every caller would
      // otherwise have to remember to pass it, and the one that forgot would
      // silently re-enable a reminder somebody had turned off.
      kinds: current.notifyKinds,
    });
    return putNudges(token, plan);
  }, []);

  if (!settings) return null;

  const token = settings.workerSecret;
  const memberId = settings.memberId;
  const hour = settings.notifyHour ?? DEFAULT_HOUR;
  const on = settings.notifyOn === true && permission === 'granted';

  // Every reason this cannot work, said plainly and in the order they bite.
  const blocked =
    permission === 'unsupported' ? 'This browser cannot show notifications.'
    : permission === 'denied' ? 'Notifications are blocked for this app. On a phone that usually means removing the icon from the home screen and adding it again.'
    : !token || !memberId ? 'Pair the two phones first — there is nobody to remind you about yet.'
    : backend === 'down' ? 'The server is not answering, so reminders cannot be scheduled. Everything else still works offline.'
    : backend === 'no-push' ? 'This deployment has no notification key configured, so reminders are not available.'
    : null;

  async function turnOn() {
    if (!token || !memberId || !vapid) return;
    setBusy(true);
    setNote(null);
    try {
      // The tap is here, and nowhere else.
      const sub = await enablePush(vapid);
      await subscribePush(token, sub);
      await saveSettings({ notifyOn: true, notifyHour: hour, pushEndpoint: sub.endpoint });
      const count = await schedule(token, hour, memberId);
      setPermission(notificationPermission());
      setSettings(await loadSettings());
      setNote(count > 0
        ? `Reminders on. ${count} queued for the next few days.`
        : 'Reminders on. Nothing queued — every day ahead is already logged.');
    } catch (error) {
      setPermission(notificationPermission());
      setNote(error instanceof PushError
        ? error.message
        : 'That did not take. Nothing has changed, and it is safe to try again.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!token) return;
    setBusy(true);
    setNote(null);
    try {
      await clearNudges(token);
      if (settings?.pushEndpoint) await unsubscribePush(token, settings.pushEndpoint);
      await saveSettings({ notifyOn: false, pushEndpoint: undefined });
      setSettings(await loadSettings());
      setNote('Reminders off. Nothing else changes.');
    } catch {
      setNote('The server did not answer, so reminders may still arrive. Try again when you are back online.');
    } finally {
      setBusy(false);
    }
  }

  async function changeHour(next: number) {
    await saveSettings({ notifyHour: next });
    setSettings(await loadSettings());
    if (on && token && memberId) {
      setBusy(true);
      try {
        await schedule(token, next, memberId);
      } catch {
        setNote('The new time is saved here, but the server did not take it yet.');
      } finally {
        setBusy(false);
      }
    }
  }

  /**
   * Turn one kind of reminder off without turning reminders off.
   *
   * Re-posts the whole queue rather than trying to delete the rows for one
   * kind: the endpoint replaces, so a full re-plan is both simpler and the only
   * version that cannot leave a stale nudge behind for a kind nobody wants.
   */
  async function changeKind(kind: NudgeKind, wanted: boolean) {
    const next = { ...(settings?.notifyKinds ?? {}), [kind]: wanted };
    await saveSettings({ notifyKinds: next });
    setSettings(await loadSettings());
    if (on && token && memberId) {
      setBusy(true);
      try {
        await schedule(token, hour, memberId);
      } catch {
        setNote('Saved here, but the server did not take it yet.');
      } finally {
        setBusy(false);
      }
    }
  }

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
        <>
          <div className="notify-row">
            <span className="notify-state">{on ? 'On' : 'Off'}</span>
            <button
              className="notify-switch"
              type="button"
              disabled={busy || backend === 'checking'}
              onClick={() => void (on ? turnOff() : turnOn())}
            >
              {busy ? 'One moment…' : on ? 'Turn off' : 'Turn on'}
            </button>
          </div>

          <label className="notify-hour">
            <span>What time</span>
            <select
              value={hour}
              disabled={busy}
              onChange={(e) => void changeHour(Number(e.target.value))}
            >
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

          {on && NUDGE_KINDS.every((k) => settings.notifyKinds?.[k] === false) ? (
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
            {NUDGE_KINDS.map((kind) => {
              const wanted = settings.notifyKinds?.[kind] !== false;
              return (
                <label className="notify-kind" key={kind}>
                  <input
                    type="checkbox"
                    checked={wanted}
                    disabled={busy}
                    onChange={(e) => void changeKind(kind, e.target.checked)}
                  />
                  <span className="notify-kind-name">{KIND_COPY[kind].name}</span>
                  <span className="notify-kind-what">{KIND_COPY[kind].what}</span>
                </label>
              );
            })}
          </fieldset>
        </>
      )}

      {note ? <p className="notify-note" role="status">{note}</p> : null}
    </section>
  );
}
