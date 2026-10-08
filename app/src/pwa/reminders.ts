import { subscribePush } from './api';
import { enablePush } from './push';
import { replanNudges } from './nudgeSync';
import { saveSettings } from '../db/database';

/**
 * Turn reminders on: ask, subscribe, remember, and fill the queue.
 *
 * Shared by the Settings switch and the offer after a logged mood, so the two
 * cannot drift into turning on different things. **Call from a tap**: the
 * first thing it does is `Notification.requestPermission`, which iOS only
 * shows from inside a user gesture in the installed app. Throws `PushError`
 * with a readable reason when the browser refuses. Returns how many reminders
 * were queued.
 */
export async function enableReminders(vapid: string, token: string, hour: number): Promise<number> {
  const sub = await enablePush(vapid);
  await subscribePush(token, sub);
  await saveSettings({ notifyOn: true, notifyHour: hour, pushEndpoint: sub.endpoint });
  return (await replanNudges()) ?? 0;
}
