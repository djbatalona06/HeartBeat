import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportState,
  importState,
  isVolatile,
  localStudyStore as store,
  resetForTests,
} from './localStudyStore';
import { DAILY_CARD_CAP } from '../domain/study/payout';
import type { Card } from '../domain/study/types';

/**
 * The standalone store, and specifically the case the app version never has to
 * face: storage that throws. A `file://` page in Chrome does exactly that, and
 * a study page that white-screens when double-clicked would defeat the point of
 * shipping one file.
 */

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

const cards = (n: number) => Array.from({ length: n }, (_, i) => card(i));

/** A localStorage that works, standing in for the browser's. */
function workingStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

/** A localStorage that throws on every touch, as an opaque origin's does. */
function throwingStorage() {
  const boom = () => { throw new DOMException('denied', 'SecurityError'); };
  return {
    get length() { return boom(); },
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
    key: boom,
  } as unknown as Storage;
}

beforeEach(() => {
  resetForTests();
  vi.stubGlobal('localStorage', workingStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('with storage that works', () => {
  it('keeps a graded card', async () => {
    await store.grade(card(1), 'good', DAY);
    resetForTests();
    const progress = await store.progressFor('js');
    expect(progress.get('c1')?.reviews).toBe(1);
  });

  it('keeps decks apart', async () => {
    await store.grade({ id: 'x1', deckId: 'git' }, 'good', DAY);
    await store.grade(card(1), 'good', DAY);
    expect((await store.progressFor('js')).size).toBe(1);
    expect((await store.progressFor('git')).size).toBe(1);
  });

  it('pays a sitting and reports a level', async () => {
    const receipt = await store.finish({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(10), correct: 8, elapsedMs: 1000,
    });
    expect(receipt.paid).toBe(10);
    expect(receipt.payout.xp).toBeGreaterThan(0);
    expect(receipt.levelBefore).toBe(1);
  });

  it('applies the same daily cap the app does', async () => {
    await store.finish({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(DAILY_CARD_CAP), correct: 0,
      elapsedMs: 1000,
    });
    const second = await store.finish({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(10), correct: 0, elapsedMs: 1000,
    });
    expect(second.paid).toBe(0);
    expect(second.payout.xp).toBe(0);
  });

  it('starts the cap over the next day', async () => {
    await store.finish({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(DAILY_CARD_CAP), correct: 0,
      elapsedMs: 1000,
    });
    expect(await store.paidToday(DAY)).toBe(DAILY_CARD_CAP);
    expect(await store.paidToday('2026-09-26')).toBe(0);
  });

  it('accumulates XP across sittings', async () => {
    const first = await store.finish({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(10), correct: 10, elapsedMs: 1000,
    });
    const second = await store.finish({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(10), correct: 10, elapsedMs: 1000,
    });
    expect(second.levelBefore).toBeGreaterThanOrEqual(first.levelAfter);
  });
});

describe('with storage that throws, as a file:// page has', () => {
  beforeEach(() => {
    resetForTests();
    vi.stubGlobal('localStorage', throwingStorage());
  });

  it('still grades, still schedules, still pays', async () => {
    const graded = await store.grade(card(1), 'good', DAY);
    expect(graded.interval).toBe(1);

    const receipt = await store.finish({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(5), correct: 5, elapsedMs: 1000,
    });
    expect(receipt.paid).toBe(5);
    expect(receipt.payout.xp).toBeGreaterThan(0);
  });

  it('holds the sitting in memory so the page is usable', async () => {
    await store.grade(card(1), 'good', DAY);
    await store.grade(card(2), 'good', DAY);
    expect((await store.progressAll()).size).toBe(2);
  });

  it('says so, so the page can tell the reader rather than looking broken', async () => {
    await store.grade(card(1), 'good', DAY);
    expect(isVolatile()).toBe(true);
  });

  it('loses it on reload, which is exactly what export is for', async () => {
    await store.grade(card(1), 'good', DAY);
    const saved = exportState();
    resetForTests();
    expect((await store.progressAll()).size).toBe(0);

    expect(importState(saved)).toBe(true);
    expect((await store.progressAll()).size).toBe(1);
  });
});

describe('export and import', () => {
  it('round-trips the whole record', async () => {
    await store.grade(card(1), 'good', DAY);
    await store.finish({
      deckId: 'js', day: DAY, mode: 'review', reviewed: cards(3), correct: 3, elapsedMs: 1000,
    });
    const saved = exportState();

    resetForTests();
    vi.stubGlobal('localStorage', workingStorage());
    expect((await store.progressAll()).size).toBe(0);

    expect(importState(saved)).toBe(true);
    expect((await store.progressAll()).size).toBe(1);
    expect(await store.paidToday(DAY)).toBe(3);
  });

  it('refuses a file that is not one of these rather than throwing', () => {
    expect(importState('not json at all')).toBe(false);
    expect(importState('{"hello":"world"}')).toBe(false);
    expect(importState(JSON.stringify({ version: 99, progress: {} }))).toBe(false);
  });

  it('leaves the existing record alone when an import is refused', async () => {
    await store.grade(card(1), 'good', DAY);
    importState('rubbish');
    expect((await store.progressAll()).size).toBe(1);
  });

  it('ignores a state written by a newer build rather than half-reading it', async () => {
    localStorage.setItem('heartbeat.study', JSON.stringify({ version: 99, progress: { c1: {} } }));
    resetForTests();
    expect((await store.progressAll()).size).toBe(0);
  });
});
