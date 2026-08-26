import { describe, expect, it } from 'vitest';
import { DIFFICULTY_WEIGHT, type LifeEvent, type LifeEventKind } from './types';
import { payoutFor } from './task';
import {
  GOOD_VIBES_PER_SENDER_PER_DAY,
  GOOD_VIBES_SENDER_GRANT,
  LIFE_EVENT_GRANTS,
  LIFE_EVENT_LINES,
  LIFE_EVENT_NAMES,
  ONCE_PER_DAY,
  alreadyClaimed,
  canSendGoodVibes,
  checkGrant,
  goodVibesSentToday,
  grantFor,
} from './lifeEvents';

const DAY = '2026-09-25';
const KINDS = Object.keys(LIFE_EVENT_GRANTS) as LifeEventKind[];

function event(over: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'e1',
    coupleId: 'c1',
    memberId: 'her',
    kind: 'hard-day',
    day: DAY,
    grantedAt: 1,
    ...over,
  };
}

describe('life events grant and never take', () => {
  it('has no negative number anywhere in the table', () => {
    for (const kind of KINDS) {
      const grant = grantFor(kind);
      for (const [field, value] of Object.entries(grant)) {
        expect(value, `${kind}.${field}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('covers every kind with a name and a line', () => {
    for (const kind of KINDS) {
      expect(LIFE_EVENT_NAMES[kind]).toBeTruthy();
      expect(LIFE_EVENT_LINES[kind]).toBeTruthy();
    }
  });
});

describe('the restorative kinds', () => {
  const RESTORATIVE: LifeEventKind[] = ['period-start', 'sick-day', 'hard-day'];

  /**
   * The point is to make a hard day cost less, not to reward having one. So the
   * weight goes to energy — the pool that gets the pet out the door tonight —
   * and stays off XP, which is progression. If a bad week levelled you faster
   * than a good one, the game would be quietly asking for bad weeks.
   */
  it('weights energy over XP', () => {
    for (const kind of RESTORATIVE) {
      const grant = grantFor(kind);
      expect(grant.energy, kind).toBeGreaterThan(grant.xp);
    }
  });

  it('pays less XP than a single hard task', () => {
    const hardTask = payoutFor({ difficulty: 'hard', value: 0 });
    for (const kind of RESTORATIVE) {
      expect(grantFor(kind).xp, kind).toBeLessThan(hardTask.xp);
    }
    expect(DIFFICULTY_WEIGHT.hard).toBeGreaterThan(0);
  });

  it('gives a period start the largest energy grant of them all', () => {
    const period = grantFor('period-start').energy;
    for (const kind of KINDS) {
      expect(period).toBeGreaterThanOrEqual(grantFor(kind).energy);
    }
  });

  it('is claimable once a day and no more', () => {
    expect(ONCE_PER_DAY).toEqual(RESTORATIVE);
    const log = [event({ kind: 'sick-day', memberId: 'her' })];
    expect(alreadyClaimed(log, 'sick-day', 'her', DAY)).toBe(true);
    expect(checkGrant(log, 'sick-day', 'her', DAY).ok).toBe(false);
  });

  it('does not let one partner\'s claim block the other\'s', () => {
    const log = [event({ kind: 'sick-day', memberId: 'her' })];
    expect(alreadyClaimed(log, 'sick-day', 'him', DAY)).toBe(false);
  });

  it('resets the next day', () => {
    const log = [event({ kind: 'sick-day', memberId: 'her', day: '2026-09-24' })];
    expect(alreadyClaimed(log, 'sick-day', 'her', DAY)).toBe(false);
  });
});

describe('Good Vibes', () => {
  /**
   * Finch's friend feature, and the single best fit for a two-person app in
   * either game: it makes your partner a source of progress rather than a
   * rival, which is this app's whole thesis.
   */
  it('is the one grant that carries more XP than the restorative kinds', () => {
    expect(grantFor('good-vibes').xp).toBeGreaterThan(grantFor('hard-day').xp);
  });

  it('pays the sender something too, or nobody sends', () => {
    expect(GOOD_VIBES_SENDER_GRANT.xp).toBeGreaterThan(0);
    // Less than the recipient gets: it is a gift, not a trade.
    expect(GOOD_VIBES_SENDER_GRANT.xp).toBeLessThan(grantFor('good-vibes').xp);
    expect(GOOD_VIBES_SENDER_GRANT.energy).toBeLessThan(grantFor('good-vibes').energy);
  });

  it('cannot be sent to yourself', () => {
    const result = checkGrant([], 'good-vibes', 'her', DAY, 'her');
    expect(result.ok).toBe(false);
  });

  it('needs a sender', () => {
    expect(checkGrant([], 'good-vibes', 'her', DAY).ok).toBe(false);
  });

  it('goes through from the other person', () => {
    expect(checkGrant([], 'good-vibes', 'her', DAY, 'him').ok).toBe(true);
  });

  it('is capped per sender per day, so it keeps its weight', () => {
    const sent = Array.from({ length: GOOD_VIBES_PER_SENDER_PER_DAY }, (_, i) =>
      event({ id: `g${i}`, kind: 'good-vibes', memberId: 'her', fromMemberId: 'him' }));
    expect(goodVibesSentToday(sent, 'him', DAY)).toBe(GOOD_VIBES_PER_SENDER_PER_DAY);
    expect(canSendGoodVibes(sent, 'him', DAY)).toBe(false);
    expect(checkGrant(sent, 'good-vibes', 'her', DAY, 'him').ok).toBe(false);
  });

  it('counts the sender\'s own day, not the recipient\'s whole inbox', () => {
    const sent = [
      event({ id: 'a', kind: 'good-vibes', memberId: 'her', fromMemberId: 'him' }),
      event({ id: 'b', kind: 'good-vibes', memberId: 'him', fromMemberId: 'her' }),
    ];
    expect(goodVibesSentToday(sent, 'him', DAY)).toBe(1);
    expect(canSendGoodVibes(sent, 'him', DAY)).toBe(true);
  });
});
