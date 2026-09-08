import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_STACK, buildReport, sendReport } from './crashReport';

/** A crash report is the one message that arrives because something already
 *  broke, so the tests here are mostly about it never being the second fault. */
describe('buildReport', () => {
  const err = () => Object.assign(new Error('boom'), { stack: 'Error: boom\n  at x' });

  it('carries the message, stack, route and scope', () => {
    const r = buildReport('route', err(), '\n  at <Mood>', '#/mood', 1000);
    expect(r).toMatchObject({
      scope: 'route',
      message: 'boom',
      stack: 'Error: boom\n  at x',
      componentStack: '\n  at <Mood>',
      route: '#/mood',
      at: 1000,
    });
  });

  it('truncates a runaway stack rather than posting megabytes from a phone', () => {
    const big = Object.assign(new Error('x'), { stack: 'y'.repeat(MAX_STACK * 3) });
    const r = buildReport('app', big, 'z'.repeat(MAX_STACK * 3), '/', 0);
    expect(r.stack).toHaveLength(MAX_STACK);
    expect(r.componentStack).toHaveLength(MAX_STACK);
  });

  it('survives an error with no stack at all', () => {
    const bare = new Error('bare');
    bare.stack = undefined;
    const r = buildReport('app', bare, null, '/', 0);
    expect(r.stack).toBe('');
    expect(r.componentStack).toBe('');
  });
});

describe('sendReport', () => {
  const report = buildReport('app', new Error('boom'), null, '/', 5);
  afterEach(() => vi.unstubAllGlobals());

  it('posts nothing at all when the phone is not paired', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await sendReport(report, null);
    // An anonymous write endpoint would be a way into the couple's database.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the bearer and keeps the request alive past the crash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await sendReport(report, 'tok');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('api/crash');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toMatchObject({ scope: 'app', message: 'boom' });
  });

  it('swallows a network failure instead of throwing inside the boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    // The boundary awaits this. If it rejected, the fallback would itself throw.
    await expect(sendReport(report, 'tok')).resolves.toBeUndefined();
  });
});
