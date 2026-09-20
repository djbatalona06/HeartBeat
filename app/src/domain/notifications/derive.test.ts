import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BADGE_KEYS, BADGE_ROUTES, HEADLINE_KEYS, byRoute, deriveBadges, headline,
  type BadgeInput, type BadgeKey,
} from './derive';
import type { Quest } from '../types';
import type { Cheer } from '../rpg/types';

const TODAY = '2026-09-16';
const ME = 'me';
const THEM = 'them';

function quest(over: Partial<Quest> = {}): Quest {
  return {
    id: 'q1', coupleId: 'c', templateId: 't', difficulty: 'steady',
    title: 'Walk together', target: 3, progress: 0, xp: 40,
    expiresAt: Date.parse('2026-12-31'), startedOn: '2026-09-10', endsOn: '2026-09-20',
    ...over,
  } as Quest;
}

function cheer(over: Partial<Cheer> = {}): Cheer {
  return {
    id: 'e1:them', coupleId: 'c', memberId: THEM, eventId: 'e1',
    createdAt: 100, updatedAt: 100, ...over,
  };
}

function input(over: Partial<BadgeInput> = {}): BadgeInput {
  return {
    memberId: ME, today: TODAY, seen: {},
    messages: [], cheers: [], quests: [], ...over,
  };
}

describe('deriveBadges', () => {
  it('is quiet when nothing is waiting', () => {
    const badges = deriveBadges(input());
    for (const key of BADGE_KEYS) expect(badges[key].count, key).toBe(0);
  });

  it('returns every key even when empty, so a typo cannot render as silence', () => {
    const badges = deriveBadges(input());
    expect(Object.keys(badges).sort()).toEqual([...BADGE_KEYS].sort());
  });

  describe('messages', () => {
    const theirs = (createdAt: number) => ({ mine: false, createdAt });
    const mine = (createdAt: number) => ({ mine: true, createdAt });

    it('counts only their messages, newer than the last look', () => {
      const badges = deriveBadges(input({
        seen: { messages: 50 },
        messages: [theirs(10), theirs(60), theirs(70), mine(80)],
      }));
      expect(badges.messages.count).toBe(2);
    });

    it('counts everything when the thread has never been opened', () => {
      // The fresh-install case: history arrives from the other phone all at
      // once, and none of it has been read.
      expect(deriveBadges(input({ messages: [theirs(1), theirs(2)] })).messages.count).toBe(2);
    });

    it('never counts your own', () => {
      expect(deriveBadges(input({ messages: [mine(1), mine(2)] })).messages.count).toBe(0);
    });

    /**
     * The bug this whole module replaces.
     *
     * `ChatPanel` held the count in a `useRef(0)`, so a reload reset it and
     * three waiting messages showed nothing. A watermark is durable state, so
     * the same input gives the same answer however many times the app restarts.
     */
    it('survives a reload: the same state derives the same count', () => {
      const state = input({ seen: { messages: 50 }, messages: [theirs(60), theirs(70)] });
      expect(deriveBadges(state).messages.count).toBe(2);
      expect(deriveBadges(state).messages.count).toBe(2);
    });

    it('clears once the watermark passes the newest message', () => {
      expect(deriveBadges(input({
        seen: { messages: 70 }, messages: [theirs(60), theirs(70)],
      })).messages.count).toBe(0);
    });
  });

  describe('cheers', () => {
    it('counts their cheers, newer than the last look', () => {
      const badges = deriveBadges(input({
        seen: { cheers: 50 },
        cheers: [cheer({ id: 'a', createdAt: 10 }), cheer({ id: 'b', createdAt: 60 })],
      }));
      expect(badges.cheers.count).toBe(1);
    });

    it('never counts your own cheer as news to you', () => {
      const badges = deriveBadges(input({
        cheers: [cheer({ id: 'a', memberId: ME, createdAt: 60 })],
      }));
      expect(badges.cheers.count).toBe(0);
    });
  });

  describe('quests', () => {
    it('counts a finished quest whose award has not been taken', () => {
      const badges = deriveBadges(input({ quests: [quest({ progress: 3, target: 3 })] }));
      expect(badges.quests.count).toBe(1);
    });

    it('does not count one still running', () => {
      expect(deriveBadges(input({ quests: [quest({ progress: 1 })] })).quests.count).toBe(0);
    });

    it('does not count one that already paid', () => {
      const paid = quest({ progress: 3, target: 3, completedAt: Date.parse('2026-09-15') });
      expect(deriveBadges(input({ quests: [paid] })).quests.count).toBe(0);
    });

    it('does not count one that expired unfinished', () => {
      const gone = quest({ progress: 1, endsOn: '2026-09-01' });
      expect(deriveBadges(input({ quests: [gone] })).quests.count).toBe(0);
    });

    /**
     * Quests are not watermarked, and that is correct. A finished quest clears
     * itself by being claimed, so a "seen" stamp would hide a payout the
     * person still has not taken — the exact failure a badge is meant to
     * prevent. Only the keys that cannot self-clear carry a watermark.
     */
    it('ignores a seen watermark, because claiming is what clears it', () => {
      const ready = [quest({ progress: 3, target: 3 })];
      expect(deriveBadges(input({ quests: ready, seen: { quests: Date.now() } }))
        .quests.count).toBe(1);
    });
  });

  describe('labels', () => {
    it('reads like a person wrote it, singular and plural', () => {
      const one = deriveBadges(input({ messages: [{ mine: false, createdAt: 1 }] }));
      expect(one.messages.label).toBe('1 unread message');
      const two = deriveBadges(input({
        messages: [{ mine: false, createdAt: 1 }, { mine: false, createdAt: 2 }],
      }));
      expect(two.messages.label).toBe('2 unread messages');
    });

    /**
     * The trap, as a test.
     *
     * Every badge in this app is an invitation. If a label ever tells somebody
     * they missed, failed, or owe something, the badge has become a scold with
     * a red circle on it and this fails — which is the point at which somebody
     * has to come and argue with the header of `derive.ts` rather than quietly
     * shipping it.
     */
    it('never blames the person reading it', () => {
      const BLAMING = /missed|overdue|late|behind|forgot|failed|owe|streak lost|don't lose/i;
      const loud = deriveBadges(input({
        messages: [{ mine: false, createdAt: 1 }],
        cheers: [cheer()],
        quests: [quest({ progress: 3, target: 3 })],
      }));
      for (const key of BADGE_KEYS) {
        expect(loud[key].label, `${key}: ${loud[key].label}`).not.toMatch(BLAMING);
      }
    });
  });
});

