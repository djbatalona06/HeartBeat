import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import {
  addXp,
  archiveTask,
  bondPet,
  completeTask,
  equipItem,
  getOrCreateAvatar,
  grantLifeEvent,
  hatchPet,
  logHabitDown,
  markLoreSeen,
  putReward,
  putTask,
  redeemReward,
  setCompanion,
  settleTasks,
  spendMp,
  startAdventure,
  unequipSlot,
} from './repository';
import { levelOf, sheetFor } from '../domain/rpg/avatar';
import { payoutFor } from '../domain/rpg/task';
import { maxPetMp, petKindById, rankOf } from '../domain/rpg/pets';
import { xpForLevel } from '../domain/xp';

/**
 * The repository is where the pure functions meet storage, and it is exactly
 * the seam where a rule gets lost. These pin the ones that would break quietly:
 * a Daily paying twice in a day, a payout landing on a task that did not save,
 * and — the one that matters most — that nothing anywhere subtracts because a
 * day went badly.
 */

const HER = 'member-a';
const HIM = 'member-b';
const COUPLE = 'couple-1';
const DAY = '2026-09-25';

beforeEach(async () => {
  await Promise.all([
    db.tasks.clear(), db.avatars.clear(), db.rewards.clear(),
    db.redemptions.clear(), db.lifeEvents.clear(), db.pets.clear(), db.pet.clear(),
  ]);
});

async function daily(over: { difficulty?: 'trivial' | 'easy' | 'medium' | 'hard' } = {}) {
  return putTask(
    { coupleId: COUPLE, memberId: HER, type: 'daily', title: 'Walk', ...over },
    DAY,
  );
}

describe('putTask', () => {
  it('creates a task settled from birth, so it is never judged for days before it existed', async () => {
    const id = await daily();
    const task = await db.tasks.get(id);
    expect(task).toMatchObject({ value: 0, streak: 0, lastSettledOn: DAY });
  });

  it('edits in place without resetting what the task is worth', async () => {
    const id = await daily();
    await completeTask(id, DAY);
    const earned = (await db.tasks.get(id))!.value;

    await putTask(
      { coupleId: COUPLE, memberId: HER, type: 'daily', title: 'Walk further' },
      '2026-09-26',
      id,
    );
    const after = (await db.tasks.get(id))!;
    expect(after.title).toBe('Walk further');
    expect(after.value).toBe(earned);
    expect(await db.tasks.count()).toBe(1);
  });
});

describe('completeTask', () => {
  it('pays the avatar, the shared pet, and moves the task value', async () => {
    const id = await daily({ difficulty: 'medium' });
    const expected = payoutFor({ difficulty: 'medium', value: 0 });

    const receipt = await completeTask(id, DAY);
    expect(receipt?.payout).toEqual(expected);

    const avatar = (await db.avatars.get(HER))!;
    expect(avatar.xp).toBe(expected.xp);
    expect(avatar.coins).toBe(expected.coins);
    expect(avatar.energy).toBe(expected.energy);
    expect((await db.pet.get(COUPLE))?.xp).toBe(expected.xp);
    expect((await db.tasks.get(id))!.value).toBeGreaterThan(0);
  });

  /** The only guard the value curve needs against being farmed. */
  it('pays a Daily once a day and no more', async () => {
    const id = await daily();
    expect(await completeTask(id, DAY)).not.toBeNull();
    expect(await completeTask(id, DAY)).toBeNull();
    expect((await db.avatars.get(HER))!.xp).toBe(payoutFor({ difficulty: 'easy', value: 0 }).xp);
  });

  it('pays the same Daily again tomorrow, for a little less', async () => {
    const id = await daily();
    const first = await completeTask(id, DAY);
    const second = await completeTask(id, '2026-09-26');
    expect(second).not.toBeNull();
    expect(second!.payout.xp).toBeLessThanOrEqual(first!.payout.xp);
  });

  it('lets a Habit be pressed as often as it happens', async () => {
    const id = await putTask(
      { coupleId: COUPLE, memberId: HER, type: 'habit', title: 'Water' },
      DAY,
    );
    expect(await completeTask(id, DAY)).not.toBeNull();
    expect(await completeTask(id, DAY)).not.toBeNull();
  });

  it('finishes a To-Do rather than resetting it', async () => {
    const id = await putTask(
      { coupleId: COUPLE, memberId: HER, type: 'todo', title: 'Book the thing' },
      DAY,
    );
    await completeTask(id, DAY);
    const task = (await db.tasks.get(id))!;
    expect(task.done).toBe(true);
    expect(task.archivedAt).toBeTruthy();
    expect(await completeTask(id, DAY)).toBeNull();
  });

  it('reports the level either side, so a level-up can be shown', async () => {
    await db.avatars.put({
      memberId: HER, coupleId: COUPLE, xp: xpForLevel(2) - 1,
      coins: 0, energy: 0, mp: 0, gear: {}, updatedAt: 1,
    });
    const receipt = await completeTask(await daily({ difficulty: 'hard' }), DAY);
    expect(receipt!.levelAfter).toBeGreaterThan(receipt!.levelBefore);
  });

  it('does nothing at all for an archived task', async () => {
    const id = await daily();
    await archiveTask(id);
    expect(await completeTask(id, DAY)).toBeNull();
    expect(await db.avatars.get(HER)).toBeUndefined();
  });
});

