import { describe, expect, it } from 'vitest';
import { fuzzyScore, rank } from './CommandMenu';

/**
 * The matcher behind the command menu. Tested rather than eyeballed because
 * "nothing matched" is what triggers the ask fallback — a matcher that is too
 * strict sends people to the model for things the app can already do, and one
 * that is too loose never falls back at all.
 */
const cmd = (label: string, hint = '') => ({ id: label, label, hint, to: `/${label}` });

describe('fuzzyScore', () => {
  it('matches a prefix', () => {
    expect(fuzzyScore('mo', 'Mood')).not.toBeNull();
  });

  it('matches a sub-sequence, so "wk" finds Work', () => {
    expect(fuzzyScore('wk', 'Work')).not.toBeNull();
    expect(fuzzyScore('stg', 'Settings')).not.toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('MOOD', 'mood')).not.toBeNull();
  });

  it('refuses letters that are not there, or are out of order', () => {
    expect(fuzzyScore('zz', 'Mood')).toBeNull();
    // Out of order is a miss, not a weak match — otherwise nothing ever misses.
    expect(fuzzyScore('doom', 'Mood')).toBeNull();
  });

  it('scores an adjacent run above the same letters scattered', () => {
    const adjacent = fuzzyScore('set', 'Settings')!;
    const scattered = fuzzyScore('set', 'Some easy thing')!;
    expect(adjacent).toBeGreaterThan(scattered);
  });

  it('treats an empty query as matching everything equally', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

describe('rank', () => {
  const all = [cmd('Mood'), cmd('Move'), cmd('Work'), cmd('Settings'), cmd('Party')];

  it('returns everything for an empty query', () => {
    expect(rank('', all)).toHaveLength(all.length);
    expect(rank('   ', all)).toHaveLength(all.length);
  });

  it('puts the best match first', () => {
    expect(rank('moo', all)[0].label).toBe('Mood');
    expect(rank('mov', all)[0].label).toBe('Move');
    expect(rank('sett', all)[0].label).toBe('Settings');
  });

  it('prefers the shorter of two targets matching equally', () => {
    const both = [cmd('Work'), cmd('Workout history and proof')];
    expect(rank('work', both)[0].label).toBe('Work');
  });

  it('finds a command by its hint as well as its name', () => {
    const withHint = [cmd('Party', 'the pet and boss fights')];
    expect(rank('pet', withHint)).toHaveLength(1);
  });

  it('ranks a name match above a hint match', () => {
    const list = [cmd('Settings', 'pairing and theme'), cmd('Mood', 'settings for sweetness')];
    expect(rank('settings', list)[0].label).toBe('Settings');
  });

  it('comes back empty when nothing matches, which is what opens the ask path', () => {
    expect(rank('zzzz', all)).toEqual([]);
  });
});
