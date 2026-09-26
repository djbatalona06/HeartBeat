import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, loadSettings } from '../../db/database';
import { pairStart } from '../../pwa/api';
import { receivePairingCode } from './receivePairingCode';

/**
 * A live demo of the receiving side, not a mock of it.
 *
 * `pairing.test.ts` beside this file already pins the pure fragments
 * (normalize, `pairFailure`) in isolation. This walks the whole thing a real
 * phone does: start a pairing (the server mints a code), read that code back
 * with the mangling a phone actually introduces, hand it to
 * `receivePairingCode`, and check what landed in this phone's own database —
 * `fetch` is the only thing faked, standing in for the second phone's server.
 */

/** A minimal stand-in for the two pair endpoints, invite-aware like the real ones. */
function fakeServer() {
  let issued: string | null = null;
  const calls: { path: string; body: unknown }[] = [];

  const handle = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });

    if (path === '/api/pair/start') {
      issued = 'K3M9PQ';
      return Response.json({
        coupleId: 'couple-live', memberId: 'member-a', token: 'token-a',
        invite: issued, expiresAt: Date.now() + 60_000,
      });
    }
    if (path === '/api/pair/join') {
      const code = (body as { invite?: string })?.invite;
      if (code !== issued) return Response.json({ error: 'no such invite' }, { status: 404 });
      issued = null; // single-use, like the real invites table
      return Response.json({ coupleId: 'couple-live', memberId: 'member-b', token: 'token-b' });
    }
    throw new Error(`unexpected fetch: ${path}`);
  });

  return { handle, calls };
}

beforeEach(async () => {
  await db.settings.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('receivePairingCode, live against a fake server', () => {
  it('joins on a code read aloud and typed messily, and persists the pairing', async () => {
    const server = fakeServer();
    vi.stubGlobal('fetch', server.handle);

    // The first phone starts a pairing — this is what produced the code.
    const started = await pairStart();
    expect(started.invite).toBe('K3M9PQ');

    // The second phone receives it exactly as a person types it: read aloud
    // across a room, capitalisation and a hyphen included.
    const result = await receivePairingCode('k3m - 9pq');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected to join');
    expect(result.joined).toEqual({ coupleId: 'couple-live', memberId: 'member-b', token: 'token-b' });

    // The wire call carried the normalized code, not what was typed.
    const join = server.calls.find((c) => c.path === '/api/pair/join');
    expect(join?.body).toEqual({ invite: 'K3M9PQ' });

    // And this phone's own record now says it is paired.
    const settings = await loadSettings();
    expect(settings.coupleId).toBe('couple-live');
    expect(settings.memberId).toBe('member-b');
    expect(settings.workerSecret).toBe('token-b');
  });

  it('cannot join twice on the same code, and does not touch this phone when it fails', async () => {
    const server = fakeServer();
    vi.stubGlobal('fetch', server.handle);

    await pairStart();
    const first = await receivePairingCode('K3M9PQ');
    expect(first.ok).toBe(true);

    await db.settings.clear();
    const second = await receivePairingCode('K3M9PQ');

    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('expected the second join to be refused');
    expect(second.failure.title).toBe('No pairing with that code');

    const settings = await loadSettings();
    expect(settings.coupleId).toBeUndefined();
  });
});
