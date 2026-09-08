import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, saveSettings } from './database';
import {
  finishSession,
  gradeCard,
  paidToday,
  progressForDeck,
  sessionsOn,
} from './study.repository';
import { getOrCreateAvatar } from './repository';
import { levelOf } from '../domain/rpg/avatar';
import { DAILY_CARD_CAP, payoutForCards } from '../domain/study/payout';
import { EASE_START } from '../domain/study/srs';
import type { Card } from '../domain/study/types';

/**
 * The seam where the study rules would get lost quietly. Three are pinned here:
 * the daily cap surviving across two sittings, the payout landing on the pet
 * and the avatar together, and — the one that matters most — that no path
 * through this file takes anything away.
 */

const HER = 'member-a';
const COUPLE = 'couple-1';
const DAY = '2026-09-25';

function card(i: number, difficulty: Card['difficulty'] = 'easy'): Card {
  return {
    id: `c${i}`,
    deckId: 'js',
    question: `q${i}`,
    answer: `a${i}`,
    why: `because ${i}`,
    difficulty,
  };
}

const cards = (n: number, difficulty: Card['difficulty'] = 'easy') =>
  Array.from({ length: n }, (_, i) => card(i, difficulty));

beforeEach(async () => {
  await db.delete();
  await db.open();
  await saveSettings({ memberId: HER, coupleId: COUPLE });
});

describe('grading a card', () => {
  it('creates progress on the first press and carries it forward on the next', async () => {
    const first = await gradeCard(card(1), 'good', DAY);
    expect(first.reviews).toBe(1);
    expect(first.ease).toBe(EASE_START);
    expect(first.interval).toBe(1);

    const second = await gradeCard(card(1), 'good', first.dueOn);
    expect(second.reviews).toBe(2);
    expect(second.interval).toBe(6);
  });

  it('stores one row per card, keyed by the card', async () => {
    await gradeCard(card(1), 'good', DAY);
    await gradeCard(card(1), 'good', DAY);
    await gradeCard(card(2), 'again', DAY);
    expect(await db.studyProgress.count()).toBe(2);
  });

  it('reads back as a map the queue can use', async () => {
    await gradeCard(card(1), 'good', DAY);
    const progress = await progressForDeck('js');
    expect(progress.get('c1')?.reviews).toBe(1);
    expect(progress.has('c2')).toBe(false);
  });

  it('keeps decks apart', async () => {
    await gradeCard({ id: 'x1', deckId: 'git' }, 'good', DAY);
    await gradeCard(card(1), 'good', DAY);
    expect((await progressForDeck('js')).size).toBe(1);
    expect((await progressForDeck('git')).size).toBe(1);
  });
});

describe('finishing a sitting', () => {
  it('pays the pet and the avatar together', async () => {
    const receipt = await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(10), correct: 8, elapsedMs: 60_000,
    });

    expect(receipt.paid).toBe(10);
    expect(receipt.payout).toEqual(payoutForCards(cards(10)));

    const avatar = await getOrCreateAvatar(HER, COUPLE);
    expect(avatar.xp).toBe(receipt.payout.xp);

    const pet = await db.pet.get(COUPLE);
    expect(pet?.xp).toBe(receipt.payout.xp);
  });

  it('records the sitting, including what it was paid for', async () => {
    await finishSession({
      deckId: 'js', day: DAY, mode: 'quiz', reviewed: cards(5), correct: 4, elapsedMs: 30_000,
    });
    const [session] = await sessionsOn(DAY);
    expect(session.mode).toBe('quiz');
    expect(session.reviewed).toBe(5);
    expect(session.correct).toBe(4);
    expect(session.paid).toBe(5);
  });

  it('reports a level when the sitting bought one', async () => {
    const receipt = await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(40, 'hard'), correct: 40,
      elapsedMs: 60_000,
    });
    expect(receipt.levelAfter).toBeGreaterThan(receipt.levelBefore);
    expect(receipt.levelAfter).toBe(levelOf(await getOrCreateAvatar(HER, COUPLE)));
  });
});

describe('the daily cap, across sittings', () => {
  it('lets a second sitting on the same day be paid', async () => {
    await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(20), correct: 20, elapsedMs: 1000,
    });
    const second = await finishSession({
      deckId: 'git', day: DAY, mode: 'review', reviewed: cards(20), correct: 20, elapsedMs: 1000,
    });
    expect(second.paid).toBe(20);
  });

  it('prices the second sitting against what the first already took', async () => {
    await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(50), correct: 50, elapsedMs: 1000,
    });
    const second = await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(30), correct: 30, elapsedMs: 1000,
    });
    expect(second.paid).toBe(DAILY_CARD_CAP - 50);
  });

  it('pays nothing once the day is spent, and cannot be farmed', async () => {
    await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(DAILY_CARD_CAP), correct: 60,
      elapsedMs: 1000,
    });
    const xpAfterFirst = (await getOrCreateAvatar(HER, COUPLE)).xp;

    const third = await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(40), correct: 40, elapsedMs: 1000,
    });
    expect(third.paid).toBe(0);
    expect(third.payout.xp).toBe(0);
    expect((await getOrCreateAvatar(HER, COUPLE)).xp).toBe(xpAfterFirst);
  });

  it('starts over the next day', async () => {
    await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(DAILY_CARD_CAP), correct: 60,
      elapsedMs: 1000,
    });
    expect(await paidToday(DAY)).toBe(DAILY_CARD_CAP);
    expect(await paidToday('2026-09-26')).toBe(0);

    const tomorrow = await finishSession({
      deckId: 'js', day: '2026-09-26', mode: 'review', reviewed: cards(10), correct: 10,
      elapsedMs: 1000,
    });
    expect(tomorrow.paid).toBe(10);
  });
});

describe('the ruling', () => {
  it('has no path that reduces XP, energy, coins or MP', async () => {
    const before = await getOrCreateAvatar(HER, COUPLE);
    await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(20), correct: 20, elapsedMs: 1000,
    });
    // Every card graded `again` — the worst possible sitting.
    for (const c of cards(20)) await gradeCard(c, 'again', DAY);

    const after = await getOrCreateAvatar(HER, COUPLE);
    expect(after.xp).toBeGreaterThanOrEqual(before.xp);
    expect(after.coins).toBeGreaterThanOrEqual(before.coins);
    expect(after.energy).toBeGreaterThanOrEqual(before.energy);
    expect(after.mp).toBeGreaterThanOrEqual(before.mp);
  });

  it('pays a sitting nobody got right exactly as much as one they aced', async () => {
    const missed = await finishSession({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(10), correct: 0, elapsedMs: 1000,
    });
    const aced = await finishSession({
      deckId: 'git', day: '2026-09-26', mode: 'review', reviewed: cards(10), correct: 10,
      elapsedMs: 1000,
    });
    expect(missed.payout).toEqual(aced.payout);
  });
});
