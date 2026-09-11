import { describe, expect, it } from 'vitest';
import {
  PROMPTS,
  PROMPT_KINDS,
  byNewest,
  isWritten,
  preview,
  promptById,
  promptForDay,
  promptsOfKind,
  streakOf,
  type Reflection,
} from './reflections';

function entry(over: Partial<Reflection> = {}): Reflection {
  return {
    id: 'r1',
    coupleId: 'c1',
    memberId: 'm1',
    day: '2026-09-11',
    body: 'Something.',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe('the prompts', () => {
  it('repeats no id and no question', () => {
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(PROMPTS.length);
    expect(new Set(PROMPTS.map((p) => p.text)).size).toBe(PROMPTS.length);
  });

  it('files every prompt under a named kind', () => {
    for (const p of PROMPTS) expect(PROMPT_KINDS[p.kind], p.id).toBeTruthy();
  });

  it('asks a question rather than making a statement', () => {
    for (const p of PROMPTS) expect(p.text.trim().endsWith('?'), p.id).toBe(true);
  });

  it('leaves no kind empty', () => {
    for (const kind of Object.keys(PROMPT_KINDS) as (keyof typeof PROMPT_KINDS)[]) {
      expect(promptsOfKind(kind).length, kind).toBeGreaterThan(0);
    }
  });

  it('finds one by id', () => {
    expect(promptById('day-one-good')).toBeDefined();
    expect(promptById('nope')).toBeUndefined();
    expect(promptById(undefined)).toBeUndefined();
  });
});

describe('promptForDay', () => {
  it('gives the same day the same question every time', () => {
    // Both phones derive this, and a half-written answer must not have its
    // question swapped out underneath it.
    expect(promptForDay('2026-09-11')).toEqual(promptForDay('2026-09-11'));
  });

  it('moves on from one day to the next', () => {
    const week = new Set(
      ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15']
        .map((d) => promptForDay(d).id),
    );
    expect(week.size).toBeGreaterThan(1);
  });

  it('reaches a fair spread of the catalogue across a year', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d += 1) {
      for (let m = 1; m <= 12; m += 1) {
        seen.add(promptForDay(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`).id);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(PROMPTS.length - 2);
  });
});

describe('preview', () => {
  it('collapses whitespace so a blank opening does not preview as nothing', () => {
    expect(preview('\n\n   hello   there\n')).toBe('hello there');
  });

  it('truncates long entries with an ellipsis', () => {
    const out = preview('x'.repeat(200));
    expect(out.length).toBeLessThanOrEqual(90);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves a short entry exactly as it is', () => {
    expect(preview('Short one.')).toBe('Short one.');
  });
});

describe('isWritten', () => {
  it('treats whitespace as nothing', () => {
    expect(isWritten('   \n\t ')).toBe(false);
    expect(isWritten('')).toBe(false);
    expect(isWritten(' a ')).toBe(true);
  });
});

describe('byNewest', () => {
  it('sorts newest first without mutating the input', () => {
    const list = [entry({ id: 'a', createdAt: 1 }), entry({ id: 'b', createdAt: 3 })];
    expect(byNewest(list).map((e) => e.id)).toEqual(['b', 'a']);
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('streakOf', () => {
  it('counts consecutive days back from today', () => {
    const days = ['2026-09-11', '2026-09-10', '2026-09-09'];
    expect(streakOf(days.map((day) => entry({ day })), '2026-09-11')).toBe(3);
  });

  it('does not break the streak just because today is not written yet', () => {
    // Today is a day that has not finished, not a day that was missed.
    const days = ['2026-09-10', '2026-09-09'];
    expect(streakOf(days.map((day) => entry({ day })), '2026-09-11')).toBe(2);
  });

  it('stops at the first real gap', () => {
    const days = ['2026-09-11', '2026-09-09', '2026-09-08'];
    expect(streakOf(days.map((day) => entry({ day })), '2026-09-11')).toBe(1);
  });

  it('counts two entries on one day as one day', () => {
    const list = [entry({ id: 'a', day: '2026-09-11' }), entry({ id: 'b', day: '2026-09-11' })];
    expect(streakOf(list, '2026-09-11')).toBe(1);
  });

  it('is zero with nothing written', () => {
    expect(streakOf([], '2026-09-11')).toBe(0);
  });

  it('crosses a month boundary', () => {
    const days = ['2026-09-01', '2026-08-31', '2026-08-30'];
    expect(streakOf(days.map((day) => entry({ day })), '2026-09-01')).toBe(3);
  });
});
