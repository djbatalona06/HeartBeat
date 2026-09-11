import { describe, expect, it } from 'vitest';
import { buildFeed, canCheer, cheerId } from './feed';
import { authorOf } from './lifeEvents';
import type { Cheer, LifeEvent } from './types';

const AT = 1_700_000_000_000;
const ME = 'me';
const THEM = 'them';
const DAY = '2026-09-25';

function event(over: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'e1', coupleId: 'c1', memberId: ME, kind: 'hard-day',
    day: DAY, grantedAt: AT, updatedAt: AT, ...over,
  };
}

/** Addressed to ME, written by THEM. */
function vibeToMe(over: Partial<LifeEvent> = {}): LifeEvent {
  return event({ id: 'e-vibe', kind: 'good-vibes', memberId: ME, fromMemberId: THEM, ...over });
}

function cheer(over: Partial<Cheer> = {}): Cheer {
  return {
    id: cheerId('e1', ME), coupleId: 'c1', memberId: ME, eventId: 'e1',
    createdAt: AT, updatedAt: AT, ...over,
  };
}

describe('authorOf', () => {
  /**
   * The trap. A Good Vibe's `memberId` is who *receives* the grant, so the
   * obvious read of "whose event is this" is the wrong one for the one kind
   * where it matters.
   */
  it('reads a Good Vibe as the sender\'s, not the recipient\'s', () => {
    expect(authorOf(vibeToMe())).toBe(THEM);
  });

  it('reads every other kind as belonging to the person it is about', () => {
    expect(authorOf(event({ memberId: THEM }))).toBe(THEM);
  });
});

describe('canCheer', () => {
  /**
   * One rule — you may cheer anything you did not write — and this is the case
   * it exists for. A naive "you cannot cheer an event about you" test would
   * block the nicest interaction in the feature.
   */
  it('lets you cheer a Good Vibe you received', () => {
    expect(canCheer(vibeToMe(), ME).ok).toBe(true);
  });

  it('will not let you cheer a Good Vibe you sent', () => {
    expect(canCheer(vibeToMe(), THEM).ok).toBe(false);
  });

  it('will not let you cheer your own hard day', () => {
    expect(canCheer(event({ memberId: ME }), ME).ok).toBe(false);
  });

  it('says why, so the button can be disabled with a reason', () => {
    const result = canCheer(event(), ME);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe('cheerId', () => {
  it('is the same id for the same person and event, so a second tap is one row', () => {
    expect(cheerId('e1', ME)).toBe(cheerId('e1', ME));
  });

  it('differs across people and across events', () => {
    expect(cheerId('e1', ME)).not.toBe(cheerId('e1', THEM));
    expect(cheerId('e1', ME)).not.toBe(cheerId('e2', ME));
  });
});

describe('buildFeed', () => {
  it('puts the newest first', () => {
    const older = event({ id: 'old', grantedAt: AT - 1000 });
    const newer = event({ id: 'new', grantedAt: AT });
    expect(buildFeed([older, newer], [], ME).map((i) => i.event.id)).toEqual(['new', 'old']);
  });

  it('shows only as many as it was asked for', () => {
    const events = [1, 2, 3, 4].map((n) => event({ id: `e${n}`, grantedAt: AT + n }));
    expect(buildFeed(events, [], ME, 2)).toHaveLength(2);
  });

  /**
   * The count is of *people*, not rows, and that is load-bearing rather than
   * tidy. A cheer's id embeds the member id it was written under, and the
   * re-key rewrites member *fields* without rehoming the primary key — so a
   * re-cheer after pairing leaves two rows from one person behind.
   */
  it('counts one person once, even with two rows from them', () => {
    const rows = [cheer({ id: 'old-id:me' }), cheer({ id: 'new-id:me' })];
    const [item] = buildFeed([event()], rows, THEM);
    expect(item.cheeredBy).toEqual([ME]);
  });

  it('knows whether this device has already cheered', () => {
    const [mine] = buildFeed([vibeToMe()], [cheer({ eventId: 'e-vibe' })], ME);
    expect(mine.cheered).toBe(true);
    const [theirs] = buildFeed([vibeToMe()], [], ME);
    expect(theirs.cheered).toBe(false);
  });

  it('reports an uncheered event as empty rather than absent', () => {
    const [item] = buildFeed([vibeToMe()], [], ME);
    expect(item.cheeredBy).toEqual([]);
    expect(item.cheered).toBe(false);
    expect(item.cheerable).toBe(true);
  });

  it('marks your own events as not cheerable', () => {
    const [item] = buildFeed([event({ memberId: ME })], [], ME);
    expect(item.cheerable).toBe(false);
  });
});
