import { describe, expect, it } from 'vitest';
import {
  HP_BASE, HP_PER_HEART, act, beginEncounter, encounterHp, enemyMove, firstMover, fleeChance,
  hitsLeft, hpFractionOf, type CombatAction, type EncounterState, type Party,
} from './encounter';
import { ENEMIES, enemyById, type Enemy } from './enemies';
import { NO_VIGOUR, type Vigour } from './vigour';
import { baseStats } from './avatar';
import { hash } from '../hash';
import { SKILLS } from './skills';

const SNAIL = enemyById('foe-snail')!;
const WASP = enemyById('foe-wasp')!;
const SEED = hash('test-encounter');

function party(level = 1, mp = 100): Party {
  return { stats: baseStats(level), level, mp };
}

/** Play a whole fight out, alternating sides, until it ends or the cap trips. */
function playOut(
  enemy: Enemy,
  p: Party,
  action: CombatAction = { kind: 'hit' },
  vigour: Vigour = NO_VIGOUR,
  seed = SEED,
  cap = 400,
): EncounterState {
  let state = beginEncounter(enemy, p, vigour, seed);
  for (let i = 0; i < cap && state.outcome === 'fighting'; i += 1) {
    state = state.turn === 'you' ? act(state, action, enemy, p) : enemyMove(state, enemy);
  }
  return state;
}

describe('encounterHp', () => {
  it('is the base plus heart plus the streak bonus', () => {
    expect(encounterHp(baseStats(1), NO_VIGOUR)).toBe(HP_BASE + HP_PER_HEART);
  });

  it('never counts a negative heart or a negative bonus against you', () => {
    const odd = { strength: 0, insight: 0, heart: -50, luck: 0 };
    expect(encounterHp(odd, { ...NO_VIGOUR, hpBonus: -100 })).toBe(HP_BASE);
  });

  it('rises with heart', () => {
    expect(encounterHp(baseStats(5), NO_VIGOUR))
      .toBeGreaterThan(encounterHp(baseStats(1), NO_VIGOUR));
  });
});

describe('beginEncounter', () => {
  it('starts both sides at full', () => {
    const state = beginEncounter(SNAIL, party(), NO_VIGOUR, SEED);
    expect(state.you.hp).toBe(state.you.maxHp);
    expect(state.them.hp).toBe(SNAIL.maxHp);
    expect(state.them.maxHp).toBe(SNAIL.maxHp);
    expect(state.outcome).toBe('fighting');
    expect(state.you.shield).toBe(0);
    expect(state.energyOwed).toBe(0);
  });

  it('is pure — the same arguments twice give the same state', () => {
    // No clock, no Math.random. This is what makes a fight replayable.
    expect(beginEncounter(SNAIL, party(), NO_VIGOUR, SEED))
      .toEqual(beginEncounter(SNAIL, party(), NO_VIGOUR, SEED));
  });

  it('opens the log with the enemy blurb', () => {
    expect(beginEncounter(SNAIL, party(), NO_VIGOUR, SEED).log[0].text).toBe(SNAIL.blurb);
  });

  it('decides turn order once, at the start', () => {
    const state = beginEncounter(WASP, party(), NO_VIGOUR, SEED);
    const again = beginEncounter(WASP, party(), NO_VIGOUR, SEED);
    expect(state.turn).toBe(again.turn);
  });
});

describe('firstMover', () => {
  it('gives you the first move when luck meets guile', () => {
    expect(firstMover(baseStats(10), SNAIL, SEED)).toBe('you');
  });

  it('is one of the two sides whatever the numbers', () => {
    for (const enemy of ENEMIES) {
      for (const level of [1, 3, 20]) {
        expect(['you', 'them']).toContain(firstMover(baseStats(level), enemy, SEED));
      }
    }
  });
});

