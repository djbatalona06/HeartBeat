import { describe, expect, it } from 'vitest';
import {
  VALUE_CLAMP,
  clampValue,
  complete,
  isDue,
  neglect,
  newTask,
  openDailies,
  payoutFor,
  pressDown,
  toneFor,
  settleMissed,
  toneLine,
  valueMultiplier,
  weekdayOf,
} from './task';
import { DIFFICULTY_WEIGHT, type Task, type TaskDifficulty } from './types';

const AT = 1_700_000_000_000;

function task(over: Partial<Task> = {}): Task {
  return {
    ...newTask(
      { id: 't1', coupleId: 'c1', memberId: 'm1', type: 'daily', title: 'Walk', difficulty: 'easy' },
      AT,
      '2026-09-01',
    ),
    ...over,
  };
}

describe('value clamp', () => {
  it('holds at ±11', () => {
    expect(clampValue(99)).toBe(VALUE_CLAMP);
    expect(clampValue(-99)).toBe(-VALUE_CLAMP);
    expect(VALUE_CLAMP).toBe(11);
  });

  it('treats a NaN value as neutral rather than propagating it', () => {
    expect(clampValue(Number.NaN)).toBe(0);
  });
});

describe('the reward gradient', () => {
  it('pays above par for a neglected task and below for a well-worn one', () => {
    expect(valueMultiplier(-VALUE_CLAMP)).toBeGreaterThan(1);
    expect(valueMultiplier(0)).toBe(1);
    expect(valueMultiplier(VALUE_CLAMP)).toBeLessThan(1);
  });

  it('is monotonically decreasing in value', () => {
    for (let v = -VALUE_CLAMP; v < VALUE_CLAMP; v += 1) {
      expect(valueMultiplier(v + 1)).toBeLessThan(valueMultiplier(v));
    }
  });

  /**
   * The reason the clamp is ±11 and not Habitica's ±22. At ±22 the spread is
   * ~3.1×, which stops being a nudge toward the hard thing and becomes an
   * instruction to farm neglected tasks. This is the test that would fail if
   * someone widened the clamp back out.
   */
  it('keeps the whole spread between 1.2× and 1.8×', () => {
    const spread = valueMultiplier(-VALUE_CLAMP) / valueMultiplier(VALUE_CLAMP);
    expect(spread).toBeGreaterThan(1.2);
    expect(spread).toBeLessThan(1.8);
  });
});

describe('payoutFor', () => {
  it('scales XP with difficulty', () => {
    const easy = payoutFor({ difficulty: 'easy', value: 0 });
    const hard = payoutFor({ difficulty: 'hard', value: 0 });
    expect(hard.xp).toBeGreaterThan(easy.xp);
    expect(hard.xp / easy.xp).toBeCloseTo(DIFFICULTY_WEIGHT.hard / DIFFICULTY_WEIGHT.easy, 1);
  });

  it('pays a trivial task something rather than nothing', () => {
    const p = payoutFor({ difficulty: 'trivial', value: VALUE_CLAMP });
    expect(p.xp).toBeGreaterThanOrEqual(1);
    expect(p.coins).toBeGreaterThanOrEqual(1);
    expect(p.energy).toBeGreaterThanOrEqual(1);
    expect(p.mp).toBeGreaterThanOrEqual(1);
  });

  it('rides the value curve for XP and coins', () => {
    const waiting = payoutFor({ difficulty: 'hard', value: -VALUE_CLAMP });
    const worn = payoutFor({ difficulty: 'hard', value: VALUE_CLAMP });
    expect(waiting.xp).toBeGreaterThan(worn.xp);
    expect(waiting.coins).toBeGreaterThan(worn.coins);
  });

  /**
   * Energy has to be plannable: you must be able to tell, before starting,
   * whether tonight's list gets the pet out the door. If energy rode the value
   * curve you could not, and that uncertainty is the anxious feeling this half
   * of the design exists to avoid.
   */
  it('holds energy and MP flat across the whole value range', () => {
    for (const difficulty of Object.keys(DIFFICULTY_WEIGHT) as TaskDifficulty[]) {
      const at = (value: number) => payoutFor({ difficulty, value });
      const neutral = at(0);
      for (let v = -VALUE_CLAMP; v <= VALUE_CLAMP; v += 1) {
        expect(at(v).energy, `${difficulty} @ ${v}`).toBe(neutral.energy);
        expect(at(v).mp, `${difficulty} @ ${v}`).toBe(neutral.mp);
      }
    }
  });
});

