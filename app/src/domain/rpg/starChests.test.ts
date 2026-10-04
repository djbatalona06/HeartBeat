import { describe, expect, it } from 'vitest';
import { STAR_MILESTONES, starCount, starMilestone, starState } from './starChests';
import { ISLAND_COUNT } from './world';

describe('star chests', () => {
  it('puts two on every island: a silver at the semi-boss, a gilded at the boss', () => {
    expect(STAR_MILESTONES).toHaveLength(ISLAND_COUNT * 2);
    for (let island = 1; island <= ISLAND_COUNT; island += 1) {
      const mine = STAR_MILESTONES.filter((m) => m.island === island);
      expect(mine.map((m) => [m.stage, m.chestId])).toEqual([[4, 'silver'], [7, 'gilded']]);
    }
  });

  it('is ready once the couple has cleared it, whoever won, and stays opened once claimed', () => {
    const boss = STAR_MILESTONES[1].monsterId;
    expect(starState(boss, [])).toBe('locked');
    expect(starState(boss, [boss])).toBe('ready');
    expect(starState(boss, [boss], [boss])).toBe('opened');
  });

  it('counts only the milestones the couple has cleared', () => {
    const [first, second] = STAR_MILESTONES;
    expect(starCount([first.monsterId, second.monsterId, 'i1s1-sloth-sprout'])).toEqual({ earned: 2, total: 20 });
    expect(starMilestone('i1s1-sloth-sprout')).toBeUndefined();
  });
});
