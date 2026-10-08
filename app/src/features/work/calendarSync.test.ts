import { describe, expect, it } from 'vitest';
import { calendarSyncMessage } from './calendarSync';

describe('calendarSyncMessage', () => {
  it('explains that an unpaired calendar stays local', () => {
    expect(calendarSyncMessage(null)).toEqual({
      state: 'local',
      message: 'Saved on this phone. Pair with your partner to share the calendar.',
    });
  });

  it('calls an empty successful round up to date', () => {
    expect(calendarSyncMessage({ pushed: 0, pulled: 0, applied: 0, skipped: 0, more: false }))
      .toEqual({ state: 'synced', message: 'Your shared calendar is already up to date.' });
  });

  it('does not promise that a partner has already opened the app', () => {
    expect(calendarSyncMessage({ pushed: 2, pulled: 1, applied: 1, skipped: 0, more: false }))
      .toEqual({
        state: 'synced',
        message: 'Saved to the shared calendar. Your partner will see it when their app syncs.',
      });
  });
});