describe('byRoute', () => {
  it('maps the routed keys and drops the empty ones', () => {
    const badges = deriveBadges(input({
      cheers: [cheer()],
      quests: [quest({ progress: 3, target: 3 })],
    }));
    expect(byRoute(badges)).toEqual({ '/friends': 1, '/quests': 1 });
  });

  it('leaves messages out, because the thread is not a route', () => {
    const badges = deriveBadges(input({ messages: [{ mine: false, createdAt: 1 }] }));
    expect(byRoute(badges)).toEqual({});
  });

  it('sums two keys that land on one tab rather than letting one win', () => {
    // Guards the shape rather than today's routing: the moment a second key
    // points at `/quests`, an overwrite would silently under-count.
    const badges = deriveBadges(input({ quests: [quest({ progress: 3, target: 3 })] }));
    const doubled = byRoute({ ...badges, cheers: { ...badges.cheers, count: 2 } });
    const routes = new Set(Object.values(BADGE_ROUTES));
    expect(Object.keys(doubled).every((r) => routes.has(r))).toBe(true);
  });

  it('never emits a zero, which would render an empty circle', () => {
    expect(Object.values(byRoute(deriveBadges(input())))).toEqual([]);
  });
});

describe('the rule', () => {
  /**
   * `BadgeDot`'s header says no component computes its own dot, and a comment
   * cannot enforce itself.
   *
   * This walks the real source for the exact shape the old counter had: a
   * component holding its own unread tally in state. That counter is why this
   * module exists — it was correct until you reloaded, and then it silently
   * said zero. Narrow on purpose: it pins the regression that actually
   * happened rather than trying to describe every possible one, and a narrow
   * guard that holds beats a broad one that gets deleted for crying wolf.
   */
  it('leaves no component holding its own unread tally', () => {
    const SRC = fileURLToPath(new URL('../..', import.meta.url));
    const HAND_ROLLED = /\bsetUnread\b|\bunreadCount\b|\bseen\.current\b/;

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.test.ts')) continue;
        if (full.includes(join('domain', 'notifications'))) continue;
        if (HAND_ROLLED.test(readFileSync(full, 'utf8'))) {
          offenders.push(relative(SRC, full));
        }
      }
    };
    walk(SRC);

    expect(offenders, 'these compute their own badge — read derive.ts').toEqual([]);
  });

  it('routes every key that has one to a real destination', () => {
    for (const [key, to] of Object.entries(BADGE_ROUTES)) {
      expect(BADGE_KEYS, `${key} is not a badge key`).toContain(key as BadgeKey);
      expect(to, `${key} routes nowhere`).toMatch(/^\//);
    }
  });
});

