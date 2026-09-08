import { describe, expect, it } from 'vitest';
import { DAILY_CARD_CAP, paidCards, payoutForCards, payoutForSession } from './payout';
import { EMPTY_PAYOUT } from '../rpg/types';
import { payoutFor } from '../rpg/task';
import type { TaskDifficulty } from '../rpg/types';

const cards = (n: number, difficulty: TaskDifficulty = 'easy') =>
  Array.from({ length: n }, () => ({ difficulty }));

describe('pricing cards', () => {
  it('pays nothing for nothing', () => {
    expect(payoutForCards([])).toEqual(EMPTY_PAYOUT);
  });

  it('pays more for a hard card than an easy one', () => {
    expect(payoutForCards(cards(10, 'hard')).xp)
      .toBeGreaterThan(payoutForCards(cards(10, 'easy')).xp);
  });

  it('scales with the number seen', () => {
    expect(payoutForCards(cards(20)).xp).toBe(payoutForCards(cards(10)).xp * 2);
  });

  it('keeps a card worth much less than a task', () => {
    // Twenty cards should be in the neighbourhood of one medium task, not
    // twenty times it. This is the rate check that stops studying becoming the
    // cheapest XP in the app.
    const task = payoutFor({ difficulty: 'medium', value: 0 });
    const twenty = payoutForCards(cards(20));
    expect(twenty.xp).toBeLessThan(task.xp * 5);
    expect(payoutForCards(cards(1)).xp).toBeLessThan(task.xp);
  });
});

describe('the daily cap', () => {
  it('pays every card on a normal night', () => {
    expect(paidCards(0, 25)).toBe(25);
  });

  it('pays only the room that is left', () => {
    expect(paidCards(DAILY_CARD_CAP - 5, 25)).toBe(5);
  });

  it('pays nothing once the day is spent, and never goes negative', () => {
    expect(paidCards(DAILY_CARD_CAP, 25)).toBe(0);
    expect(paidCards(DAILY_CARD_CAP + 100, 25)).toBe(0);
  });

  it('allows a second sitting on the same day', () => {
    // The guard is a cap on cards, not a once-a-day lock: two sessions in one
    // evening is a good evening, and the app should not have an opinion.
    expect(paidCards(20, 20)).toBe(20);
  });
});

describe('a session', () => {
  it('reports what it paid for as well as what it paid', () => {
    const { payout, paid } = payoutForSession(cards(30), 45);
    expect(paid).toBe(15);
    expect(payout.xp).toBe(payoutForCards(cards(15)).xp);
  });

  it('pays nothing at all once the cap is reached', () => {
    const { payout, paid } = payoutForSession(cards(30), DAILY_CARD_CAP);
    expect(paid).toBe(0);
    expect(payout).toEqual(EMPTY_PAYOUT);
  });

  it('takes the first cards of the sitting, not the most valuable', () => {
    const mixed = [...cards(2, 'trivial'), ...cards(2, 'hard')];
    const { payout } = payoutForSession(mixed, DAILY_CARD_CAP - 2);
    expect(payout).toEqual(payoutForCards(cards(2, 'trivial')));
  });

  it('cannot be farmed by pressing easy through a known deck', () => {
    const first = payoutForSession(cards(60), 0);
    const second = payoutForSession(cards(60), first.paid);
    expect(second.payout).toEqual(EMPTY_PAYOUT);
  });
});
