import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, saveSettings } from '../db/database';
import { addXp, awardBossVictory, awardPetXp, bossVictoryXp, seedLegacyPetXp } from '../db/repository';
import { FLUSH_CHUNK, MAX_AWARD_XP, flushPetXp, mergePetXp } from './petSync';

/**
 * The two ways a shared, additive number goes wrong quietly.
 *
 * It can be double-counted — a phone posts, loses the connection and retries,
 * or both partners report the same victory — and the pet ends up paid twice for
 * one thing. Or it can go backwards, when an answer that predates a local gain
 * is written over the top of it, which is the one thing the design says must
 * never happen to any pool in this app.
 */

const COUPLE = 'couple-1';
const TOKEN = 'bearer-token';

const AWARD = { id: 'award-1', amount: 40, awardedAt: 1_000 };
const OTHER_AWARD = { id: 'award-2', amount: 25, awardedAt: 2_000 };

/** What the endpoint answers with: the couple total, and what it has on record. */
function reply(xp: number, settled: string[]) {
  return {
    ok: true,
    json: async () => ({ xp, level: 1, mood: 'content', fedAt: 0, settled }),
  };
}

interface Call {
  init?: { method?: string; body?: string };
}

/** Stands in for the network, and keeps what was sent so it can be read back. */
function stubFetch(answer: () => unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (_url: string, init?: Call['init']) => {
    calls.push({ init });
    return answer();
  });
  return calls;
}

beforeEach(async () => {
  await Promise.all([db.pet.clear(), db.settings.clear()]);
  await saveSettings({ coupleId: COUPLE, workerSecret: TOKEN });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mergePetXp', () => {
  it('takes the couple total when the server has more than this phone knew', () => {
    const merged = mergePetXp({ xp: 40, sharedXp: 0, pendingXp: [] }, 90, []);
    expect(merged.sharedXp).toBe(90);
    expect(merged.xp).toBe(90);
  });

  it('keeps the local bar when it is ahead of what the server has counted', () => {
    // The gain is queued but not handed over yet. Writing 0 over 40 here is
    // exactly the "shared pet loses XP" bug this endpoint exists to avoid.
    const merged = mergePetXp({ xp: 40, sharedXp: 0, pendingXp: [AWARD] }, 0, []);
    expect(merged.xp).toBe(40);
  });

  it('never lowers the shared total it already had', () => {
    const merged = mergePetXp({ xp: 90, sharedXp: 90, pendingXp: [] }, 25, []);
    expect(merged.sharedXp).toBe(90);
    expect(merged.xp).toBe(90);
  });

  it('drops the awards the server names and keeps the ones it does not', () => {
    const merged = mergePetXp(
      { xp: 65, sharedXp: 0, pendingXp: [AWARD, OTHER_AWARD] },
      40,
      [AWARD.id],
    );
    expect(merged.pendingXp).toEqual([OTHER_AWARD]);
  });

  it('starts a phone that has never had a pet from nothing rather than undefined', () => {
    expect(mergePetXp(undefined, 120, [])).toEqual({ xp: 120, sharedXp: 120, pendingXp: [] });
  });
});

describe('awardPetXp', () => {
  it('queues the gain as well as showing it', async () => {
    await awardPetXp(COUPLE, 'a', 40);
    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.xp).toBe(40);
    expect(pet.pendingXp?.map((a) => a.id)).toEqual(['a']);
  });

  it('counts an award once however often it is reported', async () => {
    await awardPetXp(COUPLE, 'a', 40);
    await awardPetXp(COUPLE, 'a', 40);
    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.xp).toBe(40);
    expect(pet.pendingXp).toHaveLength(1);
  });

  it('treats a number that is not one as no gain rather than poisoning the bar', async () => {
    // A NaN in `xp` never moves again: every comparison against it is false,
    // so the bar would be stuck for good, and the queued award would be
    // refused by the endpoint on every flush from then on.
    await awardPetXp(COUPLE, 'a', 40);
    await awardPetXp(COUPLE, 'broken', Number.NaN);
    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.xp).toBe(40);
    expect(pet.pendingXp!.every((a) => Number.isInteger(a.amount))).toBe(true);
  });

  it('moves nothing when handed a loss', async () => {
    await awardPetXp(COUPLE, 'a', 40);
    await awardPetXp(COUPLE, 'sabotage', -1000);
    expect((await db.pet.get(COUPLE))!.xp).toBe(40);
  });

  it('remembers a bounded number of ids rather than growing forever', async () => {
    for (let i = 0; i < 40; i += 1) await awardPetXp(COUPLE, `a-${i}`, 1);
    expect((await db.pet.get(COUPLE))!.awardedXpIds).toHaveLength(32);
  });
});