describe('act', () => {
  it('takes HP off the enemy', () => {
    let state = beginEncounter(SNAIL, party(), NO_VIGOUR, SEED);
    if (state.turn === 'them') state = enemyMove(state, SNAIL);
    const after = act(state, { kind: 'hit' }, SNAIL, party());
    expect(after.them.hp).toBeLessThan(state.them.hp);
    expect(after.turn).toBe('them');
  });

  // The real bug class in a fast-tapping overlay.
  it('is the identity on a finished encounter', () => {
    const done = playOut(SNAIL, party(20));
    expect(done.outcome).not.toBe('fighting');
    expect(act(done, { kind: 'hit' }, SNAIL, party(20))).toBe(done);
    expect(enemyMove(done, SNAIL)).toBe(done);
  });

  it('is the identity when it is not your turn', () => {
    const state: EncounterState = { ...beginEncounter(SNAIL, party(), NO_VIGOUR, SEED), turn: 'them' };
    expect(act(state, { kind: 'hit' }, SNAIL, party())).toBe(state);
  });

  it('refuses an unknown skill with a line rather than throwing', () => {
    let state = beginEncounter(SNAIL, party(), NO_VIGOUR, SEED);
    if (state.turn === 'them') state = enemyMove(state, SNAIL);
    const after = act(state, { kind: 'skill', skillId: 'no-such-skill' }, SNAIL, party());
    expect(after.log.length).toBe(state.log.length + 1);
    expect(after.them.hp).toBe(state.them.hp);
    expect(after.turn).toBe('you');
  });

  it('refuses an unaffordable skill without costing a turn', () => {
    const skill = SKILLS[0];
    let state = beginEncounter(SNAIL, party(skill.minLevel, 0), NO_VIGOUR, SEED);
    if (state.turn === 'them') state = enemyMove(state, SNAIL);
    const broke = party(skill.minLevel, 0);
    const after = act(state, { kind: 'skill', skillId: skill.id }, SNAIL, broke);
    expect(after.them.hp).toBe(state.them.hp);
    expect(after.turn).toBe('you');
  });

  it('lands a skill the party can afford, and hits harder than a plain swing', () => {
    const ember = SKILLS[0];
    const p = party(ember.minLevel, 100);
    let state = beginEncounter(WASP, p, NO_VIGOUR, SEED);
    if (state.turn === 'them') state = enemyMove(state, WASP);
    const plain = act(state, { kind: 'hit' }, WASP, p);
    const cast = act(state, { kind: 'skill', skillId: ember.id }, WASP, p);
    expect(cast.them.hp).toBeLessThan(plain.them.hp);
  });

  it('turns a warding skill into shield rather than damage', () => {
    const ward = SKILLS.find((s) => s.effect.shield !== undefined)!;
    const p = party(ward.minLevel, 100);
    let state = beginEncounter(WASP, p, NO_VIGOUR, SEED);
    if (state.turn === 'them') state = enemyMove(state, WASP);
    const after = act(state, { kind: 'skill', skillId: ward.id }, WASP, p);
    expect(after.you.shield).toBeGreaterThan(0);
  });

  it('never heals past full', () => {
    const bloom = SKILLS.find((s) => s.effect.heal !== undefined)!;
    const p = party(bloom.minLevel, 100);
    let state = beginEncounter(WASP, p, NO_VIGOUR, SEED);
    if (state.turn === 'them') state = enemyMove(state, WASP);
    const after = act(state, { kind: 'skill', skillId: bloom.id }, WASP, p);
    expect(after.you.hp).toBeLessThanOrEqual(after.you.maxHp);
  });

  it('banks energy for the repository instead of applying it', () => {
    const wind = SKILLS.find((s) => s.effect.energy !== undefined)!;
    const p = party(wind.minLevel, 100);
    let state = beginEncounter(WASP, p, NO_VIGOUR, SEED);
    if (state.turn === 'them') state = enemyMove(state, WASP);
    const after = act(state, { kind: 'skill', skillId: wind.id }, WASP, p);
    expect(after.energyOwed).toBeGreaterThan(0);
  });
});

describe('shield', () => {
  it('absorbs before HP does, and is spent doing it', () => {
    const state: EncounterState = {
      ...beginEncounter(WASP, party(), NO_VIGOUR, SEED),
      turn: 'them',
      you: { hp: 50, maxHp: 50, shield: 1000 },
    };
    const after = enemyMove(state, WASP);
    expect(after.you.hp).toBe(50);
    expect(after.you.shield).toBeLessThan(1000);
  });

  it('never goes negative', () => {
    const state: EncounterState = {
      ...beginEncounter(WASP, party(), NO_VIGOUR, SEED),
      turn: 'them',
      you: { hp: 500, maxHp: 500, shield: 1 },
    };
    expect(enemyMove(state, WASP).you.shield).toBeGreaterThanOrEqual(0);
  });
});

describe('outcomes', () => {
  it('reaches won at a high level', () => {
    expect(playOut(SNAIL, party(20)).outcome).toBe('won');
  });

  // Both ends of the promise: the floor case is winnable, and losing is possible.
  it('is winnable at level 1 with no vigour at all', () => {
    expect(playOut(SNAIL, party(1)).outcome).toBe('won');
  });

  it('can reach down against the hardest thing in the garden', () => {
    const weak: Party = { stats: { strength: 0, insight: 0, heart: 0, luck: 0 }, level: 1, mp: 0 };
    expect(playOut(WASP, weak).outcome).toBe('down');
  });

  it('calls losing "down" — there is nothing to lose', () => {
    const weak: Party = { stats: { strength: 0, insight: 0, heart: 0, luck: 0 }, level: 1, mp: 0 };
    const done = playOut(WASP, weak);
    expect(done.outcome).toBe('down');
    expect(done.outcome).not.toBe('lost');
  });

  it('always terminates', () => {
    for (const enemy of ENEMIES) {
      for (const level of [1, 2, 5, 12]) {
        expect(playOut(enemy, party(level)).outcome, `${enemy.id} L${level}`).not.toBe('fighting');
      }
    }
  });
});

