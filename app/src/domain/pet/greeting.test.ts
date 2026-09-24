import { describe, expect, it } from 'vitest';
import { GREETING_LINES, GREETING_POSES, greetingFor } from './greeting';
import { addDays } from '../day';
import type { PetMood } from './mood';

const MOODS: PetMood[] = ['happy', 'content', 'sleepy'];
const base = { coupleId: 'couple-a', day: '2026-09-24', mood: 'content' as PetMood, name: 'Mochi' };

describe('greetingFor', () => {
  it('says the same thing twice for the same couple and day', () => {
    expect(greetingFor(base)).toEqual(greetingFor(base));
  });

  it('changes from day to day', () => {
    const days = Array.from({ length: 60 }, (_, i) => greetingFor({ ...base, day: addDays(base.day, i) }));
    expect(new Set(days.map((g) => g.line)).size).toBeGreaterThan(1);
    expect(new Set(days.map((g) => g.pose)).size).toBeGreaterThan(1);
  });

  it('is not the same for every couple on the same day', () => {
    const couples = Array.from({ length: 20 }, (_, i) => greetingFor({ ...base, coupleId: `couple-${i}` }).line);
    expect(new Set(couples).size).toBeGreaterThan(1);
  });

  it('puts the name in and leaves no placeholder behind', () => {
    for (const mood of MOODS) {
      for (let i = 0; i < 30; i += 1) {
        const { line } = greetingFor({ ...base, mood, day: addDays(base.day, i) });
        expect(line).not.toContain('{');
      }
    }
  });

  it('only ever picks a pose that exists', () => {
    for (let i = 0; i < 30; i += 1) {
      expect(GREETING_POSES).toContain(greetingFor({ ...base, day: addDays(base.day, i) }).pose);
    }
  });
});

describe('GREETING_LINES', () => {
  // The app's written position on reminders (domain/notify/schedule.ts): the
  // pet is glad to see you; it never keeps score of when it did not.
  const GUILT = /\b(miss(ed)?|forgot|forget|haven'?t|where were you|streak|late|again\?)\b/i;

  it.each(MOODS)('has at least eight kind, short lines for %s', (mood) => {
    const lines = GREETING_LINES[mood];
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(new Set(lines).size).toBe(lines.length);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(90);
      expect(line).not.toMatch(GUILT);
      expect(line.split('{name}').length - 1).toBeLessThanOrEqual(1);
    }
  });
});
