import { sync, type SyncResult } from '../../pwa/sync';

/** The outcome the calendar UI can state without making network details part of its copy. */
export type CalendarSyncOutcome =
  | { state: 'synced'; message: string }
  | { state: 'local'; message: string }
  | { state: 'waiting'; message: string };

/**
 * The shared-entry sync already owns calendar transport, conflict resolution,
 * and retries. This thin adapter gives the Work screen an explicit, truthful
 * action without inventing a second calendar-only transport.
 */
export function calendarSyncMessage(result: SyncResult | null): CalendarSyncOutcome {
  if (!result) {
    return {
      state: 'local',
      message: 'Saved on this phone. Pair with your partner to share the calendar.',
    };
  }

  if (result.pushed === 0 && result.pulled === 0 && result.applied === 0) {
    return { state: 'synced', message: 'Your shared calendar is already up to date.' };
  }

  return {
    state: 'synced',
    message: 'Saved to the shared calendar. Your partner will see it when their app syncs.',
  };
}

export async function syncCalendar(): Promise<CalendarSyncOutcome> {
  try {
    return calendarSyncMessage(await sync());
  } catch {
    // The events remain in IndexedDB. `useSync` retries on the next foreground
    // or online event, so an offline tap is not a failed import or a lost edit.
    return {
      state: 'waiting',
      message: 'Saved here. It will sync with your partner when this phone is online again.',
    };
  }
}
