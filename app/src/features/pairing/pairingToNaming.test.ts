import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, loadSettings, saveSettings } from '../../db/database';
import { isPaired } from '../../domain/identity/rekey';
import { fetchProfiles, pairStart } from '../../pwa/api';
import { saveMembersFromServer } from '../../db/repository';
import { receivePairingCode } from '../settings/receivePairingCode';
import { saveProfile } from '../settings/profile';
import { partnerLinkMessage, showNamingGate } from './namingGate';

/**
 * The whole thing, live: one phone starts a pairing, a second phone receives
 * the code, and only then does either of them learn who, specifically, is on
 * the other end — which is what the naming gate exists to say.
 *
 * `receivePairingCode.test.ts` already proves the join half against a fake
 * server; this walks one step further, into what `useNamingGate` decides once
 * that join has landed: whether to show the gate, and what it says about the
 * partner by name. The fake server here also answers `/api/profile`, since
 * that is the request the gate's own effect fires to learn the partner
 * exists at all — see `useNamingGate.ts`'s note on why it cannot wait for
 * Settings to be the one to ask.
 */
function fakeServer() {
  let invite: string | null = null;
  const members = new Map<string, { id: string; coupleId: string; displayName: string; updatedAt: number }>();
  const tokenToMember = new Map<string, string>();
  const coupleId = 'couple-live';

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const auth = new Headers(init?.headers).get('authorization');
    const token = auth?.replace('Bearer ', '');

    if (path === '/api/pair/start') {
      invite = 'K3M9PQ';
      const token = 'token-a';
      members.set('member-a', { id: 'member-a', coupleId, displayName: '', updatedAt: Date.now() });
      tokenToMember.set(token, 'member-a');
      return Response.json({ coupleId, memberId: 'member-a', token, invite, expiresAt: Date.now() + 60_000 });
    }
    if (path === '/api/pair/join') {
      const code = (body as { invite?: string })?.invite;
      if (code !== invite) return Response.json({ error: 'no such invite' }, { status: 404 });
      invite = null;
      const token = 'token-b';
      members.set('member-b', { id: 'member-b', coupleId, displayName: '', updatedAt: Date.now() });
      tokenToMember.set(token, 'member-b');
      return Response.json({ coupleId, memberId: 'member-b', token });
    }
    if (path === '/api/profile' && (!init?.method || init.method === 'GET')) {
      const mine = token ? tokenToMember.get(token) : undefined;
      return Response.json({
        members: [...members.values()].map((m) => ({ ...m, mine: m.id === mine })),
      });
    }
    if (path === '/api/profile' && init?.method === 'PUT') {
      const mine = token ? tokenToMember.get(token) : undefined;
      if (!mine) return Response.json({ error: 'no such member' }, { status: 401 });
      const row = members.get(mine)!;
      row.displayName = (body as { displayName?: string }).displayName ?? row.displayName;
      row.updatedAt = Date.now();
      return Response.json({
        members: [...members.values()].map((m) => ({ ...m, mine: m.id === mine })),
      });
    }
    throw new Error(`unexpected fetch: ${path} ${init?.method ?? 'GET'}`);
  });
}

beforeEach(async () => {
  await db.settings.clear();
  await db.members.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pairing through to the naming gate, live against a fake server', () => {
  it('shows the gate the moment a real partner exists, names them once they pick a name, and never again once this phone has its own', async () => {
    const server = fakeServer();
    vi.stubGlobal('fetch', server);

    // Device A starts the pairing. In real life this is a different phone;
    // here it is the same Dexie instance a moment before device B's join, so
    // the settings it leaves behind are overwritten by B's own in the next
    // step — exactly as two real phones never share one one Dexie table.
    const started = await pairStart();
    expect(started.invite).toBe('K3M9PQ');

    // Device B receives the code.
    const joined = await receivePairingCode('k3m-9pq');
    expect(joined.ok).toBe(true);

    // Nothing has synced the couple's second member row in yet, so the gate
    // has nothing to show a name for: it must not fire on a token alone.
    let settings = await loadSettings();
    expect(showNamingGate({
      paired: isPaired(settings),
      memberCount: await db.members.count(),
      myName: undefined,
      seen: settings.namingGateSeen === true,
    })).toBe(false);

    // This is `useNamingGate`'s own effect, run by hand: the request that
    // discovers the partner is real, independent of which screen is open.
    await saveMembersFromServer(await fetchProfiles(settings.workerSecret!));

    const members = await db.members.toArray();
    expect(members).toHaveLength(2);
    const mine = members.find((m) => m.id === settings.memberId);
    const theirs = members.find((m) => m.id !== settings.memberId);

    // The partner is real now, but nameless — the gate should show, and say
    // so rather than inventing a name.
    expect(showNamingGate({
      paired: isPaired(settings),
      memberCount: members.length,
      myName: mine?.displayName,
      seen: settings.namingGateSeen === true,
    })).toBe(true);
    expect(partnerLinkMessage(theirs?.displayName)).toContain('haven’t picked a name yet');

    // Device A, elsewhere, picks a name. Device B syncs again and the message
    // now names the specific person — the point of the whole feature.
    const fetchAsA = async (path: string, init?: RequestInit) => server(path, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), authorization: 'Bearer token-a' },
    });
    await fetchAsA('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alex' }),
    });
    await saveMembersFromServer(await fetchProfiles(settings.workerSecret!));
    const theirsNamed = (await db.members.toArray()).find((m) => m.id !== settings.memberId);
    expect(partnerLinkMessage(theirsNamed?.displayName)).toBe('You’re linked with Alex.');

    // Device B now names itself, the way the gate's form does.
    await saveProfile({ displayName: 'Rowan' }, settings.workerSecret);
    await saveSettings({ namingGateSeen: true });
    settings = await loadSettings();
    const mineNamed = (await db.members.toArray()).find((m) => m.id === settings.memberId);

    expect(showNamingGate({
      paired: isPaired(settings),
      memberCount: (await db.members.toArray()).length,
      myName: mineNamed?.displayName,
      seen: settings.namingGateSeen === true,
    })).toBe(false);
  });
});
