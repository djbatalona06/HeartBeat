import { describe, expect, it } from 'vitest';
import {
  finishedTodos, gearShelves, keptUp, ownedInSlot, ownedPets, summarize,
} from './holdings';
import { GEAR, gearById } from './gear';
import { GEAR_SLOTS, type Task } from './types';
import type { InventoryItem } from './inventory';
import type { PetInstance } from './pets';

/**
 * The ordering rules *are* the screen.
 *
 * Nothing here is arithmetic anybody would get wrong on purpose — it is a pile
 * of comparators, and a comparator that is subtly wrong does not throw. It
 * shows the second-best item first, or reshuffles a list between two renders
 * because two rows tie and nothing breaks the tie, and both of those look like
 * a UI bug for as long as it takes somebody to notice.
 */

const AT = 1_700_000_000_000;
const common = GEAR.find((g) => g.slot === 'helmet' && g.rarity === 'common')!;
const rare = GEAR.find((g) => g.slot === 'helmet' && g.rarity === 'rare')!;
const epic = GEAR.find((g) => g.slot === 'helmet' && g.rarity === 'epic')!;

function held(itemId: string, over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `inv-${itemId}`, coupleId: 'c1', memberId: 'm1', itemId,
    refine: 0, acquiredAt: AT, updatedAt: AT, ...over,
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', coupleId: 'c1', memberId: 'm1', type: 'todo', title: 'A thing',
    difficulty: 'easy', value: 0, streak: 0, createdAt: AT, updatedAt: AT, ...over,
  };
}

function pet(over: Partial<PetInstance> = {}): PetInstance {
  return {
    id: 'p1', coupleId: 'c1', memberId: 'm1', kindId: 'ribbon-cat',
    bond: 0, mp: 0, hatchedAt: AT, updatedAt: AT, ...over,
  };
}

describe('ownedInSlot', () => {
  const LEVEL = 99; // High enough that nothing is level-locked unless said.

  it('puts what is worn first, whatever else it would rank behind', () => {
    const owned = [held(epic.id), held(common.id)];
    const shelf = ownedInSlot(owned, { helmet: common.id }, 'helmet', LEVEL);
    expect(shelf[0].item.id).toBe(common.id);
    expect(shelf[0].worn).toBe(true);
    expect(shelf[1].worn).toBe(false);
  });

  it('then ranks by rarity, rarest first', () => {
    const owned = [held(common.id), held(epic.id), held(rare.id)];
    const shelf = ownedInSlot(owned, {}, 'helmet', LEVEL);
    expect(shelf.map((e) => e.item.rarity)).toEqual(['epic', 'rare', 'common']);
  });

  /**
   * The rule that is easy to get backwards. `shop.ts` sizes refinement as a
   * smaller ladder on top of the rarity budget, so a refined common never
   * catches a fresh epic — sorting refinement above rarity would put the
   * weaker item first and teach the wrong thing about the economy.
   */
  it('never lets refinement outrank rarity', () => {
    const owned = [held(common.id, { refine: 5 }), held(epic.id, { refine: 0 })];
    const shelf = ownedInSlot(owned, {}, 'helmet', LEVEL);
    expect(shelf[0].item.rarity).toBe('epic');
  });

  /**
   * Why the refinement comparator below rarity cannot fire today, stated as a
   * test rather than as a comment that would go stale. `GEAR` carries exactly
   * one item per rarity per slot and `inventory` holds one row per member per
   * item, so two entries on a shelf always differ by rarity. Add a second
   * common boot and this fails — which is the point: that is the day the
   * refinement step starts deciding real orderings and wants a test of its
   * own.
   */
  it('has one item per rarity per slot, which is what makes rarity decisive', () => {
    for (const slot of GEAR_SLOTS) {
      const inSlot = GEAR.filter((item) => item.slot === slot);
      const rarities = inSlot.map((item) => item.rarity);
      expect(new Set(rarities).size, slot).toBe(inSlot.length);
    }
  });

  it('is a total order, so two rows that tie do not swap between renders', () => {
    const a = held(rare.id, { id: 'inv-b' });
    const b = held(epic.id, { id: 'inv-a' });
    const forwards = ownedInSlot([a, b], {}, 'helmet', LEVEL).map((e) => e.row.id);
    const backwards = ownedInSlot([b, a], {}, 'helmet', LEVEL).map((e) => e.row.id);
    expect(forwards).toEqual(backwards);
    expect(forwards).toEqual(['inv-a', 'inv-b']);
  });

  it('marks an item held below its level as locked rather than hiding it', () => {
    const godly = GEAR.find((g) => g.slot === 'helmet' && g.rarity === 'godly')!;
    const shelf = ownedInSlot([held(godly.id)], {}, 'helmet', 1);
    expect(shelf).toHaveLength(1);
    expect(shelf[0].locked).toBe(true);
  });

  it('ignores rows for other slots', () => {
    const boot = GEAR.find((g) => g.slot === 'boots')!;
    expect(ownedInSlot([held(boot.id)], {}, 'helmet', LEVEL)).toEqual([]);
  });

  /** Gear can be retired from the catalogue between releases. A phone that has
   *  not updated should not white-screen its inventory over one stale row. */
  it('skips an id with no catalogue entry rather than throwing', () => {
    expect(gearById('no-such-item')).toBeUndefined();
    const shelf = ownedInSlot([held('no-such-item'), held(rare.id)], {}, 'helmet', LEVEL);
    expect(shelf.map((e) => e.item.id)).toEqual([rare.id]);
  });
});

