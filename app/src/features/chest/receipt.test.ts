import { describe, expect, it } from 'vitest';
import type { ChestOutcome, ChestPrizeOutcome } from '../../db/repository/chests';
import { floorLine, openingLine, prizeKindLine, prizeLine } from './receipt';

/**
 * The language of an opening.
 *
 * `repository/chests.test.ts` proves a paid chest never hands back nothing in
 * *storage*. This proves the same thing in *words*, which is a separate claim:
 * a refined helmet reported as "you already had that" is a shrug however the
 * database looks.
 */

const prize = (over: Partial<ChestPrizeOutcome> = {}): ChestPrizeOutcome => ({
  kind: 'gear',
  itemId: 'helm-common',
  name: 'Plain Helm',
  tier: 'common',
  duplicate: false,
  ...over,
});

const opened = (over: Partial<Extract<ChestOutcome, { ok: true }>> = {}) => ({
  ok: true as const,
  chestId: 'wooden' as const,
  prizes: [prize()],
  pity: 0,
  floor: null,
  lifted: false,
  refunded: 0,
  ...over,
});

describe('one item, in a line', () => {
  it('names what a refine did rather than what it was not', () => {
    const line = prizeLine(prize({ duplicate: true, refined: 3 }));
    expect(line).toBe('Refined to +3.');
    expect(line.toLowerCase()).not.toContain('already');
  });

  it('names a bond as closeness, not as a repeat', () => {
    expect(prizeLine(prize({ kind: 'companion', duplicate: true, bonded: 5 })))
      .toBe('Closer by 5.');
  });

  it('says how many coins came back, because that is the compensation', () => {
    expect(prizeLine(prize({ kind: 'decor', duplicate: true, refunded: 40 })))
      .toContain('40 coins back');
  });

  /**
   * The fallback says where the thing went, not what it is. `prizeKindLine`
   * already says what it is, directly above it, and two lines carrying one
   * fact is one line of waste on a card with three of them.
   */
  it('says where a new thing landed rather than repeating its kind', () => {
    expect(prizeLine(prize())).toBe('In the bag.');
    expect(prizeLine(prize({ kind: 'companion' }))).toBe('Hatched.');
    expect(prizeLine(prize({ kind: 'decor' }))).toBe('In the birbhouse.');
    for (const kind of ['gear', 'companion', 'decor', 'dye', 'flora'] as const) {
      const line = prizeLine(prize({ kind }));
      expect(line, kind).not.toBe(prizeKindLine(prize({ kind })));
    }
  });

  /** Every duplicate outcome has to say what it did for you. */
  it('never reports a duplicate as nothing', () => {
    const duplicates = [
      prize({ duplicate: true, refined: 1 }),
      prize({ kind: 'companion', duplicate: true, bonded: 5 }),
      prize({ kind: 'dye', duplicate: true, refunded: 120 }),
    ];
    for (const row of duplicates) {
      expect(prizeLine(row).length, JSON.stringify(row)).toBeGreaterThan(0);
      expect(prizeLine(row)).not.toBe('In the bag.');
    }
  });

  it('puts the rung and the kind together under the name', () => {
    expect(prizeKindLine(prize({ tier: 'legendary', kind: 'companion' })))
      .toBe('Legendary · companion');
  });
});

describe('the whole opening, in one sentence', () => {
  it('names the best thing in the chest, not the first', () => {
    const line = openingLine(opened({
      prizes: [
        prize({ name: 'Plain Helm', tier: 'common' }),
        prize({ name: 'Sun Circlet', tier: 'epic' }),
        prize({ name: 'Cloth Cape', tier: 'rare' }),
      ],
    }));
    expect(line).toContain('Sun Circlet');
    expect(line).toContain('2 more');
  });

  it('drops the tail when there was only one', () => {
    expect(openingLine(opened())).not.toContain('more');
  });

  /** Structurally unreachable, and it still must not report nothing. */
  it('says something even with no items at all', () => {
    expect(openingLine(opened({ prizes: [], refunded: 90 }))).toContain('90 coins back');
    expect(openingLine(opened({ prizes: [], refunded: 0 }))).not.toBe('');
  });
});

describe('the insurance, said out loud', () => {
  it('stays quiet when no floor was in force', () => {
    expect(floorLine(opened())).toBeNull();
  });

  it('says the floor paid out when it had to lift an item', () => {
    const line = floorLine(opened({ floor: 'rare', lifted: true }));
    expect(line).toContain('rare');
    expect(line).toContain('as promised');
  });

  /**
   * A floor in force that the rolls beat on their own is worth saying too: the
   * guarantee was live and the chest did better than it, which is the one time
   * somebody can see the counter working without it costing them anything.
   */
  it('distinguishes a floor that was not needed from one that paid', () => {
    const needed = floorLine(opened({ floor: 'epic', lifted: true }));
    const spare = floorLine(opened({ floor: 'epic', lifted: false }));
    expect(spare).not.toBeNull();
    expect(spare).not.toBe(needed);
  });
});
