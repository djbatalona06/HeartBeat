import { DIFFICULTY_WEIGHT, EMPTY_PAYOUT, type Payout } from '../rpg/types';
import type { Card } from './types';

/**
 * What studying is worth.
 *
 * Priced from cards *seen*, weighted by difficulty, and not by how many were
 * got right. That is the same ruling the rest of the app runs on — showing up
 * counts, and nothing in daily life takes anything away — but it matters more
 * here than anywhere else, because the material you are worst at is the
 * material worth sitting with, and an economy that pays for accuracy quietly
 * pays you to review the deck you have already learnt.
 *
 * The rates are deliberately below `task.ts`: a card is a smaller unit of
 * effort than a task, and twenty cards should be worth roughly what one medium
 * task is worth, not twenty times it.
 */

export const XP_PER_CARD = 2;
export const COINS_PER_CARD = 1;
export const ENERGY_PER_CARD = 1;
export const MP_PER_CARD = 1;

/**
 * Cards paid for per day, across every deck and both modes.
 *
 * A cap rather than a once-a-day guard, because two sittings in one day is a
 * good day and the app should not have an opinion about it. What it does stop
 * is the only way to farm this: pressing `easy` through a deck you know for the
 * XP. Past sixty cards the studying is its own reward, which is a thing the app
 * can afford to say once you have done sixty cards.
 */
export const DAILY_CARD_CAP = 60;

/**
 * How many of tonight's cards are actually paid, given what today has already
 * paid for. Never negative, never more than were reviewed.
 */
export function paidCards(alreadyPaidToday: number, reviewedNow: number): number {
  const room = Math.max(0, DAILY_CARD_CAP - Math.max(0, alreadyPaidToday));
  return Math.min(Math.max(0, reviewedNow), room);
}

/**
 * Price a set of cards. Takes the cards themselves rather than a count, because
 * difficulty is the whole reason one deck is worth more than another and a
 * count has thrown that away.
 */
export function payoutForCards(cards: Array<Pick<Card, 'difficulty'>>): Payout {
  if (cards.length === 0) return EMPTY_PAYOUT;
  const weight = cards.reduce((sum, card) => sum + DIFFICULTY_WEIGHT[card.difficulty], 0);
  return {
    xp: Math.round(XP_PER_CARD * weight),
    coins: Math.round(COINS_PER_CARD * weight),
    energy: Math.round(ENERGY_PER_CARD * weight),
    mp: Math.round(MP_PER_CARD * weight),
  };
}

/**
 * The session's payout: the cards that fit under today's cap, in the order they
 * were seen, priced together.
 *
 * Taking them in order rather than cheapest-first is the honest reading — the
 * cap is "the first sixty cards of the day", not "the sixty you would most like
 * to have been paid for".
 */
export function payoutForSession(
  reviewed: Array<Pick<Card, 'difficulty'>>,
  alreadyPaidToday: number,
): { payout: Payout; paid: number } {
  const paid = paidCards(alreadyPaidToday, reviewed.length);
  return { payout: payoutForCards(reviewed.slice(0, paid)), paid };
}
