import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_BLURBS, MONSTER_BEHAVIORS, TELEGRAPHS, behaviorBlurb, blowsFor, monsterMissed,
  normalizeTelegraph, telegraphText,
} from './behaviours';

const CORE = resolve(__dirname, '../../../../game/HeartBeat.Game.Core');

describe('the playstyle list', () => {
  /** The same promise `islands.test.ts` makes for the islands. */
  it('matches the C# Behavior enum, in order', () => {
    const source = readFileSync(resolve(CORE, 'Models/Behavior.cs'), 'utf8');
    const body = source.slice(source.indexOf('enum Behavior'));
    const members = [...body.matchAll(/^\s{4}([A-Z][A-Za-z]+),?\s*$/gm)].map((m) => m[1]);
    expect(members).toEqual([...MONSTER_BEHAVIORS]);
  });

  it('knows every warning the game core can send', () => {
    const source = readFileSync(resolve(CORE, 'Behaviours.cs'), 'utf8');
    const sent = [...source.matchAll(/Telegraph: "(\w+)"/g)].map((m) => m[1]);
    expect(new Set(sent)).toEqual(new Set(TELEGRAPHS));
  });
});

describe('what a warning says', () => {
  it('has a sentence for every warning, naming the monster', () => {
    for (const kind of TELEGRAPHS) {
      expect(telegraphText('The Hearthkeeper', kind)).toContain('The Hearthkeeper');
    }
  });

  it('says nothing for no warning or a made-up one', () => {
    expect(telegraphText('X', null)).toBeNull();
    expect(telegraphText('X', undefined)).toBeNull();
    expect(telegraphText('X', 'explode')).toBeNull();
    expect(normalizeTelegraph(3)).toBeNull();
  });

  it('plays two blows for a flurry and one for everything else', () => {
    expect(blowsFor('flurry')).toBe(2);
    for (const kind of TELEGRAPHS.filter((k) => k !== 'flurry')) expect(blowsFor(kind)).toBe(1);
    expect(blowsFor(null)).toBe(1);
  });
});

describe('the card line', () => {
  it('has one for every playstyle but the default', () => {
    for (const behavior of MONSTER_BEHAVIORS) {
      if (behavior === 'Steady') expect(BEHAVIOR_BLURBS[behavior]).toBe('');
      else expect(BEHAVIOR_BLURBS[behavior].length).toBeGreaterThan(10);
    }
  });

  it('is empty for something it does not know', () => {
    expect(behaviorBlurb(undefined)).toBe('');
    expect(behaviorBlurb('Wizard')).toBe('');
    expect(behaviorBlurb('Bruiser')).toBe(BEHAVIOR_BLURBS.Bruiser);
  });
});

describe('monsterMissed', () => {
  it('reads the last monster line', () => {
    expect(monsterMissed([
      { who: 'Monster', text: 'Torrent - it lunges and misses.' },
      { who: 'Player', text: 'Strike hits for 5.' },
    ])).toBe(true);
    expect(monsterMissed([
      { who: 'Monster', text: 'Torrent hits for 9.' },
    ])).toBe(false);
  });

  it('is false for a fight with no monster line', () => {
    expect(monsterMissed([])).toBe(false);
  });

  /** An older "misses" in the log must not make the next hit look like a miss. */
  it('only looks at the most recent monster line', () => {
    expect(monsterMissed([
      { who: 'Monster', text: 'Torrent - it lunges and misses.' },
      { who: 'Player', text: 'Strike hits for 5.' },
      { who: 'Monster', text: 'Torrent hits for 9.' },
    ])).toBe(false);
  });
});
