import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOND_BONUS, CHARGES, CHARGE_COPY, CHARGE_ELEMENT, LOGGABLE, MEND_BONUS, STYLE_BONUS, WEAKNESS_MULTIPLIER,
  chargeForElement, chargeOnWeakness, chargesFor, gardenAwardId, moveLift, payingActivities,
} from './charges';
import { RAID_STATS } from './raidStats';
import type { RaidStatsDto } from '../../features/eve-garden/engine/types';

const cs = readFileSync(resolve(__dirname, '../../../../game/HeartBeat.Game.Core/Charges.cs'), 'utf8');
const battle = readFileSync(resolve(__dirname, '../../../../game/HeartBeat.Game.Core/Battle.cs'), 'utf8');
const NO_GEAR = Object.fromEntries(RAID_STATS.map((k) => [k, 0])) as unknown as RaidStatsDto;

describe('chargesFor', () => {
  it('lights nothing on an empty day', () => {
    expect(chargesFor({ rows: [] })).toEqual([]);
  });

  it('lights a charge from any row of its activity, from either of you', () => {
    expect(chargesFor({ rows: [{ memberId: 'a', activity: 'Exercise' }] })).toEqual(['Exercise']);
    expect(chargesFor({ rows: [{ memberId: 'b', activity: 'Rest' }] })).toEqual(['Rest']);
  });

  it('lights Bond only when both of you logged', () => {
    const one = chargesFor({ rows: [{ memberId: 'a', activity: 'Mood' }, { memberId: 'a', activity: 'Exercise' }] });
    const both = chargesFor({ rows: [{ memberId: 'a', activity: 'Mood' }, { memberId: 'b', activity: 'Mood' }] });
    expect(one).not.toContain('Bond');
    expect(both).toContain('Bond');
  });

  it('lights Balance at three kinds of log, and Bond does not count as a kind', () => {
    const two = chargesFor({ rows: [{ memberId: 'a', activity: 'Mood' }, { memberId: 'b', activity: 'Exercise' }] });
    expect(two).toEqual(['Exercise', 'Mood', 'Bond']);
    const three = chargesFor({
      rows: [
        { memberId: 'a', activity: 'Mood' },
        { memberId: 'a', activity: 'Rest' },
        { memberId: 'a', activity: 'Nourish' },
      ],
    });
    expect(three).toContain('Balance');
  });

  it('pays XP only for the charges one log lights', () => {
    expect(payingActivities(['Exercise', 'Bond', 'Balance', 'Rest'])).toEqual(['Exercise', 'Rest']);
    expect(gardenAwardId('2026-09-23', 'Rest')).toBe('garden-2026-09-23-Rest');
    expect(LOGGABLE).toHaveLength(6);
  });
});

describe('moveLift', () => {
  it('is nothing with nothing lit and no gear', () => {
    for (const style of ['Physical', 'Defensive', 'Magic', 'Mend', 'Together'] as const) {
      expect(moveLift({ charges: [], stats: NO_GEAR, style }), style).toBe(0);
    }
  });

  it('lifts the move its charge feeds, and lands the weakness on hits only', () => {
    expect(moveLift({ charges: ['Exercise'], stats: NO_GEAR, style: 'Physical' })).toBe(25);
    expect(moveLift({ charges: ['Exercise'], stats: NO_GEAR, style: 'Physical', weakness: 'Movement' })).toBe(88);
    expect(moveLift({ charges: ['Exercise'], stats: NO_GEAR, style: 'Defensive', weakness: 'Movement' })).toBe(0);
    expect(moveLift({ charges: ['Rest'], stats: NO_GEAR, style: 'Mend' })).toBe(50);
  });

  it('halves a charge the monster is strong against, and never goes below nothing', () => {
    expect(moveLift({ charges: ['Rest'], stats: NO_GEAR, style: 'Mend', strength: 'Rest' })).toBe(25);
    expect(moveLift({ charges: ['Work'], stats: NO_GEAR, style: 'Physical', strength: 'Focus' })).toBe(0);
  });

  it('stacks the raid sheet on top', () => {
    const geared = { ...NO_GEAR, burden: 60 };
    expect(moveLift({ charges: [], stats: geared, style: 'Physical' })).toBeGreaterThan(0);
    expect(moveLift({ charges: ['Exercise'], stats: geared, style: 'Physical' }))
      .toBeGreaterThan(moveLift({ charges: ['Exercise'], stats: NO_GEAR, style: 'Physical' }));
  });

  it('uses the fight\'s own numbers', () => {
    expect(cs).toContain(`StyleBonus = ${STYLE_BONUS};`);
    expect(cs).toContain(`MendBonus = ${MEND_BONUS};`);
    expect(cs).toContain(`BondBonus = ${BOND_BONUS};`);
    expect(battle).toContain(`WeaknessMultiplier = ${WEAKNESS_MULTIPLIER};`);
  });
});

describe('the C# table', () => {
  it('names the same charges as the enum', () => {
    const block = /public enum Charge\s*\{([^}]*)\}/.exec(cs)![1];
    const names = block.split(',').map((n) => n.trim()).filter(Boolean);
    expect(names).toEqual([...CHARGES]);
  });

  it('agrees on every charge\'s element', () => {
    for (const charge of CHARGES) {
      expect(cs, charge).toContain(`Charge.${charge} => Element.${CHARGE_ELEMENT[charge]},`);
    }
  });

  it('prints the numbers the fight actually uses', () => {
    expect(cs).toContain('StyleBonus = 0.25;');
    expect(cs).toContain('MendBonus = 0.5;');
    expect(cs).toContain('BondBonus = 0.1;');
    expect(cs).toContain('NourishHp = 0.15;');
    expect(CHARGE_COPY.Exercise.effect).toContain('25%');
    expect(CHARGE_COPY.Rest.effect).toContain('50%');
    expect(CHARGE_COPY.Bond.effect).toContain('10%');
    expect(CHARGE_COPY.Nourish.effect).toContain('15%');
  });
});

describe('weakness', () => {
  it('finds the lit charge that hits a weakness', () => {
    expect(chargeOnWeakness(['Work', 'Exercise'], 'Movement')).toBe('Exercise');
    expect(chargeOnWeakness(['Work'], 'Movement')).toBeUndefined();
    expect(chargeOnWeakness(['Work'], undefined)).toBeUndefined();
  });

  it('answers every element with some charge', () => {
    for (const element of ['Mood', 'Movement', 'Nourishment', 'Focus', 'Rest', 'Bond', 'Balance'] as const) {
      expect(CHARGE_ELEMENT[chargeForElement(element)]).toBe(element);
    }
  });
});
