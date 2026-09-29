import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, loadSettings, saveSettings } from '../database';
import { markUnlinked, resetToSolo, savePairing } from './index';

const ME = 'member-me';
const THEM = 'member-them';
const COUPLE = 'couple-1';

async function seedCouple() {
  await savePairing({ coupleId: COUPLE, memberId: ME, token: 'secret' });
  await db.members.bulkPut([
    { id: ME, coupleId: COUPLE, displayName: 'Me', tracksCycle: false, updatedAt: 1 },
    { id: THEM, coupleId: COUPLE, displayName: 'Them', tracksCycle: false, updatedAt: 1 },
  ]);
  await db.moods.bulkPut([
    { id: 'mine', memberId: ME, day: '2026-09-01' },
    { id: 'theirs', memberId: THEM, day: '2026-09-01' },
  ] as never);
}

beforeEach(async () => {
  await db.settings.clear();
  await db.members.clear();
  await db.moods.clear();
});

describe('resetToSolo', () => {
  it('lets go of the partner and keeps your own rows under a fresh identity', async () => {
    await seedCouple();
    await resetToSolo(THEM);

    const settings = await loadSettings();
    expect(settings.workerSecret).toBeUndefined();
    expect(settings.coupleId).not.toBe(COUPLE);
    expect(settings.memberId).not.toBe(ME);

    // The partner's row must not ride along into the next couple.
    const members = await db.members.toArray();
    expect(members.map((m) => m.displayName)).toEqual(['Me']);
    expect(members[0].coupleId).toBe(settings.coupleId);
    expect(members[0].id).toBe(settings.memberId);

    const moods = await db.moods.toArray();
    expect(moods).toHaveLength(1);
    expect(moods[0].memberId).toBe(settings.memberId);
  });

  it('clears the pairing state, including a removed phone’s unlinkedAt', async () => {
    await seedCouple();
    await saveSettings({ pendingInvite: 'ABC123', pendingInviteExpiresAt: 9, namingGateSeen: true });
    await markUnlinked();
    await resetToSolo(THEM);
    const settings = await loadSettings();
    expect(settings.pendingInvite).toBeUndefined();
    expect(settings.namingGateSeen).toBeUndefined();
    expect(settings.unlinkedAt).toBeUndefined();
  });

  it('with nobody named, keeps every row', async () => {
    await seedCouple();
    await resetToSolo();
    expect(await db.moods.count()).toBe(2);
  });
});

describe('markUnlinked', () => {
  it('keeps all data and only stops claiming to be paired', async () => {
    await seedCouple();
    await markUnlinked();
    const settings = await loadSettings();
    expect(settings.unlinkedAt).toBeGreaterThan(0);
    expect(settings.workerSecret).toBe('secret');
    expect(await db.moods.count()).toBe(2);
  });
});