describe('logHabitDown', () => {
  it('moves the value down and costs nothing', async () => {
    const id = await putTask(
      { coupleId: COUPLE, memberId: HER, type: 'habit', title: 'Doomscroll' },
      DAY,
    );
    await logHabitDown(id);

    const task = (await db.tasks.get(id))!;
    expect(task.value).toBeLessThan(0);
    // No avatar row was even created: there is nothing to charge it to.
    expect(await db.avatars.get(HER)).toBeUndefined();
  });

  it('ignores a Daily, which has no minus side', async () => {
    const id = await daily();
    await logHabitDown(id);
    expect((await db.tasks.get(id))!.value).toBe(0);
  });
});

describe('settleTasks', () => {
  it('makes missed days worth more and takes nothing away', async () => {
    const id = await putTask(
      { coupleId: COUPLE, memberId: HER, type: 'daily', title: 'Walk' },
      '2026-09-21',
    );
    await getOrCreateAvatar(HER, COUPLE);
    const before = (await db.avatars.get(HER))!;

    const missed = await settleTasks(HER, DAY);
    expect(missed).toBe(3);
    expect((await db.tasks.get(id))!.value).toBeLessThan(0);
    expect(await db.avatars.get(HER)).toEqual(before);
  });

  it('can be called twice in an evening without counting a day twice', async () => {
    const id = await putTask(
      { coupleId: COUPLE, memberId: HER, type: 'daily', title: 'Walk' },
      '2026-09-21',
    );
    await settleTasks(HER, DAY);
    const once = (await db.tasks.get(id))!.value;
    expect(await settleTasks(HER, DAY)).toBe(0);
    expect((await db.tasks.get(id))!.value).toBe(once);
  });

  it('leaves the other partner\'s list alone', async () => {
    const mine = await putTask(
      { coupleId: COUPLE, memberId: HIM, type: 'daily', title: 'Walk' },
      '2026-09-21',
    );
    await settleTasks(HER, DAY);
    expect((await db.tasks.get(mine))!.value).toBe(0);
  });
});

describe('grantLifeEvent', () => {
  it('grants energy for a hard day and never takes any', async () => {
    const result = await grantLifeEvent(COUPLE, HER, 'hard-day', DAY);
    expect(result.ok).toBe(true);
    const avatar = (await db.avatars.get(HER))!;
    expect(avatar.energy).toBe(result.payout!.energy);
    expect(avatar.energy).toBeGreaterThan(avatar.xp);
  });

  it('claims once a day, and says so the second time', async () => {
    await grantLifeEvent(COUPLE, HER, 'sick-day', DAY);
    const second = await grantLifeEvent(COUPLE, HER, 'sick-day', DAY);
    expect(second.ok).toBe(false);
    expect(second.reason).toBeTruthy();
    expect(await db.lifeEvents.count()).toBe(1);
  });

  it('does not let one partner\'s claim block the other\'s', async () => {
    await grantLifeEvent(COUPLE, HER, 'sick-day', DAY);
    expect((await grantLifeEvent(COUPLE, HIM, 'sick-day', DAY)).ok).toBe(true);
  });

  describe('Good Vibes', () => {
    it('pays the recipient more than the sender', async () => {
      const result = await grantLifeEvent(COUPLE, HER, 'good-vibes', DAY, {
        fromMemberId: HIM,
        note: 'saw this and thought of you',
      });
      expect(result.ok).toBe(true);

      const her = (await db.avatars.get(HER))!;
      const him = (await db.avatars.get(HIM))!;
      expect(her.energy).toBeGreaterThan(him.energy);
      expect(him.xp).toBeGreaterThan(0);
      expect((await db.lifeEvents.toArray())[0].note).toBe('saw this and thought of you');
    });

    it('cannot be sent to yourself', async () => {
      const result = await grantLifeEvent(COUPLE, HER, 'good-vibes', DAY, { fromMemberId: HER });
      expect(result.ok).toBe(false);
      expect(await db.lifeEvents.count()).toBe(0);
    });

    it('is capped per sender per day', async () => {
      for (let i = 0; i < 3; i += 1) {
        expect((await grantLifeEvent(COUPLE, HER, 'good-vibes', DAY, { fromMemberId: HIM })).ok)
          .toBe(true);
      }
      const fourth = await grantLifeEvent(COUPLE, HER, 'good-vibes', DAY, { fromMemberId: HIM });
      expect(fourth.ok).toBe(false);
      // The other direction is untouched by his cap.
      expect((await grantLifeEvent(COUPLE, HIM, 'good-vibes', DAY, { fromMemberId: HER })).ok)
        .toBe(true);
    });
  });
});

