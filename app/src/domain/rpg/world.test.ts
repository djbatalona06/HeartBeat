import { describe, expect, it } from 'vitest';
import {
  ISLAND_COUNT, STAGES_PER_ISLAND, clearStage, clearedCount, currentStage,
  isIslandComplete, isIslandUnlocked, islandOfMonster, islandProgress,
  newWorldProgress, stageOfMonster, travelTo, type WorldProgress,
} from './world';

const AT = 1_700_000_000_000;

/** The seven monster ids of island 1, as authored in `game/.../Data/Island1.cs`. */
const ISLAND_1 = [
  'i1s1-sloth-sprout', 'i1s2-dozing-beetle', 'i1s3-snooze-thistle',
  'i1s4-lie-in', 'i1s5-dust-drifter', 'i1s6-couch-moss', 'i1s7-sedentary-sentinel',
];

function fresh(): WorldProgress {
  return newWorldProgress('couple-1', AT);
}

function afterClearing(ids: readonly string[]): WorldProgress {
  return ids.reduce((acc, id) => clearStage(acc, id, AT), fresh());
}

describe('a new world', () => {
  it('starts on island one with nothing cleared', () => {
    const start = fresh();
    expect(start.island).toBe(1);
    expect(start.cleared).toEqual([]);
    expect(currentStage(start)).toBe(1);
    expect(islandProgress(start)).toBe(0);
  });

  it('unlocks only the first island', () => {
    const start = fresh();
    expect(isIslandUnlocked(start, 1)).toBe(true);
    for (let island = 2; island <= ISLAND_COUNT; island += 1) {
      expect(isIslandUnlocked(start, island)).toBe(false);
    }
  });
});

describe('reading a monster id', () => {
  it('pulls the island and stage back out', () => {
    expect(islandOfMonster('i1s7-sedentary-sentinel')).toBe(1);
    expect(stageOfMonster('i1s7-sedentary-sentinel')).toBe(7);
    expect(islandOfMonster('i3s2-something')).toBe(3);
  });

  it('gives up rather than guessing on an id it does not recognise', () => {
    expect(islandOfMonster('nonsense')).toBeUndefined();
    expect(stageOfMonster('')).toBeUndefined();
    expect(islandOfMonster('is1-missing-number')).toBeUndefined();
  });

  it('parses every id island one actually ships', () => {
    ISLAND_1.forEach((id, index) => {
      expect(islandOfMonster(id)).toBe(1);
      expect(stageOfMonster(id)).toBe(index + 1);
    });
  });
});

describe('clearing a stage', () => {
  it('advances the current stage', () => {
    const after = clearStage(fresh(), ISLAND_1[0], AT);
    expect(after.cleared).toEqual([ISLAND_1[0]]);
    expect(currentStage(after)).toBe(2);
  });

  it('is idempotent, because both phones report the same victory', () => {
    const once = clearStage(fresh(), ISLAND_1[0], AT);
    const twice = clearStage(once, ISLAND_1[0], AT + 5000);
    // The same object back, so the caller can skip the write entirely.
    expect(twice).toBe(once);
    expect(twice.cleared).toHaveLength(1);
  });

  it('stamps the row so the holdings sync can compare it', () => {
    const after = clearStage(fresh(), ISLAND_1[0], AT + 1);
    expect(after.updatedAt).toBe(AT + 1);
  });

  it('never rewinds the current stage when wins arrive out of order', () => {
    // The partner's phone can report stage 3 before ours reports stage 2.
    const jumbled = afterClearing([ISLAND_1[2], ISLAND_1[0], ISLAND_1[1]]);
    expect(clearedCount(jumbled, 1)).toBe(3);
    expect(currentStage(jumbled)).toBe(4);
  });

  it('clamps the current stage once the island is finished', () => {
    const done = afterClearing(ISLAND_1);
    expect(currentStage(done, 1)).toBe(STAGES_PER_ISLAND);
    expect(islandProgress(done, 1)).toBe(1);
    expect(isIslandComplete(done, 1)).toBe(true);
  });

  it('moves on to the next island when one is finished', () => {
    const done = afterClearing(ISLAND_1);
    expect(done.island).toBe(2);
    expect(isIslandUnlocked(done, 2)).toBe(true);
    expect(isIslandUnlocked(done, 3)).toBe(false);
  });

  it('stays put when the last island is finished', () => {
    const lastIsland = Array.from(
      { length: STAGES_PER_ISLAND },
      (_, i) => `i${ISLAND_COUNT}s${i + 1}-end`,
    );
    const end = lastIsland.reduce(
      (acc, id) => clearStage(acc, id, AT),
      { ...fresh(), island: ISLAND_COUNT },
    );
    expect(end.island).toBe(ISLAND_COUNT);
    expect(isIslandComplete(end, ISLAND_COUNT)).toBe(true);
  });

  it('counts each island separately', () => {
    const mixed = afterClearing([ISLAND_1[0], ISLAND_1[1], 'i2s1-something']);
    expect(clearedCount(mixed, 1)).toBe(2);
    expect(clearedCount(mixed, 2)).toBe(1);
    expect(currentStage(mixed, 1)).toBe(3);
    expect(currentStage(mixed, 2)).toBe(2);
  });

  it('does not move the player off the island they are standing on', () => {
    // Finishing island 2's stages while standing on island 1 must not teleport
    // anyone: only finishing the island you are *on* advances you.
    const onOne = afterClearing(ISLAND_1.slice(0, 3));
    const alsoTwo = clearStage(onOne, 'i2s1-something', AT);
    expect(alsoTwo.island).toBe(1);
  });
});

describe('travelling', () => {
  it('refuses an island that is not unlocked, without throwing', () => {
    const start = fresh();
    expect(travelTo(start, 3, AT)).toBe(start);
    expect(travelTo(start, 99, AT)).toBe(start);
    expect(travelTo(start, 0, AT)).toBe(start);
  });

  it('allows a hop back to an island already finished', () => {
    const done = afterClearing(ISLAND_1);
    expect(done.island).toBe(2);
    const back = travelTo(done, 1, AT + 10);
    expect(back.island).toBe(1);
    expect(back.updatedAt).toBe(AT + 10);
  });

  it('is a no-op when already there', () => {
    const start = fresh();
    expect(travelTo(start, 1, AT + 10)).toBe(start);
  });
});
