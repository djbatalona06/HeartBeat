import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DARK_SCALE, ISLANDS, bossOf, faceOf, stageView } from './islands';
import { ISLAND_COUNT, STAGES_PER_ISLAND } from './world';

const data = (file: string) =>
  readFileSync(resolve(__dirname, '../../../../game/HeartBeat.Game.Core/', file), 'utf8');

/**
 * The mirror against the source. Parsed rather than imported because C# cannot
 * be imported — the same arrangement `world.test.ts` has with `World.cs`.
 */
describe('the islands mirror', () => {
  it('has every island and every stage', () => {
    expect(ISLANDS).toHaveLength(ISLAND_COUNT);
    for (const island of ISLANDS) expect(island.stages).toHaveLength(STAGES_PER_ISLAND);
  });

  it('agrees with Data/Island<N>.cs on every name, number and face', () => {
    for (const island of ISLANDS) {
      const cs = data(`Data/Island${island.number}.cs`);
      expect(cs).toContain(`LightName: "${island.lightName}"`);
      expect(cs).toContain(`DarkName: "${island.darkName}"`);
      expect(cs).toContain(`Element: Element.${island.element},`);
      for (const s of island.stages) {
        const block = new RegExp(
          `new Stage\\(${s.number}, "${s.name}", new Monster\\(\\s*Id: "${s.monsterId}",\\s*`
          + `Name: "${s.monster}",\\s*Type: MonsterType\\.${s.type},\\s*Hp: ${s.hp},[^\\n]*\\n\\s*`
          + `Weakness: Element\\.${s.weakness}, Strength: Element\\.${s.strength},`,
        );
        expect(cs, s.monsterId).toMatch(block);
        expect(cs, s.monsterId).toContain(`SpriteKey: "${s.spriteKey}"`);
        expect(cs, s.monsterId).toContain(`["${s.monsterId}"] = "${s.darkMonster}"`);
      }
    }
  });

  it('scales the dark face the way Monster.cs does', () => {
    expect(data('Models/Monster.cs')).toContain(`DarkScale = ${DARK_SCALE};`);
  });
});

describe('reading it', () => {
  it('finds the boss on the last stage', () => {
    expect(bossOf(1).monster).toBe('The Hearthkeeper');
    expect(bossOf(7).type).toBe('Boss');
    expect(stageView(3, 4)?.type).toBe('SemiBoss');
  });

  it('wears the dark face when asked', () => {
    const boss = bossOf(1);
    expect(faceOf(boss, true).name).toBe(boss.darkMonster);
    expect(faceOf(boss, true).hp).toBeGreaterThan(faceOf(boss, false).hp);
  });
});