describe('rewards', () => {
  it('spends coins and writes a redemption rather than mutating the reward', async () => {
    const rewardId = await putReward({ coupleId: COUPLE, title: 'Takeaway', cost: 10 });
    await db.avatars.put({
      memberId: HER, coupleId: COUPLE, xp: 0, coins: 25, energy: 0, mp: 0, gear: {}, updatedAt: 1,
    });

    expect((await redeemReward(rewardId, HER, DAY)).ok).toBe(true);
    expect((await db.avatars.get(HER))!.coins).toBe(15);
    expect(await db.rewards.count()).toBe(1);
    expect((await db.redemptions.toArray())[0]).toMatchObject({ title: 'Takeaway', cost: 10 });
  });

  it('refuses without spending anything, and says how far off it is', async () => {
    const rewardId = await putReward({ coupleId: COUPLE, title: 'Weekend away', cost: 500 });
    await getOrCreateAvatar(HER, COUPLE);

    const result = await redeemReward(rewardId, HER, DAY);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('500');
    expect((await db.avatars.get(HER))!.coins).toBe(0);
    expect(await db.redemptions.count()).toBe(0);
  });
});

describe('gear', () => {
  it('equips what the level allows and refuses what it does not', async () => {
    await db.avatars.put({
      memberId: HER, coupleId: COUPLE, xp: xpForLevel(5),
      coins: 0, energy: 0, mp: 0, gear: {}, updatedAt: 1,
    });

    expect((await equipItem(HER, COUPLE, 'weapon-ember-brand')).ok).toBe(true);
    expect((await db.avatars.get(HER))!.gear.weapon).toBe('weapon-ember-brand');

    const blocked = await equipItem(HER, COUPLE, 'head-aurora-veil');
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain('16');
  });

  it('lands on the sheet and comes off in one tap', async () => {
    await db.avatars.put({
      memberId: HER, coupleId: COUPLE, xp: xpForLevel(9),
      coins: 0, energy: 0, mp: 0, gear: {}, updatedAt: 1,
    });
    const bare = sheetFor((await db.avatars.get(HER))!).stats.strength;

    await equipItem(HER, COUPLE, 'weapon-comet-lance');
    await unequipSlot(HER, COUPLE, 'weapon');
    expect((await db.avatars.get(HER))!.gear.weapon).toBeUndefined();
    expect(sheetFor((await db.avatars.get(HER))!).stats.strength).toBe(bare);
  });
});

describe('companions', () => {
  it('hatches a pet from the rolls it is handed, replayably', async () => {
    const first = await hatchPet(COUPLE, HER, { rarity: 0, species: 0.1 }, 0);
    const second = await hatchPet(COUPLE, HER, { rarity: 0, species: 0.1 }, 0);
    expect(first.kindId).toBe(second.kindId);
    expect(petKindById(first.kindId)!.rarity).toBe('godly');
    expect(first.bond).toBe(0);
    expect(first.mp).toBe(0);
  });

  it('keeps the lore a reveal, recorded the moment it is shown', async () => {
    const pet = await hatchPet(COUPLE, HER, { rarity: 0.9, species: 0.5 }, 0);
    expect(pet.loreSeenAt).toBeUndefined();
    await markLoreSeen(pet.id);
    const seen = (await db.pets.get(pet.id))!.loreSeenAt;
    expect(seen).toBeTruthy();
    // Shown twice is still the first time it was shown.
    await markLoreSeen(pet.id);
    expect((await db.pets.get(pet.id))!.loreSeenAt).toBe(seen);
  });

  it('charges the companion\'s own bar when you do your own list', async () => {
    const pet = await hatchPet(COUPLE, HER, { rarity: 0.99, species: 0.9 }, 0);
    await setCompanion(HER, COUPLE, pet.id);

    const receipt = await completeTask(await daily({ difficulty: 'hard' }), DAY);
    const after = (await db.pets.get(pet.id))!;
    expect(after.bond).toBe(1);
    expect(after.mp).toBe(receipt!.payout.mp);
    expect(receipt!.companionMp).toBe(after.mp);
  });

  it('never charges the bar past what the rank holds', async () => {
    const pet = await hatchPet(COUPLE, HER, { rarity: 0.99, species: 0.9 }, 0);
    const kind = petKindById(pet.kindId)!;
    await setCompanion(HER, COUPLE, pet.id);
    await db.pets.put({ ...pet, mp: maxPetMp(kind, 1) });

    await completeTask(await daily({ difficulty: 'hard' }), DAY);
    const after = (await db.pets.get(pet.id))!;
    expect(after.mp).toBe(maxPetMp(kind, rankOf(after.bond)));
  });

  it('spends the pet\'s MP only when it has it', async () => {
    const pet = await hatchPet(COUPLE, HER, { rarity: 0.99, species: 0.9 }, 0);
    await bondPet(pet.id, 25);
    await db.pets.update(pet.id, { mp: 5 });

    const { spendPetMp } = await import('./repository');
    expect(await spendPetMp(pet.id, 9)).toBe(false);
    expect(await spendPetMp(pet.id, 5)).toBe(true);
    expect((await db.pets.get(pet.id))!.mp).toBe(0);
    expect(rankOf((await db.pets.get(pet.id))!.bond)).toBe(2);
  });
});

