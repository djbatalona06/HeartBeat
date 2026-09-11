import { describe, expect, it } from 'vitest';
import {
  AWARDS, MAX_SHIELDS, RADIANCE_DECAY, RADIANCE_FLOOR, RADIANCE_FULL, SHIELD_EVERY,
  TOGETHER_BOND, attributesOf, radianceFor, sharedStreak, shieldsEarned, stageFor,
  remainingFor, vitalsOf, type DayLog,
} from './vitals';

/**
 * The rules that make this cooperative rather than competitive, pinned.
 *
 * Three of them are load-bearing and all three fail quietly if they regress:
 * one partner can carry a day for both, nobody is ever punished for the day
 * they missed, and no stage can be reached by one person alone.
 */

const ME = 'member-mine';
const THEM = 'member-theirs';

function log(day: string, memberId: string, ...kinds: DayLog['kinds']): DayLog {
  return { day, memberId, kinds };
}

describe('attributesOf', () => {
  it('feeds each attribute from the log that belongs to it', () => {
    expect(attributesOf([log('2026-03-01', ME, 'exercise')])).toEqual(AWARDS.exercise);
    expect(attributesOf([log('2026-03-01', ME, 'mood')])).toEqual(AWARDS.mood);
  });

  it('pays the together bonus once for a day, however much you each logged', () => {
    const both = attributesOf([
      log('2026-03-01', ME, 'mood', 'exercise'),
      log('2026-03-01', THEM, 'mood', 'exercise'),
    ]);
    const each = AWARDS.mood.bond + AWARDS.exercise.bond;
    expect(both.bond).toBe(each * 2 + TOGETHER_BOND);
  });

  it('pays it per day, so four logs each is not four bonuses', () => {
    const spread = attributesOf([
      log('2026-03-01', ME, 'mood'), log('2026-03-01', THEM, 'mood'),
      log('2026-03-02', ME, 'mood'), log('2026-03-02', THEM, 'mood'),
    ]);
    expect(spread.bond).toBe(4 * AWARDS.mood.bond + 2 * TOGETHER_BOND);
  });

  it('gives one person logging alone no together bonus', () => {
    const solo = attributesOf([log('2026-03-01', ME, 'mood'), log('2026-03-01', ME, 'exercise')]);
    expect(solo.bond).toBe(AWARDS.mood.bond + AWARDS.exercise.bond);
  });

  it('counts an empty day as no day at all', () => {
    expect(attributesOf([log('2026-03-01', ME), log('2026-03-01', THEM)]).bond).toBe(0);
  });
});

describe('sharedStreak', () => {
  const days = (...list: string[]) => new Set(list);

  it('counts back from today once today is on the board', () => {
    const state = sharedStreak(days('2026-03-03', '2026-03-02', '2026-03-01'), '2026-03-03', 0);
    expect(state.days).toBe(3);
    expect(state.loggedToday).toBe(true);
  });

  it('does not treat a day still in progress as a miss', () => {
    // The streak everybody built yesterday must not read as broken every
    // morning until somebody logs.
    const state = sharedStreak(days('2026-03-02', '2026-03-01'), '2026-03-03', 0);
    expect(state.days).toBe(2);
    expect(state.loggedToday).toBe(false);
  });

  it('breaks on a missed day when there is no shield', () => {
    expect(sharedStreak(days('2026-03-03', '2026-03-01'), '2026-03-03', 0).days).toBe(1);
  });

  it('spends a shield to carry the streak over one missed day', () => {
    const state = sharedStreak(days('2026-03-03', '2026-03-01'), '2026-03-03', 1);
    expect(state.days).toBe(2);
    expect(state.shieldsSpent).toBe(1);
    expect(state.shieldsLeft).toBe(0);
  });

  it('will not paper over two missed days in a row, however many shields are held', () => {
    const state = sharedStreak(days('2026-03-04', '2026-03-01'), '2026-03-04', MAX_SHIELDS);
    expect(state.days).toBe(1);
    expect(state.shieldsSpent).toBe(0);
  });

  it('never spends a shield before there is a streak to protect', () => {
    expect(sharedStreak(days('2026-02-01'), '2026-03-03', MAX_SHIELDS)).toMatchObject({
      days: 0,
      shieldsSpent: 0,
    });
  });

  it('terminates on an empty log', () => {
    expect(sharedStreak(new Set(), '2026-03-03', 2).days).toBe(0);
  });
});

