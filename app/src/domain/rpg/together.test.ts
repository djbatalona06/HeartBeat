import { describe, expect, it } from 'vitest';
import { addDays } from '../day';
import { dayMembers, type DayLog } from './vitals';
import {
  ACHIEVEMENT_XP_PER_POINT, DUO_WINDOW_DAYS, POINTS_PER_DUO_DAY, POINTS_PER_LOGGED_DAY,
  POINTS_PER_QUEST, REUNION_AFTER_DAYS, TOGETHER_TIERS, duoWeek, loyaltyPoints,
  nextTier, pointsToNext, reunion, tierAt, tiersReached,
} from './together';

/**
 * The two properties worth protecting here, and both fail silently if they
 * regress: a week that is not finished pays nothing *and costs nothing*, and
 * no total on the ladder can go down.
 */

const ME = 'member-mine';
const THEM = 'member-theirs';
const TODAY = '2026-03-15';

function log(day: string, memberId: string, ...kinds: DayLog['kinds']): DayLog {
  return { day, memberId, kinds };
}

/** Both partners logging on each of the `count` days ending at `last`. */
function duoRun(count: number, last = TODAY): DayLog[] {
  const rows: DayLog[] = [];
  for (let back = 0; back < count; back += 1) {
    const day = addDays(last, -back);
    rows.push(log(day, ME, 'mood'), log(day, THEM, 'mood'));
  }
  return rows;
}

const membersOf = (rows: DayLog[]) => dayMembers(rows);

describe('duoWeek', () => {
  it('always reports exactly seven days, oldest first and today last', () => {
    const week = duoWeek(membersOf([]), TODAY);
    expect(week.days).toHaveLength(DUO_WINDOW_DAYS);
    expect(week.days[0].day).toBe(addDays(TODAY, -(DUO_WINDOW_DAYS - 1)));
    expect(week.days[DUO_WINDOW_DAYS - 1].day).toBe(TODAY);
  });

  it('counts only the days both of you logged', () => {
    const week = duoWeek(membersOf([
      log(TODAY, ME, 'mood'), log(TODAY, THEM, 'mood'),
      log(addDays(TODAY, -1), ME, 'exercise'),         // one of us only
    ]), TODAY);
    expect(week.duoDays).toBe(1);
    expect(week.bothToday).toBe(true);
    expect(week.complete).toBe(false);
  });

  it('completes on seven duo days and names the day it landed on', () => {
    const week = duoWeek(membersOf(duoRun(DUO_WINDOW_DAYS)), TODAY);
    expect(week.duoDays).toBe(DUO_WINDOW_DAYS);
    expect(week.complete).toBe(true);
    expect(week.completedOn).toBe(TODAY);
  });

  it('pays nothing for six days, and takes nothing either', () => {
    // The whole ruling, in one case: a missed day is the absence of a reward,
    // never the presence of a cost. There is no field on DuoWeek that could
    // carry one, and this asserts the key set so a future edit has to change
    // the test to add one.
    const week = duoWeek(membersOf(duoRun(6, addDays(TODAY, -1))), TODAY);
    expect(week.complete).toBe(false);
    expect(week.completedOn).toBeNull();
    expect(week.duoDays).toBe(6);
    expect(Object.keys(week).sort()).toEqual(
      ['bothToday', 'complete', 'completedOn', 'days', 'duoDays'],
    );
  });

  it('ignores duo days that fell out of the back of the window', () => {
    const week = duoWeek(membersOf(duoRun(30)), TODAY);
    expect(week.duoDays).toBe(DUO_WINDOW_DAYS);
  });

  it('settles to the same completion day when run twice, so it pays once', () => {
    const members = membersOf(duoRun(DUO_WINDOW_DAYS));
    expect(duoWeek(members, TODAY).completedOn).toBe(duoWeek(members, TODAY).completedOn);
  });
});

describe('reunion', () => {
  it('offers nothing to a couple who have never logged anything', () => {
    // Nobody is coming back from anywhere on day one.
    expect(reunion(membersOf([]), TODAY)).toEqual({ awayDays: 0, offered: false });
  });

  it('does not offer while the gap is still a weekend', () => {
    const away = REUNION_AFTER_DAYS - 1;
    const state = reunion(membersOf([log(addDays(TODAY, -away), ME, 'mood')]), TODAY);
    expect(state.awayDays).toBe(away);
    expect(state.offered).toBe(false);
  });

  it('offers once the gap reaches the threshold', () => {
    const state = reunion(
      membersOf([log(addDays(TODAY, -REUNION_AFTER_DAYS), ME, 'mood')]),
      TODAY,
    );
    expect(state.awayDays).toBe(REUNION_AFTER_DAYS);
    expect(state.offered).toBe(true);
  });

  it('counts from whichever of you logged last', () => {
    const state = reunion(membersOf([
      log(addDays(TODAY, -9), ME, 'mood'),
      log(addDays(TODAY, -2), THEM, 'mood'),
    ]), TODAY);
    expect(state.awayDays).toBe(2);
    expect(state.offered).toBe(false);
  });

  it('ignores a day ahead of today rather than reading it as logged', () => {
    const state = reunion(membersOf([
      log(addDays(TODAY, 3), ME, 'mood'),
      log(addDays(TODAY, -5), THEM, 'mood'),
    ]), TODAY);
    expect(state.awayDays).toBe(5);
  });
});