describe('spending', () => {
  it('refuses MP it does not have rather than going into debt', async () => {
    await getOrCreateAvatar(HER, COUPLE);
    expect(await spendMp(HER, COUPLE, 8)).toBe(false);
    expect((await db.avatars.get(HER))!.mp).toBe(0);
  });

  it('sends the pet out when the energy is there, and says how short it is when not', async () => {
    await getOrCreateAvatar(HER, COUPLE);
    const short = await startAdventure(HER, COUPLE);
    expect(short.ok).toBe(false);
    expect(short.reason).toContain('5');

    await db.avatars.update(HER, { energy: 30 });
    const gone = await startAdventure(HER, COUPLE);
    expect(gone.ok).toBe(true);
    expect(gone.hours).toBe(8);
    expect((await db.avatars.get(HER))!.energy).toBe(25);
  });

  it('bonds the companion for going out', async () => {
    const pet = await hatchPet(COUPLE, HER, { rarity: 0.99, species: 0.9 }, 0);
    await setCompanion(HER, COUPLE, pet.id);
    await db.avatars.update(HER, { energy: 30 });
    await startAdventure(HER, COUPLE);
    expect((await db.pets.get(pet.id))!.bond).toBe(2);
  });
});

describe('the ruling, at the storage layer', () => {
  /**
   * The whole point, stated as a test. Nothing a person can do in a day —
   * missing every Daily, pressing every bad habit, letting a week go by — may
   * reduce any pool. If this ever fails, the design has been lost.
   */
  it('has no path from an ordinary day to a smaller number', async () => {
    const walk = await putTask(
      { coupleId: COUPLE, memberId: HER, type: 'daily', title: 'Walk' },
      '2026-09-01',
    );
    const scroll = await putTask(
      { coupleId: COUPLE, memberId: HER, type: 'habit', title: 'Doomscroll' },
      '2026-09-01',
    );
    await completeTask(walk, '2026-09-02');
    const rich = (await db.avatars.get(HER))!;
    const richPet = (await db.pet.get(COUPLE))!;

    for (let i = 0; i < 5; i += 1) await logHabitDown(scroll);
    await settleTasks(HER, DAY);

    const after = (await db.avatars.get(HER))!;
    expect(after.xp).toBeGreaterThanOrEqual(rich.xp);
    expect(after.coins).toBeGreaterThanOrEqual(rich.coins);
    expect(after.energy).toBeGreaterThanOrEqual(rich.energy);
    expect(after.mp).toBeGreaterThanOrEqual(rich.mp);
    expect(levelOf(after)).toBeGreaterThanOrEqual(levelOf(rich));

    // The couple's pet is held to the same ruling. It is the one pool both
    // people can see, so a bad day showing up on it would be the loudest
    // version of the mistake — and it is now shared, which is a second way to
    // lose XP if a merge ever writes a smaller number over a larger one.
    const afterPet = (await db.pet.get(COUPLE))!;
    expect(afterPet.xp).toBeGreaterThanOrEqual(richPet.xp);
  });

  it('cannot be talked into a smaller pet by a negative award', async () => {
    await addXp(COUPLE, 40);
    const before = (await db.pet.get(COUPLE))!.xp;
    await addXp(COUPLE, -1000);
    expect((await db.pet.get(COUPLE))!.xp).toBe(before);
  });
});
