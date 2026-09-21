import { describe, expect, it } from 'vitest';
import {
  notices, pruneDismissed, rollup, shouldShowHeader, type NoticeInput, type WagerNotice,
} from './events';
import { BADGE_KEYS, type Badge, type BadgeKey } from './derive';
import type { WagerStep } from '../wager/engine';

/** Badges in the shape `deriveBadges` hands back, with the counts under test. */
function badges(counts: Partial<Record<BadgeKey, number>>): Record<BadgeKey, Badge> {
  return Object.fromEntries(
    BADGE_KEYS.map((key) => [key, { key, count: counts[key] ?? 0, label: '' }]),
  ) as Record<BadgeKey, Badge>;
}

const wager = (step: WagerStep, over: Partial<WagerNotice> = {}): WagerNotice => ({
  id: 'wager-1',
  step,
  target: 3,
  daysLeft: 4,
  ...over,
});

const input = (over: Partial<NoticeInput> = {}): NoticeInput => ({
  badges: badges({}),
  ...over,
});

describe('what is waiting', () => {
  it('says nothing when nothing is', () => {
    expect(notices(input())).toEqual([]);
    expect(rollup(notices(input()))).toBeNull();
    expect(shouldShowHeader(notices(input()))).toBe(false);
  });

  it('names a finished quest, singular and plural', () => {
    expect(notices(input({ badges: badges({ quests: 1 }) }))[0].text)
      .toContain('A quest is finished');
    expect(notices(input({ badges: badges({ quests: 3 }) }))[0].text)
      .toContain('3 quests are finished');
  });

  it('names a cheer, singular and plural', () => {
    expect(notices(input({ badges: badges({ cheers: 1 }) }))[0].text)
      .toContain('They cheered something');
    expect(notices(input({ badges: badges({ cheers: 2 }) }))[0].text)
      .toContain('cheered 2 things');
  });

  /**
   * Messages have the chat pill and `BADGE_ROUTES` gives them no route. Saying
   * it twice would make the header something people learn to ignore, and then
   * the quest payout goes unread too.
   */
  it('leaves messages to the chat pill', () => {
    expect(notices(input({ badges: badges({ messages: 5 }) }))).toEqual([]);
  });

  /** What the app owes you, then what your partner gave you, then news. */
  it('puts a payout ahead of a cheer, and both ahead of the wager', () => {
    const list = notices(input({
      badges: badges({ quests: 1, cheers: 1 }),
      wager: wager({ verb: 'running', short: 2 }),
    }));
    expect(list.map((notice) => notice.kind)).toEqual(['quest', 'cheer', 'wager']);
  });
});

describe('the wager line', () => {
  it('counts down the week in words, as a sentence', () => {
    const list = notices(input({
      wager: wager({ verb: 'running', short: 2 }, { daysLeft: 3 }),
    }));
    expect(list[0].text).toBe('Three days left on the 3-workout week.');
  });

  it('announces a win with what the birb got', () => {
    const list = notices(input({ wager: wager({ verb: 'won', award: 66 }) }));
    expect(list[0].text).toContain('The week is yours');
    expect(list[0].text).toContain('66 XP');
  });

  it('says nothing about a week already settled', () => {
    expect(notices(input({ wager: wager({ verb: 'settled', met: true }) }))).toEqual([]);
    expect(notices(input({ wager: wager({ verb: 'settled', met: false }) }))).toEqual([]);
  });

  /**
   * The week ran out and nothing was taken. Putting "you did not manage it"
   * across the top of every screen is the deficit this whole layer exists to
   * make impossible — the same position `schedule.ts` takes about push and
   * `derive.ts` about badges.
   */
  it('never tells anybody they missed it', () => {
    expect(notices(input({ wager: wager({ verb: 'missed' }) }))).toEqual([]);
  });

  it('is news rather than something owed, so it can be put away', () => {
    const list = notices(input({ wager: wager({ verb: 'running', short: 1 }) }));
    expect(list[0].clears).toBe('dismissing');
  });
});

describe('what can be waved away', () => {
  /** A payout you earned is owed to you; only claiming it clears it. */
  it('refuses to let a payout be dismissed', () => {
    const list = notices(input({ badges: badges({ quests: 2 }) }));
    expect(list[0].clears).toBe('claiming');
    // Even asked to, and even if a stale id arrives from another version.
    expect(rollup(list, ['quest:2'])?.lead.kind).toBe('quest');
  });

  it('refuses to let a cheer be dismissed, since looking at it clears it', () => {
    const list = notices(input({ badges: badges({ cheers: 1 }) }));
    expect(list[0].clears).toBe('claiming');
    expect(rollup(list, ['cheer:1'])).not.toBeNull();
  });

  it('lets a wager note go, and promotes whatever was behind it', () => {
    const list = notices(input({
      badges: badges({ cheers: 1 }),
      wager: wager({ verb: 'running', short: 2 }),
    }));
    const wagerId = list.find((n) => n.kind === 'wager')!.id;
    // The cheer leads either way; dismissing the wager drops the "and 1 more".
    expect(rollup(list)).toEqual({ lead: list[0], more: 1 });
    expect(rollup(list, [wagerId])).toEqual({ lead: list[0], more: 0 });
  });

  it('shows nothing once the only notice is dismissed', () => {
    const list = notices(input({ wager: wager({ verb: 'running', short: 2 }) }));
    expect(rollup(list, [list[0].id])).toBeNull();
    expect(shouldShowHeader(list, [list[0].id])).toBe(false);
  });

  /**
   * Ids are per-state, which is what makes dismissal safe: putting away
   * "three days left" must not silence the line for the rest of the week.
   */
  it('comes back when the news changes', () => {
    const today = notices(input({
      wager: wager({ verb: 'running', short: 3 }, { daysLeft: 3 }),
    }));
    const tomorrow = notices(input({
      wager: wager({ verb: 'running', short: 2 }, { daysLeft: 2 }),
    }));
    expect(today[0].id).not.toBe(tomorrow[0].id);
    expect(rollup(today, [today[0].id])).toBeNull();
    expect(rollup(tomorrow, [today[0].id])).not.toBeNull();
  });

  it('keeps a quest line honest when its count changes', () => {
    expect(notices(input({ badges: badges({ quests: 1 }) }))[0].id)
      .not.toBe(notices(input({ badges: badges({ quests: 2 }) }))[0].id);
  });
});

describe('the rollup', () => {
  it('reports one line and how many are behind it', () => {
    const list = notices(input({
      badges: badges({ quests: 1, cheers: 1 }),
      wager: wager({ verb: 'running', short: 2 }),
    }));
    const result = rollup(list)!;
    expect(result.lead.kind).toBe('quest');
    expect(result.more).toBe(2);
  });

  it('reports nothing behind a lone notice', () => {
    const list = notices(input({ badges: badges({ quests: 1 }) }));
    expect(rollup(list)!.more).toBe(0);
  });
});

describe('keeping the dismissal list bounded', () => {
  /**
   * Ids are per-state, so a device accumulates one per week and per quest
   * count over a year — and the list lives in Settings and syncs.
   */
  it('drops ids for news that is over', () => {
    const list = notices(input({ wager: wager({ verb: 'running', short: 2 }) }));
    expect(pruneDismissed(list, ['wager-old:d7', 'quest:9', list[0].id]))
      .toEqual([list[0].id]);
  });

  it('empties entirely once nothing is waiting', () => {
    expect(pruneDismissed([], ['quest:3', 'wager-1:d4'])).toEqual([]);
  });
});