describe('headline', () => {
  const badgesWith = (over: Partial<BadgeInput> = {}) => deriveBadges(input(over));

  it('says nothing when nothing is waiting', () => {
    expect(headline(badgesWith())).toBeNull();
  });

  it('leads with a finished quest, because that is what the app owes you', () => {
    const line = headline(badgesWith({
      quests: [quest({ progress: 3, target: 3 })],
      cheers: [cheer({ createdAt: 60 })],
    }));
    expect(line?.key).toBe('quests');
    expect(line?.to).toBe('/quests');
    expect(line?.text).toBe('A quest is finished. The payout is waiting.');
  });

  it('falls to the cheer when no quest is finished', () => {
    const line = headline(badgesWith({
      quests: [quest({ progress: 1 })],
      cheers: [cheer({ createdAt: 60 })],
    }));
    expect(line?.key).toBe('cheers');
    expect(line?.to).toBe('/friends');
    expect(line?.text).toBe('They cheered something you logged.');
  });

  it('counts in words a person would use', () => {
    const many = headline(badgesWith({
      quests: [
        quest({ id: 'a', progress: 3, target: 3 }),
        quest({ id: 'b', progress: 3, target: 3 }),
      ],
    }));
    expect(many?.text).toBe('2 quests are finished. The payouts are waiting.');

    const cheers = headline(badgesWith({
      cheers: [
        cheer({ id: 'a', eventId: 'e1', createdAt: 60 }),
        cheer({ id: 'b', eventId: 'e2', createdAt: 61 }),
        cheer({ id: 'c', eventId: 'e3', createdAt: 62 }),
      ],
    }));
    expect(cheers?.text).toBe('They cheered 3 things you logged.');
  });

  /**
   * The thread is a sheet reached from a pill above the tab bar, which is why
   * `BADGE_ROUTES` gives `messages` no route. Saying it a second time across
   * the top of every screen is how a header becomes something people learn to
   * ignore — and then the quest payout goes unread too.
   */
  it('never speaks for messages, which have their own surface', () => {
    const line = headline(badgesWith({
      messages: [{ mine: false, createdAt: 60 }],
    }));
    expect(line).toBeNull();
    expect(HEADLINE_KEYS).not.toContain('messages' as BadgeKey);
  });

  /**
   * The header restates a badge and never derives a count of its own. That is
   * what keeps `derive.ts`'s posture rule — every badge is somebody offering
   * you something — true of the loudest surface in the app as well as the
   * quietest.
   */
  it('only ever speaks for a real badge key with a real route', () => {
    for (const key of HEADLINE_KEYS) {
      expect(BADGE_KEYS, `${key} is not a badge key`).toContain(key);
      expect(BADGE_ROUTES[key], `${key} routes nowhere`).toMatch(/^\//);
    }
  });

  it('is quiet once the badge it restates is cleared', () => {
    // A cheer already looked at. The dot goes, and so must the sentence.
    const line = headline(badgesWith({
      seen: { cheers: 100 },
      cheers: [cheer({ createdAt: 60 })],
    }));
    expect(line).toBeNull();
  });
});