describe('addXp', () => {
  it('cannot take XP off the couple pet', async () => {
    await addXp(COUPLE, 40);
    await addXp(COUPLE, -40);
    expect((await db.pet.get(COUPLE))!.xp).toBe(40);
  });
});

describe('awardBossVictory', () => {
  it('pays the tier once, however many phones report it', async () => {
    await awardBossVictory(COUPLE, 3);
    await awardBossVictory(COUPLE, 3);
    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.xp).toBe(bossVictoryXp(3));
    expect(pet.pendingXp).toHaveLength(1);
  });

  it('scales with the fight, and pays a later tier on top', async () => {
    expect(bossVictoryXp(1)).toBe(120);
    expect(bossVictoryXp(2)).toBeGreaterThan(bossVictoryXp(1));
    await awardBossVictory(COUPLE, 1);
    await awardBossVictory(COUPLE, 2);
    expect((await db.pet.get(COUPLE))!.xp).toBe(bossVictoryXp(1) + bossVictoryXp(2));
  });
});

describe('flushPetXp', () => {
  it('hands the queue over and settles what the server confirms', async () => {
    await awardPetXp(COUPLE, 'a', 40);
    stubFetch(() => reply(40, ['a']));

    const result = await flushPetXp();
    expect(result).toMatchObject({ pushed: 1, xp: 40, sharedXp: 40 });
    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.pendingXp).toEqual([]);
    expect(pet.sharedXp).toBe(40);
  });

  it('brings back what the other phone earned even with nothing to say', async () => {
    const calls = stubFetch(() => reply(200, []));

    await flushPetXp();
    // A GET, not a POST: there is nothing to hand over, only something to hear.
    expect(calls[0]!.init?.method).toBeUndefined();
    expect((await db.pet.get(COUPLE))!.xp).toBe(200);
  });

  it('keeps the queue when the round trip fails, so nothing is lost offline', async () => {
    await awardPetXp(COUPLE, 'a', 40);
    stubFetch(() => ({ ok: false, status: 503, json: async () => ({}) }));

    await expect(flushPetXp()).rejects.toThrow('503');
    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.pendingXp).toHaveLength(1);
    expect(pet.xp).toBe(40);
  });

  it('does nothing at all until the device is paired', async () => {
    await db.settings.clear();
    const calls = stubFetch(() => reply(0, []));

    expect(await flushPetXp()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('hands over one page at a time rather than a request the server refuses', async () => {
    for (let i = 0; i < FLUSH_CHUNK + 5; i += 1) await awardPetXp(COUPLE, `a-${i}`, 1);
    const calls = stubFetch(() => reply(FLUSH_CHUNK, []));

    const result = await flushPetXp();
    expect(result!.pushed).toBe(FLUSH_CHUNK);
    const sent = JSON.parse(calls[0]!.init!.body!) as { awards: unknown[] };
    expect(sent.awards).toHaveLength(FLUSH_CHUNK);
  });

  it('keeps a gain made while the round trip was still in the air', async () => {
    await awardPetXp(COUPLE, 'a', 40);
    // The flush read the row before it left. A task ticked off mid-flight is
    // in the row by the time the answer lands, and merging against the older
    // copy would write it back out — permanently, since its id is already
    // remembered and nothing would ever add it again.
    stubFetch(async () => {
      await awardPetXp(COUPLE, 'b', 10);
      return reply(40, ['a']);
    });

    await flushPetXp();
    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.xp).toBe(50);
    expect(pet.pendingXp!.map((a) => a.id)).toEqual(['b']);
  });

  it('drops an award the server will never take rather than wedging the queue', async () => {
    await awardPetXp(COUPLE, 'huge', MAX_AWARD_XP + 1);
    await awardPetXp(COUPLE, 'fine', 10);
    stubFetch(() => ({ ok: false, status: 400, json: async () => ({}) }));

    await expect(flushPetXp()).rejects.toThrow('400');
    const pet = (await db.pet.get(COUPLE))!;
    // The good one keeps its place; the one the endpoint refuses is gone, so
    // it cannot sit at the front of the queue holding up everything behind it.
    expect(pet.pendingXp!.map((a) => a.id)).toEqual(['fine']);
    expect(pet.xp).toBe(MAX_AWARD_XP + 1 + 10);
  });

  it('keeps the queue when a refusal names nothing it can blame', async () => {
    await awardPetXp(COUPLE, 'a', 40);
    stubFetch(() => ({ ok: false, status: 400, json: async () => ({}) }));

    await expect(flushPetXp()).rejects.toThrow('400');
    expect((await db.pet.get(COUPLE))!.pendingXp).toHaveLength(1);
  });

  it('leaves the bar where it is when a stale answer comes back low', async () => {
    await awardPetXp(COUPLE, 'a', 40);
    // The other phone's flush already pushed the total to 200; this answer
    // predates it. Taking it at face value would cost the couple 160 XP.
    stubFetch(() => reply(200, ['a']));
    await flushPetXp();
    stubFetch(() => reply(40, []));
    await flushPetXp();

    expect((await db.pet.get(COUPLE))!.xp).toBe(200);
  });
});

