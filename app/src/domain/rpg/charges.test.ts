import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARGES, CHARGE_COPY, CHARGE_ELEMENT, chargeForElement, chargeOnWeakness, chargesFor, gardenAwardId,
} from './charges';

const day = '2026-09-23';
const cs = readFileSync(resolve(__dirname, '../../../../game/HeartBeat.Game.Core/Charges.cs'), 'utf8');

describe('chargesFor', () => {
  it('lights nothing on an empty day', () => {
    expect(chargesFor({ day, rows: [], awardIds: [] })).toEqual([]);
  });

  it('lights a charge from a row or from the garden award, whichever came first', () => {
    expect(chargesFor({ day, rows: [{ memberId: 'a', activity: 'Exercise' }], awardIds: [] }))
      .toEqual(['Exercise']);
    expect(chargesFor({ day, rows: [], awardIds: [gardenAwardId(day, 'Rest')] })).toEqual(['Rest']);
  });

  it('ignores yesterday\'s award', () => {
    expect(chargesFor({ day, rows: [], awardIds: [gardenAwardId('2026-09-22', 'Rest')] })).toEqual([]);
  });

  it('lights Bond only when both of you logged', () => {
    const one = chargesFor({
      day, rows: [{ memberId: 'a', activity: 'Mood' }, { memberId: 'a', activity: 'Exercise' }], awardIds: [],
    });
    const both = chargesFor({
      day, rows: [{ memberId: 'a', activity: 'Mood' }, { memberId: 'b', activity: 'Mood' }], awardIds: [],
    });
    expect(one).not.toContain('Bond');
    expect(both).toContain('Bond');
  });

  it('lights Balance at three kinds of log, and Bond does not count as a kind', () => {
    const two = chargesFor({
      day,
      rows: [{ memberId: 'a', activity: 'Mood' }, { memberId: 'b', activity: 'Exercise' }],
      awardIds: [],
    });
    expect(two).toEqual(['Exercise', 'Mood', 'Bond']);
    const three = chargesFor({
      day, rows: [{ memberId: 'a', activity: 'Mood' }], awardIds: [gardenAwardId(day, 'Rest'), gardenAwardId(day, 'Nourish')],
    });
    expect(three).toContain('Balance');
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
