import { describe, expect, it } from 'vitest';
import { ENEMIES, ENEMY_PREFIX, MAX_ENEMY_XP, enemiesIn, enemyById } from './enemies';
import { plainHit } from './boss';
import { baseStats } from './avatar';
import { NO_VIGOUR, statsWith, vigourOf } from './vigour';
import { RADIANCE_FULL, type Vitals } from './vitals';

function fullVitals(): Vitals {
  return {
    attributes: { vitality: 0, serenity: 0, bond: 0 },
    xp: 0,
    streak: { days: 30, shieldsSpent: 0, shieldsLeft: 0, loggedToday: true },
    radiance: RADIANCE_FULL,
    stage: { id: 'egg', name: 'Egg', blurb: '', xp: 0, streak: 0, bothRecently: false },
    next: null,
    remaining: [],
    togetherDays: 30,
    bothRecently: true,
  };
}

/** Plain hits to clear, at a given stat block. */
function hitsToBeat(maxHp: number, level: number, bonus = NO_VIGOUR): number {
  const stats = statsWith(baseStats(level), bonus);
  return Math.ceil(maxHp / plainHit(stats));
}

describe('ENEMIES', () => {
  it('gives every enemy a unique, prefixed id', () => {
    expect(new Set(ENEMIES.map((e) => e.id)).size).toBe(ENEMIES.length);
    for (const enemy of ENEMIES) expect(enemy.id.startsWith(ENEMY_PREFIX)).toBe(true);
  });

  it('gives every enemy a unique name and a blurb', () => {
    expect(new Set(ENEMIES.map((e) => e.name)).size).toBe(ENEMIES.length);
    for (const enemy of ENEMIES) expect(enemy.blurb.length, enemy.id).toBeGreaterThan(10);
  });

  it('names none of them after anybody else\'s character', () => {
    // The same guard pets.test.ts runs, for the same NOTICE.md reason.
    const forbidden = /hello kitty|sanrio|spongebob|naruto|pikachu|mickey/i;
    for (const enemy of ENEMIES) {
      expect(enemy.name, enemy.id).not.toMatch(forbidden);
      expect(enemy.blurb, enemy.id).not.toMatch(forbidden);
    }
  });

  it('keeps every reward under the ceiling', () => {
    // The local half of the anti-inflation guard. The server's MAX_AWARD_XP is
    // 5000; this keeps a mistyped 2 into 200 from ever reaching it.
    for (const enemy of ENEMIES) {
      expect(enemy.xp, enemy.id).toBeGreaterThan(0);
      expect(enemy.xp, enemy.id).toBeLessThan(MAX_ENEMY_XP);
      expect(enemy.bounty, enemy.id).toBeGreaterThan(0);
    }
  });

  it('has positive HP and power throughout', () => {
    for (const enemy of ENEMIES) {
      expect(enemy.maxHp, enemy.id).toBeGreaterThan(0);
      expect(enemy.power, enemy.id).toBeGreaterThan(0);
      expect(enemy.guile, enemy.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('orders the three into a rising ladder', () => {
    for (let i = 1; i < ENEMIES.length; i += 1) {
      expect(ENEMIES[i].maxHp).toBeGreaterThan(ENEMIES[i - 1].maxHp);
      expect(ENEMIES[i].power).toBeGreaterThan(ENEMIES[i - 1].power);
      expect(ENEMIES[i].xp).toBeGreaterThan(ENEMIES[i - 1].xp);
    }
  });

  // Hits to clear at the floor. Survivability is the other half and lives in
  // encounter.test.ts — only the snail is guaranteed winnable with nothing at
  // your back, which is the header's point.
  it('takes 4, 6 and 9 plain hits to clear at level 1 with no vigour', () => {
    expect(hitsToBeat(ENEMIES[0].maxHp, 1)).toBe(4);
    expect(hitsToBeat(ENEMIES[1].maxHp, 1)).toBe(6);
    expect(hitsToBeat(ENEMIES[2].maxHp, 1)).toBe(9);
  });

  it('takes fewer hits at level 1 with full vigour, and never more', () => {
    const full = vigourOf(fullVitals());
    for (const enemy of ENEMIES) {
      const plain = hitsToBeat(enemy.maxHp, 1);
      const rested = hitsToBeat(enemy.maxHp, 1, full);
      expect(rested, enemy.id).toBeLessThanOrEqual(plain);
    }
    expect(hitsToBeat(ENEMIES[0].maxHp, 1, full)).toBe(3);
    expect(hitsToBeat(ENEMIES[2].maxHp, 1, full)).toBe(6);
  });

  it('stays a fixed difficulty as the party levels past it', () => {
    // Deliberate: walking over the snail at level 12 is the reward for levelling.
    for (const enemy of ENEMIES) {
      expect(hitsToBeat(enemy.maxHp, 12), enemy.id)
        .toBeLessThan(hitsToBeat(enemy.maxHp, 1));
    }
  });
});

describe('enemyById', () => {
  it('finds each one', () => {
    for (const enemy of ENEMIES) expect(enemyById(enemy.id)).toBe(enemy);
  });

  it('is total for an unknown or missing id', () => {
    expect(enemyById('foe-nothing')).toBeUndefined();
    expect(enemyById(undefined)).toBeUndefined();
    expect(enemyById('')).toBeUndefined();
  });
});

describe('enemiesIn', () => {
  it('resolves ids in order', () => {
    expect(enemiesIn(['foe-wasp', 'foe-snail']).map((e) => e.id))
      .toEqual(['foe-wasp', 'foe-snail']);
  });

  it('drops unknown ids rather than returning holes', () => {
    expect(enemiesIn(['foe-snail', 'foe-nothing']).map((e) => e.id)).toEqual(['foe-snail']);
  });
});