describe('complete', () => {
  it('prices the payout from the value the task had before it was done', () => {
    const t = task({ value: -VALUE_CLAMP });
    const result = complete(t, '2026-09-25');
    expect(result.payout).toEqual(payoutFor({ difficulty: 'easy', value: -VALUE_CLAMP }));
    expect(result.value).toBeGreaterThan(t.value);
  });

  it('walks a neutral task to well-worn over about three weeks of daily use', () => {
    let value = 0;
    let days = 0;
    while (value < VALUE_CLAMP - 0.5 && days < 500) {
      value = complete(task({ value }), '2026-09-25').value;
      days += 1;
    }
    expect(days).toBeGreaterThan(14);
    expect(days).toBeLessThan(35);
  });

  it('never pushes the value past the clamp', () => {
    let value = 0;
    for (let i = 0; i < 400; i += 1) value = complete(task({ value }), '2026-09-25').value;
    expect(value).toBeLessThanOrEqual(VALUE_CLAMP);
  });

  it('extends the streak and records the day', () => {
    const result = complete(task({ streak: 4 }), '2026-09-25');
    expect(result.streak).toBe(5);
    expect(result.lastCompletedOn).toBe('2026-09-25');
  });

  it('marks a to-do done and leaves a daily open for tomorrow', () => {
    expect(complete(task({ type: 'todo' }), '2026-09-25').done).toBe(true);
    expect(complete(task({ type: 'daily' }), '2026-09-25').done).toBe(false);
  });
});

describe('neglect', () => {
  /**
   * The ruling made structural. Health exists only inside a boss fight, so a
   * missed day has nowhere to charge a cost to — and this shape has no field
   * for one. A future edit that wants to add damage has to change this test
   * first, which is the point.
   */
  it('returns exactly { value, streak } and nothing else', () => {
    expect(Object.keys(neglect(task())).sort()).toEqual(['streak', 'value']);
  });

  it('costs nothing and only makes the task worth more next time', () => {
    const before = task({ value: 3, streak: 9 });
    const after = neglect(before);
    expect(after.value).toBeLessThan(before.value);
    expect(payoutFor({ difficulty: 'easy', value: after.value }).xp)
      .toBeGreaterThanOrEqual(payoutFor({ difficulty: 'easy', value: before.value }).xp);
  });

  it('resets the streak, which is a counter and not a multiplier', () => {
    expect(neglect(task({ streak: 30 })).streak).toBe(0);
  });

  it('never pushes the value below the clamp', () => {
    let value = 0;
    for (let i = 0; i < 400; i += 1) value = neglect(task({ value })).value;
    expect(value).toBeGreaterThanOrEqual(-VALUE_CLAMP);
  });

  it('is what a habit press-down does, no more', () => {
    const t = task({ type: 'habit', value: 2, streak: 3 });
    expect(pressDown(t)).toEqual(neglect(t));
  });
});

describe('tone', () => {
  it('reads the whole range without a gap', () => {
    const seen = new Set<string>();
    for (let v = -VALUE_CLAMP; v <= VALUE_CLAMP; v += 0.5) seen.add(toneFor(v));
    expect(seen).toEqual(new Set(['waiting', 'drifting', 'steady', 'warm', 'well-worn']));
  });

  it('calls a long-neglected task waiting and a daily habit well-worn', () => {
    expect(toneFor(-VALUE_CLAMP)).toBe('waiting');
    expect(toneFor(0)).toBe('steady');
    expect(toneFor(VALUE_CLAMP)).toBe('well-worn');
  });

  it('has a line for every tone, and none of them scold', () => {
    for (let v = -VALUE_CLAMP; v <= VALUE_CLAMP; v += 1) {
      const line = toneLine(v);
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toMatch(/fail|lost|penalt|behind|should have/i);
    }
  });
});

