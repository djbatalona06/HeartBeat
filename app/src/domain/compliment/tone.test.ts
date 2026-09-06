import { describe, expect, it } from 'vitest';
import {
  MAX_COMPLIMENT,
  TONES,
  buildPrompt,
  cleanCandidate,
  isBlocked,
  isTone,
  usableCandidates,
  type ComplimentSettings,
} from './tone';

const base: ComplimentSettings = { tone: 'tender' };

describe('cleanCandidate', () => {
  it('keeps an ordinary line as it is', () => {
    expect(cleanCandidate('You made today easier just by being in it.'))
      .toBe('You made today easier just by being in it.');
  });

  it('strips the numbering and quotes models add unasked', () => {
    expect(cleanCandidate('1. "You are the best part of my day."'))
      .toBe('You are the best part of my day.');
    expect(cleanCandidate('- “Still my favourite person.”')).toBe('Still my favourite person.');
    expect(cleanCandidate('• You always know what to say.')).toBe('You always know what to say.');
  });

  it('takes the first line when the model ignored "one line"', () => {
    expect(cleanCandidate('You are wonderful.\nAlso here is another one.')).toBe('You are wonderful.');
  });

  it('refuses something too long to read on a lock screen', () => {
    expect(cleanCandidate('a'.repeat(MAX_COMPLIMENT + 1))).toBeNull();
  });

  it('refuses a fragment that is not a message', () => {
    expect(cleanCandidate('ok')).toBeNull();
    expect(cleanCandidate('   ')).toBeNull();
  });
});

describe('isBlocked', () => {
  it('is false when the couple has blocked nothing', () => {
    expect(isBlocked('anything at all', undefined)).toBe(false);
    expect(isBlocked('anything at all', [])).toBe(false);
  });

  it('matches whatever the sender listed, whatever the casing', () => {
    expect(isBlocked('You are so Skinny lately', ['skinny'])).toBe(true);
    expect(isBlocked('You look strong', ['skinny'])).toBe(false);
  });

  it('ignores blank entries rather than blocking everything', () => {
    // An empty string is a substring of every line, so a stray blank in the
    // list would silently drop every candidate.
    expect(isBlocked('any line at all', ['', '   '])).toBe(false);
  });
});

describe('usableCandidates', () => {
  it('cleans, filters and keeps the order', () => {
    const out = usableCandidates(
      ['1. "You are kind."', 'no', 'You make the flat feel like somewhere.'],
      base,
    );
    expect(out).toEqual(['You are kind.', 'You make the flat feel like somewhere.']);
  });

  it('drops a blocked candidate rather than showing it', () => {
    // Seeing it at all is the harm, so it is never rendered and then hidden.
    expect(usableCandidates(['You look skinny today.', 'You look happy today.'], {
      ...base,
      blocked: ['skinny'],
    })).toEqual(['You look happy today.']);
  });

  it('collapses three ways of saying the same sentence', () => {
    // Three identical candidates is a choice in name only.
    expect(usableCandidates(
      ['You are my favourite.', '"You are my favourite"', 'You are my favourite!'],
      base,
    )).toHaveLength(1);
  });

  it('can come back empty, which the caller has to handle', () => {
    expect(usableCandidates(['no', ''], base)).toEqual([]);
  });
});

describe('buildPrompt', () => {
  it('asks for three lines and forbids the shapes that need cleaning up', () => {
    const prompt = buildPrompt(base, {});
    expect(prompt).toContain('three');
    expect(prompt).toContain('No emoji');
    expect(prompt).toContain('160 characters');
  });

  it('uses the pet name when there is one, and says so when there is not', () => {
    expect(buildPrompt({ ...base, petName: 'Bug' }, {})).toContain('"Bug"');
    expect(buildPrompt(base, {})).toContain('Use no name');
  });

  it('carries coarse signals only, never the log itself', () => {
    const prompt = buildPrompt(base, { workoutStreak: 5, questName: 'Ten walks', moodTrend: 'down' });
    expect(prompt).toContain('5 days running');
    expect(prompt).toContain('Ten walks');
    // A harder week is named as a direction. Nothing anyone wrote goes over.
    expect(prompt).toContain('harder week');
    expect(prompt).not.toContain('mood log');
  });

  it('ignores a streak too short to be worth mentioning', () => {
    expect(buildPrompt(base, { workoutStreak: 2 })).not.toContain('days running');
  });

  it('changes with the tone, or the setting would be decoration', () => {
    const prompts = TONES.map((tone) => buildPrompt({ tone }, {}));
    expect(new Set(prompts).size).toBe(TONES.length);
  });
});

describe('isTone', () => {
  it('accepts what the picker offers and nothing else', () => {
    expect(isTone('playful')).toBe(true);
    expect(isTone('mean')).toBe(false);
    expect(isTone(null)).toBe(false);
  });
});
