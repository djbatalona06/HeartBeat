import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { levelForXp, xpForLevel } from '../domain/xp';

/**
 * The header bubble and Home must read one number. Home shows
 * `levelProgress(pet.xp)`; the bubble used to show the member's own level, so
 * the two disagreed on the screens people look at most. Components are not
 * unit-tested by design, so this reads the source, like `art.test.ts` does.
 */
describe('StatusHud level', () => {
  const source = readFileSync(resolve(__dirname, 'StatusHud.tsx'), 'utf8');

  it('derives the level from the shared pet, not the member avatar', () => {
    expect(source).toContain('levelForXp(petRead.xp)');
    expect(source).not.toMatch(/levelOf\(/);
  });

  it('sits on the same curve Home uses at every band edge', () => {
    for (const level of [1, 10, 11, 20, 21, 30, 31, 50]) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
    }
  });
});
