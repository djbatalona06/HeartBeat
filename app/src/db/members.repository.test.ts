import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, loadSettings, saveSettings } from './database';
import {
  MAX_DISPLAY_NAME,
  clearPendingInvite,
  putMyProfile,
  saveMembersFromServer,
  savePairing,
  setCalmMode,
  setThemeChoice,
  setTracksCycle,
} from './repository';

/**
 * The members table's first writers.
 *
 * Two rules are worth pinning here because both fail quietly. Cycle ownership
 * has one answer — the settings row — and the member row only mirrors it; and
 * an older copy of a member arriving from the server must never undo an edit
 * made on this phone while it was offline.
 */

const MINE = 'member-mine';
const THEIRS = 'member-theirs';
const COUPLE = 'couple-1';
const FACE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

beforeEach(async () => {
  await db.settings.clear();
  await db.members.clear();
  await saveSettings({ memberId: MINE, coupleId: COUPLE });
});

describe('savePairing', () => {
  it('stores the three fields that together mean paired, plus the code', async () => {
    await savePairing({
      coupleId: 'couple-2',
      memberId: 'member-2',
      token: 'secret',
      invite: 'K3M9PQ',
      expiresAt: 4_000,
    });
    const settings = await loadSettings();
    expect(settings.coupleId).toBe('couple-2');
    expect(settings.memberId).toBe('member-2');
    expect(settings.workerSecret).toBe('secret');
    expect(settings.pendingInvite).toBe('K3M9PQ');
    expect(settings.pendingInviteExpiresAt).toBe(4_000);
  });

  it('keeps no code for the phone that joined, which was never issued one', async () => {
    await savePairing({ coupleId: COUPLE, memberId: MINE, token: 'secret' });
    expect((await loadSettings()).pendingInvite).toBeUndefined();
  });
});

describe('clearPendingInvite', () => {
  it('drops a code that has done its job', async () => {
    await savePairing({
      coupleId: COUPLE, memberId: MINE, token: 't', invite: 'K3M9PQ', expiresAt: 9,
    });
    await clearPendingInvite();
    const settings = await loadSettings();
    expect(settings.pendingInvite).toBeUndefined();
    expect(settings.pendingInviteExpiresAt).toBeUndefined();
    // The pairing itself survives losing the code.
    expect(settings.workerSecret).toBe('t');
  });
});

describe('setThemeChoice', () => {
  it('writes the durable copy of the theme', async () => {
    await setThemeChoice('pony');
    expect((await loadSettings()).themeId).toBe('pony');
  });
});

describe('setCalmMode', () => {
  it('remembers calm across a reload, which React state did not', async () => {
    await setCalmMode(true);
    expect((await loadSettings()).calmMode).toBe(true);
  });
});

describe('setTracksCycle', () => {
  it('answers in settings and mirrors the answer onto my member row', async () => {
    await setTracksCycle(true);
    expect((await loadSettings()).tracksCycle).toBe(true);
    expect((await db.members.get(MINE))?.tracksCycle).toBe(true);
  });

  it('keeps a name and face that were already there', async () => {
    await putMyProfile({ displayName: 'Sam', photoDataUri: FACE });
    await setTracksCycle(true);
    const row = await db.members.get(MINE);
    expect(row?.displayName).toBe('Sam');
    expect(row?.photoDataUri).toBe(FACE);
  });
});

describe('putMyProfile', () => {
  it('writes a name to the row settings already names as mine', async () => {
    const row = await putMyProfile({ displayName: 'Sam' });
    expect(row.id).toBe(MINE);
    expect(row.coupleId).toBe(COUPLE);
    expect((await db.members.get(MINE))?.displayName).toBe('Sam');
  });

  it('trims and caps a name rather than refusing it', async () => {
    const row = await putMyProfile({ displayName: `  ${'n'.repeat(80)}  ` });
    expect(row.displayName).toHaveLength(MAX_DISPLAY_NAME);
  });

  it('leaves the photo alone when the patch does not mention it', async () => {
    await putMyProfile({ displayName: 'Sam', photoDataUri: FACE });
    await putMyProfile({ displayName: 'Samantha' });
    expect((await db.members.get(MINE))?.photoDataUri).toBe(FACE);
  });

  it('takes the photo off when the patch says null', async () => {
    await putMyProfile({ photoDataUri: FACE });
    await putMyProfile({ photoDataUri: null });
    expect((await db.members.get(MINE))?.photoDataUri).toBeUndefined();
  });

  it('carries the cycle answer over from settings rather than inventing one', async () => {
    await saveSettings({ tracksCycle: true });
    expect((await putMyProfile({ displayName: 'Sam' })).tracksCycle).toBe(true);
  });
});

describe('saveMembersFromServer', () => {
  it('writes the partner this phone has never seen', async () => {
    const applied = await saveMembersFromServer([
      { id: THEIRS, coupleId: COUPLE, displayName: 'Alex', tracksCycle: false, updatedAt: 100 },
    ]);
    expect(applied).toBe(1);
    expect((await db.members.get(THEIRS))?.displayName).toBe('Alex');
  });

  it('lets a newer server row replace an older local one', async () => {
    await db.members.put({
      id: THEIRS, coupleId: COUPLE, displayName: 'Alex', tracksCycle: false, updatedAt: 100,
    });
    await saveMembersFromServer([
      { id: THEIRS, coupleId: COUPLE, displayName: 'Alexandra', tracksCycle: false, updatedAt: 200 },
    ]);
    expect((await db.members.get(THEIRS))?.displayName).toBe('Alexandra');
  });

  it('does not undo an edit made here while the phone was offline', async () => {
    const mine = await putMyProfile({ displayName: 'Sam' });
    await saveMembersFromServer([
      {
        id: MINE,
        coupleId: COUPLE,
        displayName: 'stale',
        tracksCycle: false,
        updatedAt: mine.updatedAt - 1,
      },
    ]);
    expect((await db.members.get(MINE))?.displayName).toBe('Sam');
  });

  // /api/profile does not serve tracks_cycle, so every served row arrives
  // without it. Saving a name must not blank the mirror setTracksCycle keeps.
  it('keeps the cycle answer a row that does not carry one would erase', async () => {
    await saveSettings({ tracksCycle: true });
    const mine = await putMyProfile({ displayName: 'Sam' });
    await saveMembersFromServer([
      { id: MINE, coupleId: COUPLE, displayName: 'Sam', updatedAt: mine.updatedAt + 1 },
    ]);
    expect((await db.members.get(MINE))?.tracksCycle).toBe(true);
  });

  it('treats an equal timestamp as the same row and leaves it alone', async () => {
    await db.members.put({
      id: THEIRS, coupleId: COUPLE, displayName: 'Alex', tracksCycle: false, updatedAt: 100,
    });
    const applied = await saveMembersFromServer([
      { id: THEIRS, coupleId: COUPLE, displayName: 'Other', tracksCycle: false, updatedAt: 100 },
    ]);
    expect(applied).toBe(0);
    expect((await db.members.get(THEIRS))?.displayName).toBe('Alex');
  });
});