describe('loyaltyPoints', () => {
  it('prices each input at its own rate', () => {
    expect(loyaltyPoints({ loggedDays: 1, duoDays: 0, questsFinished: 0, achievementXp: 0 }))
      .toBe(POINTS_PER_LOGGED_DAY);
    expect(loyaltyPoints({ loggedDays: 0, duoDays: 1, questsFinished: 0, achievementXp: 0 }))
      .toBe(POINTS_PER_DUO_DAY);
    expect(loyaltyPoints({ loggedDays: 0, duoDays: 0, questsFinished: 1, achievementXp: 0 }))
      .toBe(POINTS_PER_QUEST);
    expect(loyaltyPoints({
      loggedDays: 0, duoDays: 0, questsFinished: 0, achievementXp: ACHIEVEMENT_XP_PER_POINT * 3,
    })).toBe(3);
  });

  it('values a day you both had above the two logs that make it', () => {
    expect(POINTS_PER_DUO_DAY).toBeGreaterThan(POINTS_PER_LOGGED_DAY);
  });

  it('never returns less than zero, whatever it is handed', () => {
    expect(loyaltyPoints({
      loggedDays: -50, duoDays: -50, questsFinished: -50, achievementXp: -50,
    })).toBe(0);
  });

  it('only ever goes up as the counts do', () => {
    let last = -1;
    for (let days = 0; days < 120; days += 1) {
      const points = loyaltyPoints({
        loggedDays: days * 2, duoDays: days, questsFinished: Math.floor(days / 7),
        achievementXp: days * 3,
      });
      expect(points).toBeGreaterThan(last);
      last = points;
    }
  });
});

describe('the Together ladder', () => {
  it('starts everybody on the first rung', () => {
    expect(tierAt(0)).toBe(TOGETHER_TIERS[0]);
    expect(tierAt(TOGETHER_TIERS[1].at - 1)).toBe(TOGETHER_TIERS[0]);
  });

  it('promotes exactly at the threshold, never a point early', () => {
    for (const tier of TOGETHER_TIERS.slice(1)) {
      expect(tierAt(tier.at - 1).n).toBe(tier.n - 1);
      expect(tierAt(tier.at)).toBe(tier);
    }
  });

  it('climbs, and each rung pays more than the last', () => {
    for (let i = 1; i < TOGETHER_TIERS.length; i += 1) {
      expect(TOGETHER_TIERS[i].at).toBeGreaterThan(TOGETHER_TIERS[i - 1].at);
      expect(TOGETHER_TIERS[i].xp).toBeGreaterThan(TOGETHER_TIERS[i - 1].xp);
    }
  });

  it('names the next rung and the distance to it, and nothing at the top', () => {
    expect(nextTier(0)).toBe(TOGETHER_TIERS[1]);
    expect(pointsToNext(0)).toBe(TOGETHER_TIERS[1].at);
    const top = TOGETHER_TIERS[TOGETHER_TIERS.length - 1];
    expect(nextTier(top.at)).toBeUndefined();
    expect(pointsToNext(top.at)).toBe(0);
  });

  it('collects every rung crossed, so an offline phone is not short-changed', () => {
    // Two thresholds passed while a phone was away: it should settle both.
    const reached = tiersReached(TOGETHER_TIERS[2].at);
    expect(reached.map((t) => t.n)).toEqual([1, 2]);
  });

  it('cannot be fallen out of, because the points it reads never fall', () => {
    // The ladder has no demotion path of its own; the guarantee comes from
    // loyaltyPoints being monotone over counts that only grow. Pinned here so
    // a future edit that makes a count subtractable fails on this file too.
    let lastTier = 0;
    for (let days = 0; days < 400; days += 1) {
      const tier = tierAt(loyaltyPoints({
        loggedDays: days * 2, duoDays: days, questsFinished: Math.floor(days / 7),
        achievementXp: days * 3,
      })).n;
      expect(tier).toBeGreaterThanOrEqual(lastTier);
      lastTier = tier;
    }
  });
});
