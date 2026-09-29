import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anonymousId, configured, scrub, track, type TrackContext,
} from '../../app/functions/api/_track';
import type { Env } from '../../app/functions/api/_lib';

/**
 * The privacy claim in the README is "anonymous server-side counts, never your
 * entries". These tests are that claim, executed: a property that looks like
 * content is dropped, an id is never sent raw, and with no key nothing leaves.
 */

function context(overrides: Partial<Env> = {}) {
  const waited: Promise<unknown>[] = [];
  const ctx: TrackContext = {
    env: { POSTHOG_KEY: 'test-key', POSTHOG_SALT: 'test-salt', ...overrides } as Env,
    waitUntil: (promise) => { waited.push(promise); },
  };
  return { ctx, waited };
}

afterEach(() => vi.unstubAllGlobals());

describe('scrub', () => {
  it('keeps counts, flags and short enums', () => {
    expect(scrub({ entries: 3, capped: true, kind: 'deck' })).toEqual({
      entries: 3, capped: true, kind: 'deck',
    });
  });

  it('drops anything named like content or a credential', () => {
    const out = scrub({
      token: 'abc', invite: 'ABC234', body: 'hi', payload: 'x', displayName: 'A', note: 'n',
      timeZone: 'UTC', email: 'a@b.c', photo: 'p', message: 'm', kind: 'ok',
    });
    expect(out).toEqual({ kind: 'ok' });
  });

  it('drops prose, objects, arrays and non-finite numbers', () => {
    const out = scrub({
      kind: 'x'.repeat(65), nested: { a: 1 }, list: [1], bad: Number.NaN, inf: Infinity, fine: 1,
    });
    expect(out).toEqual({ fine: 1 });
  });
});

describe('anonymousId', () => {
  it('is stable, salted and never contains the input', async () => {
    const a = await anonymousId('salt', 'member-1');
    expect(a).toBe(await anonymousId('salt', 'member-1'));
    expect(a).not.toBe(await anonymousId('other', 'member-1'));
    expect(a).not.toBe(await anonymousId('salt', 'member-2'));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain('member');
  });
});

describe('configured', () => {
  it('needs both the key and the salt', () => {
    expect(configured({} as Env)).toBeNull();
    expect(configured({ POSTHOG_KEY: 'k' } as Env)).toBeNull();
    expect(configured({ POSTHOG_SALT: 's' } as Env)).toBeNull();
    expect(configured({ POSTHOG_KEY: ' k ', POSTHOG_SALT: ' s ' } as Env)).toMatchObject({
      key: 'k', salt: 's', host: 'https://us.i.posthog.com', environment: 'production',
    });
  });
});

describe('track', () => {
  it('does nothing at all when unconfigured', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { ctx, waited } = context({ POSTHOG_KEY: undefined });
    track(ctx, 'pair_started', { memberId: 'm', coupleId: 'c' });
    expect(waited).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends hashed ids, no person profile, and only scrubbed properties', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    const { ctx, waited } = context({ POSTHOG_ENV: 'preview' });

    track(ctx, 'study_session_credited', { memberId: 'member-1', coupleId: 'couple-1' }, {
      kind: 'deck', xp: 20, capped: false, token: 'secret',
    });
    await Promise.all(waited);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://us.i.posthog.com/i/v0/e/');
    const sent = JSON.parse(init.body as string);
    expect(sent.event).toBe('study_session_credited');
    expect(sent.properties).toMatchObject({
      kind: 'deck', xp: 20, capped: false, $process_person_profile: false, app_env: 'preview',
    });
    expect(sent.properties.token).toBeUndefined();
    expect(sent.distinct_id).toMatch(/^[0-9a-f]{32}$/);
    expect(sent.properties.$groups.couple).toMatch(/^[0-9a-f]{32}$/);
    expect(init.body as string).not.toContain('member-1');
    expect(init.body as string).not.toContain('couple-1');
  });

  it('uses a shared anonymous id when nobody is known', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    const { ctx, waited } = context();
    track(ctx, 'pair_failed', {}, { reason: 'no-such-invite' });
    await Promise.all(waited);
    const sent = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.distinct_id).toBe('anonymous');
    expect(sent.properties.$groups).toBeUndefined();
  });

  it('never lets a failing endpoint break the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { ctx, waited } = context();
    track(ctx, 'ask_used', { memberId: 'm' });
    await expect(Promise.all(waited)).resolves.toBeDefined();
  });
});
