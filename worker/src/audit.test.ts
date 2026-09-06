import { describe, expect, it, vi } from 'vitest';
import { countryOf, recordAuthEvent, uaHash, type AuditDb } from './audit';

/** Captures what would have been bound, so the shape of the row is testable. */
function spyDb(): { db: AuditDb; rows: unknown[][] } {
  const rows: unknown[][] = [];
  return {
    rows,
    db: {
      prepare: () => ({
        bind: (...values: unknown[]) => ({
          run: async () => {
            rows.push(values);
            return undefined;
          },
        }),
      }),
    },
  };
}

const req = (headers: Record<string, string> = {}) => new Request('https://x/', { headers });

describe('uaHash', () => {
  it('is stable for one device and different for another', async () => {
    const a = await uaHash('Mozilla/5.0 (iPhone)');
    expect(await uaHash('Mozilla/5.0 (iPhone)')).toBe(a);
    expect(await uaHash('Mozilla/5.0 (Android)')).not.toBe(a);
  });

  it('is short enough not to be a fingerprint and is not the agent itself', async () => {
    const h = await uaHash('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(h).toHaveLength(12);
    expect(h).not.toContain('iPhone');
  });

  it('stays empty when there is no user agent, rather than hashing nothing', async () => {
    expect(await uaHash('')).toBe('');
  });
});

describe('countryOf', () => {
  it('reads what Cloudflare resolved at the edge', () => {
    expect(countryOf(req({ 'cf-ipcountry': 'CA' }))).toBe('CA');
  });

  it('is empty rather than guessing when the header is absent', () => {
    expect(countryOf(req())).toBe('');
  });
});

describe('recordAuthEvent', () => {
  it('writes the couple, the member, the kind and the detail', async () => {
    const { db, rows } = spyDb();
    await recordAuthEvent(
      db,
      req({ 'cf-ipcountry': 'US', 'user-agent': 'Mozilla/5.0' }),
      { kind: 'pair_join', coupleId: 'c1', memberId: 'm2' },
      99,
    );
    const [id, coupleId, memberId, kind, detail, country, ua, at] = rows[0];
    expect({ coupleId, memberId, kind, detail, country, at }).toEqual({
      coupleId: 'c1',
      memberId: 'm2',
      kind: 'pair_join',
      detail: '',
      country: 'US',
      at: 99,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ua).toHaveLength(12);
  });

  it('records a refusal that has no member row to point at', async () => {
    const { db, rows } = spyDb();
    await recordAuthEvent(db, req(), { kind: 'join_refused', detail: 'couple-full' }, 1);
    // The event most worth keeping is the one with nobody to attribute it to.
    expect(rows[0][2]).toBeNull();
    expect(rows[0][4]).toBe('couple-full');
  });

  it('truncates a detail rather than storing whatever was passed', async () => {
    const { db, rows } = spyDb();
    await recordAuthEvent(db, req(), { kind: 'revoke', detail: 'x'.repeat(500) }, 1);
    expect(rows[0][4]).toHaveLength(120);
  });

  it('never stores the raw user agent or anything resembling an address', async () => {
    const { db, rows } = spyDb();
    await recordAuthEvent(
      db,
      req({ 'user-agent': 'Mozilla/5.0 (iPhone)', 'cf-connecting-ip': '203.0.113.7' }),
      { kind: 'pair_start', coupleId: 'c1' },
      1,
    );
    const serialised = JSON.stringify(rows[0]);
    expect(serialised).not.toContain('203.0.113.7');
    expect(serialised).not.toContain('Mozilla');
  });

  it('swallows a database failure instead of failing the pairing it logs', async () => {
    const broken: AuditDb = {
      prepare: () => ({ bind: () => ({ run: async () => { throw new Error('d1 down'); } }) }),
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A dropped audit row is a worse record. A dropped pairing is a broken app.
    await expect(
      recordAuthEvent(broken, req(), { kind: 'pair_start', coupleId: 'c1' }, 1),
    ).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
