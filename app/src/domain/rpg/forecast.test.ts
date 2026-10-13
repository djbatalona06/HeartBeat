import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERDICTS, VERDICT_LABELS, forecastFits, forecastLine } from './forecast';

const CORE = resolve(__dirname, '../../../../game/HeartBeat.Game.Core');

describe('the verdict list', () => {
  it('matches the C# Verdict enum, in order', () => {
    const source = readFileSync(resolve(CORE, 'Forecast.cs'), 'utf8');
    const body = source.slice(source.indexOf('enum Verdict'), source.indexOf('}', source.indexOf('enum Verdict')));
    const members = [...body.matchAll(/^\s{4}([A-Z][A-Za-z]+),?\s*$/gm)].map((m) => m[1]);
    expect(members).toEqual([...VERDICTS]);
  });
});

describe('what a forecast says', () => {
  it('has a label for every verdict, and none of them is a number', () => {
    for (const verdict of VERDICTS) {
      expect(VERDICT_LABELS[verdict].length).toBeGreaterThan(0);
      expect(VERDICT_LABELS[verdict]).not.toMatch(/\d|%/);
    }
  });

  it('names the monster it is about', () => {
    expect(forecastLine('The Hearthkeeper', 'Tough')).toBe('The Hearthkeeper: This may be tough.');
  });
});

describe('a stale answer', () => {
  it('fits only the monster it was worked out for', () => {
    expect(forecastFits({ monsterId: 'i1s2-x' }, 'i1s2-x')).toBe(true);
    expect(forecastFits({ monsterId: 'i1s1-x' }, 'i1s2-x')).toBe(false);
    expect(forecastFits(null, 'i1s2-x')).toBe(false);
    expect(forecastFits({ monsterId: 'i1s2-x' }, undefined)).toBe(false);
  });
});