describe('scheduling', () => {
  it('reads a weekday from a day key', () => {
    // 2026-09-25 is a Friday.
    expect(weekdayOf('2026-09-25')).toBe(5);
    expect(weekdayOf('2026-09-27')).toBe(0);
  });

  it('treats an empty schedule as every day', () => {
    expect(isDue({ type: 'daily' }, '2026-09-25')).toBe(true);
    expect(isDue({ type: 'daily', dueDays: [] }, '2026-09-25')).toBe(true);
  });

  it('honours a weekday schedule', () => {
    expect(isDue({ type: 'daily', dueDays: [5] }, '2026-09-25')).toBe(true);
    expect(isDue({ type: 'daily', dueDays: [1, 3] }, '2026-09-25')).toBe(false);
  });

  it('says no for habits and to-dos, which are never due', () => {
    expect(isDue({ type: 'habit' }, '2026-09-25')).toBe(false);
    expect(isDue({ type: 'todo' }, '2026-09-25')).toBe(false);
  });
});

describe('openDailies', () => {
  const DAY = '2026-09-25';

  it('leads with whatever has been waiting longest', () => {
    const list = openDailies(
      [
        task({ id: 'worn', value: 8 }),
        task({ id: 'waiting', value: -9 }),
        task({ id: 'steady', value: 0 }),
      ],
      DAY,
    );
    expect(list.map((t) => t.id)).toEqual(['waiting', 'steady', 'worn']);
  });

  it('drops what is already done, archived, or not due today', () => {
    const list = openDailies(
      [
        task({ id: 'done', lastCompletedOn: DAY }),
        task({ id: 'archived', archivedAt: AT }),
        task({ id: 'monday', dueDays: [1] }),
        task({ id: 'open' }),
      ],
      DAY,
    );
    expect(list.map((t) => t.id)).toEqual(['open']);
  });
});

describe('settleMissed', () => {
  const TODAY = '2026-09-25';
  const YESTERDAY = '2026-09-24';

  it('makes a missed day worth more and takes nothing away', () => {
    const before = task({ value: 0, streak: 6, lastSettledOn: '2026-09-21' });
    const after = settleMissed(before, YESTERDAY);
    expect(after.missed).toBe(3);
    expect(after.value).toBeLessThan(before.value);
    expect(after.streak).toBe(0);
    expect(Object.keys(after).sort()).toEqual(['lastSettledOn', 'missed', 'streak', 'value']);
  });

  /** Opening the app twice in one evening must not count the same day twice. */
  it('is idempotent', () => {
    const first = settleMissed(task({ lastSettledOn: '2026-09-21' }), YESTERDAY);
    const second = settleMissed(
      task({ ...first, lastSettledOn: first.lastSettledOn }),
      YESTERDAY,
    );
    expect(second.missed).toBe(0);
    expect(second.value).toBe(first.value);
  });

  it('does not judge today, which has not been missed yet', () => {
    const after = settleMissed(task({ lastSettledOn: YESTERDAY }), YESTERDAY);
    expect(after.missed).toBe(0);
  });

  it('skips days the task was not due', () => {
    // 2026-09-21 is a Monday; a Monday-only daily settled through Thursday has
    // no missed occurrence at all.
    const after = settleMissed(task({ dueDays: [1], lastSettledOn: '2026-09-21' }), '2026-09-24');
    expect(after.missed).toBe(0);
    expect(after.lastSettledOn).toBe('2026-09-24');
  });

  it('never re-judges a day already claimed by a completion', () => {
    const after = settleMissed(
      task({ lastSettledOn: '2026-09-20', lastCompletedOn: '2026-09-23' }),
      YESTERDAY,
    );
    expect(after.missed).toBe(1);
  });

  it('caps how far back it will ever walk', () => {
    const after = settleMissed(task({ lastSettledOn: '2020-01-01' }), TODAY);
    expect(after.missed).toBeLessThanOrEqual(30);
    expect(after.lastSettledOn).toBe(TODAY);
  });

  it('leaves habits, to-dos and archived tasks alone', () => {
    for (const over of [{ type: 'habit' as const }, { type: 'todo' as const }, { archivedAt: AT }]) {
      const after = settleMissed(task({ ...over, streak: 9, lastSettledOn: '2026-09-01' }), TODAY);
      expect(after.missed).toBe(0);
      expect(after.streak).toBe(9);
    }
  });

  it('bottoms out at the clamp however long the phone was closed', () => {
    let t = task({ value: 0, lastSettledOn: '2026-01-01' });
    for (let i = 0; i < 40; i += 1) {
      const after = settleMissed(t, TODAY);
      t = task({ ...t, value: after.value, lastSettledOn: '2026-01-01' });
    }
    expect(t.value).toBeGreaterThanOrEqual(-VALUE_CLAMP);
  });
});