describe('gearShelves', () => {
  it('returns every slot, including the empty ones', () => {
    const shelves = gearShelves([], {}, 1);
    expect(shelves.map((s) => s.slot)).toEqual(GEAR_SLOTS);
    for (const shelf of shelves) expect(shelf.owned).toEqual([]);
  });
});

describe('ownedPets', () => {
  it('ranks by rank, then bond', () => {
    const list = ownedPets(
      [pet({ id: 'a', bond: 0 }), pet({ id: 'b', bond: 300 }), pet({ id: 'c', bond: 25 })],
      undefined,
    );
    expect(list.map((e) => e.pet.id)).toEqual(['b', 'c', 'a']);
  });

  it('marks the active companion and only that one', () => {
    const list = ownedPets([pet({ id: 'a' }), pet({ id: 'b' })], 'b');
    expect(list.filter((e) => e.active).map((e) => e.pet.id)).toEqual(['b']);
  });

  /** A pet somebody has had since the beginning should not be pushed down the
   *  list by one hatched this morning and not yet raised. */
  it('breaks a full tie in favour of the older pet', () => {
    const list = ownedPets(
      [pet({ id: 'new', hatchedAt: AT + 9999 }), pet({ id: 'old', hatchedAt: AT })],
      undefined,
    );
    expect(list.map((e) => e.pet.id)).toEqual(['old', 'new']);
  });
});

describe('finished work', () => {
  it('lists finished to-dos, most recent first', () => {
    const list = finishedTodos([
      task({ id: 'old', done: true, archivedAt: AT }),
      task({ id: 'new', done: true, archivedAt: AT + 500 }),
    ]);
    expect(list.map((e) => e.task.id)).toEqual(['new', 'old']);
  });

  it('leaves out a to-do that is not done', () => {
    expect(finishedTodos([task({ id: 'open' })])).toEqual([]);
  });

  /** A row written before `archivedAt` existed carries `done` without it. */
  it('falls back to updatedAt when archivedAt is missing', () => {
    const [entry] = finishedTodos([task({ done: true, updatedAt: AT + 7 })]);
    expect(entry.finishedAt).toBe(AT + 7);
  });

  /**
   * The distinction the whole split exists for: a streak of 40 is not 40
   * achievements, and a finished to-do is not something that resets tomorrow.
   */
  it('keeps streaks out of the finished list, and finished out of the streaks', () => {
    const tasks = [
      task({ id: 'todo', type: 'todo', done: true, archivedAt: AT }),
      task({ id: 'daily', type: 'daily', streak: 40 }),
    ];
    expect(finishedTodos(tasks).map((e) => e.task.id)).toEqual(['todo']);
    expect(keptUp(tasks).map((e) => e.task.id)).toEqual(['daily']);
  });

  it('ranks live streaks longest first', () => {
    const list = keptUp([
      task({ id: 'short', type: 'daily', streak: 2 }),
      task({ id: 'long', type: 'habit', streak: 30 }),
    ]);
    expect(list.map((e) => e.task.id)).toEqual(['long', 'short']);
  });

  it('drops a streak on a retired task, and one that is not running', () => {
    expect(keptUp([task({ type: 'daily', streak: 9, archivedAt: AT })])).toEqual([]);
    expect(keptUp([task({ type: 'daily', streak: 0 })])).toEqual([]);
  });
});

describe('summarize', () => {
  it('counts what is held, what is on, and the best streak running', () => {
    const shelves = gearShelves(
      [held(common.id), held(rare.id)],
      { helmet: common.id },
      99,
    );
    const summary = summarize(
      shelves,
      ownedPets([pet()], undefined),
      finishedTodos([task({ done: true, archivedAt: AT })]),
      keptUp([task({ type: 'daily', streak: 12 }), task({ id: 'x', type: 'habit', streak: 4 })]),
    );
    expect(summary).toEqual({
      gearCount: 2, wornCount: 1, petCount: 1, finishedCount: 1, bestStreak: 12,
    });
  });

  it('reports zero rather than -Infinity when nothing is running', () => {
    expect(summarize([], [], [], []).bestStreak).toBe(0);
  });
});