describe('shieldsEarned', () => {
  it('pays one per five days you both logged, capped', () => {
    expect(shieldsEarned(SHIELD_EVERY - 1)).toBe(0);
    expect(shieldsEarned(SHIELD_EVERY)).toBe(1);
    expect(shieldsEarned(SHIELD_EVERY * 50)).toBe(MAX_SHIELDS);
  });
});

describe('radianceFor', () => {
  it('is full on a day something was logged', () => {
    expect(radianceFor('2026-03-03', '2026-03-03')).toBe(RADIANCE_FULL);
  });

  it('dims by a day at a time', () => {
    expect(radianceFor('2026-03-01', '2026-03-03')).toBe(RADIANCE_FULL - 2 * RADIANCE_DECAY);
  });

  it('never falls through the floor, however long the gap', () => {
    // The pet dims. It is never sad, and no screen ever says whose fault it was.
    expect(radianceFor('2020-01-01', '2026-03-03')).toBe(RADIANCE_FLOOR);
    expect(radianceFor(null, '2026-03-03')).toBe(RADIANCE_FLOOR);
  });
});

describe('stageFor', () => {
  it('starts as an egg', () => {
    expect(stageFor({ xp: 0, streak: 0, bothRecently: false }).id).toBe('egg');
  });

  it('hatches on XP alone', () => {
    expect(stageFor({ xp: 100, streak: 0, bothRecently: false }).id).toBe('hatchling');
  });

  it('will not sell a stage for XP one person could have earned alone', () => {
    expect(stageFor({ xp: 9000, streak: 0, bothRecently: false }).id).toBe('hatchling');
    expect(stageFor({ xp: 9000, streak: 30, bothRecently: false }).id).toBe('juvenile');
    expect(stageFor({ xp: 9000, streak: 30, bothRecently: true }).id).toBe('elder');
  });

  it('says what the next one is still short of', () => {
    expect(remainingFor({ xp: 400, streak: 2, bothRecently: false })).toEqual([
      '100 more XP together',
      'a 7-day shared streak',
    ]);
    expect(remainingFor({ xp: 9000, streak: 30, bothRecently: true })).toEqual([]);
  });
});

describe('vitalsOf', () => {
  it('reads a week of both of you as a streak, a bond, and a glow', () => {
    const logs: DayLog[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = `2026-03-0${i + 1}`;
      logs.push(log(day, ME, 'exercise'), log(day, THEM, 'mood'));
    }
    const vitals = vitalsOf(logs, '2026-03-07');

    expect(vitals.streak.days).toBe(7);
    expect(vitals.togetherDays).toBe(7);
    expect(vitals.bothRecently).toBe(true);
    expect(vitals.radiance).toBe(RADIANCE_FULL);
    expect(vitals.attributes.vitality).toBe(7 * AWARDS.exercise.vitality);
    expect(vitals.attributes.serenity).toBe(7 * AWARDS.mood.serenity);
    expect(vitals.attributes.bond).toBe(7 * (AWARDS.exercise.bond + AWARDS.mood.bond + TOGETHER_BOND));
    expect(vitals.streak.shieldsLeft).toBe(shieldsEarned(7));
  });

  it('lets one partner carry the streak for both while the other is away', () => {
    const logs: DayLog[] = [];
    for (let i = 1; i <= 5; i += 1) logs.push(log(`2026-03-0${i}`, ME, 'mood'));
    const vitals = vitalsOf(logs, '2026-03-05');

    expect(vitals.streak.days).toBe(5);
    expect(vitals.togetherDays).toBe(0);
    expect(vitals.bothRecently).toBe(false);
    // Carried, but not grown: the stages past the first need both of you.
    expect(vitals.stage.id).toBe('egg');
  });

  it('ignores a day dated ahead of today when deciding the glow', () => {
    const vitals = vitalsOf([log('2026-04-01', ME, 'mood')], '2026-03-03');
    expect(vitals.radiance).toBe(RADIANCE_FLOOR);
  });

  it('has an answer for a couple who have logged nothing at all', () => {
    expect(vitalsOf([], '2026-03-03')).toMatchObject({
      xp: 0,
      radiance: RADIANCE_FLOOR,
      togetherDays: 0,
      bothRecently: false,
    });
  });
});