/**
 * Couples were using this before the pet was shared, and each of their phones
 * holds a local total the server has never been told about. Getting the upgrade
 * wrong is silent in both directions: seed nothing and the bar appears to stall
 * until the shared total overtakes a year of history; seed it as a fresh gain
 * and every phone doubles its own past.
 */
describe('seeding a pre-feature install', () => {
  it('queues the local total without moving the bar', async () => {
    await db.pet.put({ coupleId: COUPLE, level: 1, xp: 400, mood: 'content', fedAt: 1 });

    const parts = await seedLegacyPetXp(COUPLE, 'her-phone');

    const pet = (await db.pet.get(COUPLE))!;
    expect(parts).toBe(1);
    expect(pet.xp).toBe(400);
    expect(pet.pendingXp!.map((a) => a.amount)).toEqual([400]);
    expect(pet.sharedXp).toBe(0);
  });

  it('runs once, however often it is called', async () => {
    await db.pet.put({ coupleId: COUPLE, level: 1, xp: 400, mood: 'content', fedAt: 1 });
    await seedLegacyPetXp(COUPLE, 'her-phone');
    await seedLegacyPetXp(COUPLE, 'her-phone');

    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.pendingXp).toHaveLength(1);
    expect(pet.xp).toBe(400);
  });

  it('splits a long history into awards the endpoint will accept', async () => {
    await db.pet.put({ coupleId: COUPLE, level: 9, xp: 12_500, mood: 'content', fedAt: 1 });

    await seedLegacyPetXp(COUPLE, 'his-phone');

    const pet = (await db.pet.get(COUPLE))!;
    expect(pet.pendingXp!.map((a) => a.amount)).toEqual([MAX_AWARD_XP, MAX_AWARD_XP, 2500]);
    expect(pet.pendingXp!.every((a) => a.amount <= MAX_AWARD_XP)).toBe(true);
    expect(pet.xp).toBe(12_500);
  });

  it('leaves a row that has already settled with the server alone', async () => {
    await db.pet.put({
      coupleId: COUPLE, level: 1, xp: 400, mood: 'content', fedAt: 1,
      sharedXp: 250, awardedXpIds: ['boss-1'],
    });

    expect(await seedLegacyPetXp(COUPLE, 'her-phone')).toBe(0);
    expect((await db.pet.get(COUPLE))!.pendingXp ?? []).toHaveLength(0);
  });

  it('has nothing to say about a phone that starts empty', async () => {
    expect(await seedLegacyPetXp(COUPLE, 'her-phone')).toBe(0);
  });

  /** The boss curve outgrows the endpoint's ceiling; the reward must still arrive. */
  it('never asks the endpoint to take more than one award may carry', () => {
    for (const tier of [1, 5, 10, 17, 18, 25, 40]) {
      expect(bossVictoryXp(tier), `tier ${tier}`).toBeLessThanOrEqual(MAX_AWARD_XP);
    }
    expect(bossVictoryXp(40)).toBe(MAX_AWARD_XP);
  });
});