describe('bounds', () => {
  it('never lets either side go below zero or above full', () => {
    for (const enemy of ENEMIES) {
      for (const level of [1, 3, 12]) {
        let state = beginEncounter(enemy, party(level), NO_VIGOUR, SEED);
        for (let i = 0; i < 200 && state.outcome === 'fighting'; i += 1) {
          state = state.turn === 'you'
            ? act(state, { kind: 'hit' }, enemy, party(level))
            : enemyMove(state, enemy);
          expect(state.you.hp).toBeGreaterThanOrEqual(0);
          expect(state.you.hp).toBeLessThanOrEqual(state.you.maxHp);
          expect(state.them.hp).toBeGreaterThanOrEqual(0);
          expect(state.them.hp).toBeLessThanOrEqual(state.them.maxHp);
          expect(state.you.shield).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('determinism', () => {
  it('replays the same fight from the same seed', () => {
    const a = playOut(WASP, party(3));
    const b = playOut(WASP, party(3));
    expect(a.log).toEqual(b.log);
    expect(a.outcome).toBe(b.outcome);
    expect(a.them.hp).toBe(b.them.hp);
  });

  it('plays differently from a different seed', () => {
    const a = playOut(WASP, party(2), { kind: 'hit' }, NO_VIGOUR, hash('one'));
    const b = playOut(WASP, party(2), { kind: 'hit' }, NO_VIGOUR, hash('two'));
    expect(a.log.map((l) => l.text)).not.toEqual(b.log.map((l) => l.text));
  });
});

describe('flee', () => {
  it('stays a real chance in both directions', () => {
    for (const enemy of ENEMIES) {
      for (const level of [1, 10, 40]) {
        const chance = fleeChance(baseStats(level), enemy);
        expect(chance).toBeGreaterThan(0);
        expect(chance).toBeLessThan(1);
      }
    }
  });

  it('either gets away or hands over the turn', () => {
    let state = beginEncounter(SNAIL, party(), NO_VIGOUR, SEED);
    if (state.turn === 'them') state = enemyMove(state, SNAIL);
    const after = act(state, { kind: 'flee' }, SNAIL, party());
    expect(after.outcome === 'fled' || after.turn === 'them').toBe(true);
  });
});

describe('vigour in a fight', () => {
  const rested: Vigour = {
    bonus: { strength: 3, insight: 3, heart: 3, luck: 3 },
    hpBonus: 20, note: '', plain: false,
  };

  it('shortens a fight that was already winnable', () => {
    const plain = playOut(SNAIL, party(1), { kind: 'hit' }, NO_VIGOUR);
    const good = playOut(SNAIL, party(1), { kind: 'hit' }, rested);
    expect(plain.outcome).toBe('won');
    expect(good.outcome).toBe('won');
    expect(good.log.length).toBeLessThanOrEqual(plain.log.length);
  });

  // The buff, doing what a buff does: opening something up, not being required.
  // The wasp at level 1 is the far end of the garden — see the note in
  // enemies.ts on why that is progression and not a penalty.
  it('can turn the hardest fight in the garden from down to won', () => {
    expect(playOut(WASP, party(1), { kind: 'hit' }, NO_VIGOUR).outcome).toBe('down');
    expect(playOut(WASP, party(1), { kind: 'hit' }, rested).outcome).toBe('won');
  });

  it('never turns a won fight into a lost one, for any enemy or level', () => {
    // The rule that matters: vigour is incapable of making things worse.
    for (const enemy of ENEMIES) {
      for (const level of [1, 2, 5, 12]) {
        const plain = playOut(enemy, party(level), { kind: 'hit' }, NO_VIGOUR);
        if (plain.outcome !== 'won') continue;
        expect(playOut(enemy, party(level), { kind: 'hit' }, rested).outcome,
          `${enemy.id} L${level}`).toBe('won');
      }
    }
  });

  it('leaves walking away available however bad the matchup', () => {
    const weak: Party = { stats: { strength: 0, insight: 0, heart: 0, luck: 0 }, level: 1, mp: 0 };
    expect(fleeChance(weak.stats, WASP)).toBeGreaterThan(0);
  });
});

describe('readouts', () => {
  it('reports hits left, and reaches zero on a win', () => {
    const done = playOut(SNAIL, party(20));
    expect(hitsLeft(done, baseStats(20))).toBe(0);
  });

  it('keeps hpFractionOf inside [0, 1]', () => {
    expect(hpFractionOf({ hp: 5, maxHp: 10, shield: 0 })).toBe(0.5);
    expect(hpFractionOf({ hp: -5, maxHp: 10, shield: 0 })).toBe(0);
    expect(hpFractionOf({ hp: 50, maxHp: 10, shield: 0 })).toBe(1);
    expect(hpFractionOf({ hp: 1, maxHp: 0, shield: 0 })).toBe(0);
  });
});

describe('the ruling', () => {
  it('keeps health inside the encounter and nowhere else', () => {
    // A guard on the design, not the code: nothing in this module may reach the
    // database, and nothing in the database may grow a health field.
    const state = beginEncounter(SNAIL, party(), NO_VIGOUR, SEED);
    expect(Object.keys(state).sort()).toEqual([
      'enemyId', 'energyOwed', 'log', 'outcome', 'round', 'seed', 'them', 'turn', 'you',
    ]);
  });
});
