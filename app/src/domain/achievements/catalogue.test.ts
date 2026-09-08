import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  NO_PROGRESS_KEYS,
  TIER_PAYOUT,
  achievementByCode,
  payoutOf,
  tracks,
} from './catalogue';

describe('the catalogue', () => {
  it('has no duplicate codes — a code is what gets stored', () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('measures something that exists on the state', () => {
    for (const def of ACHIEVEMENTS) {
      expect(NO_PROGRESS_KEYS).toContain(def.measure);
    }
  });

  it('gives every track exactly three rungs, numbered 1 to 3', () => {
    for (const t of tracks()) {
      expect(t.tiers.map((d) => d.tier)).toEqual([1, 2, 3]);
    }
  });

  it('makes each rung harder than the one before it', () => {
    for (const t of tracks()) {
      const needs = t.tiers.map((d) => d.need);
      expect(needs).toEqual([...needs].sort((a, b) => a - b));
      expect(new Set(needs).size).toBe(3);
    }
  });

  it('keeps every track on one measure, so a rung cannot regress', () => {
    for (const t of tracks()) {
      expect(new Set(t.tiers.map((d) => d.measure)).size).toBe(1);
    }
  });

  it('pays more for a further rung', () => {
    expect(TIER_PAYOUT[1]).toBeLessThan(TIER_PAYOUT[2]);
    expect(TIER_PAYOUT[2]).toBeLessThan(TIER_PAYOUT[3]);
    for (const def of ACHIEVEMENTS) expect(payoutOf(def)).toBe(TIER_PAYOUT[def.tier]);
  });

  it('never asks for a non-positive count', () => {
    // A rung at zero would be earned by a couple who had done nothing, which
    // is a welcome, not an achievement.
    for (const def of ACHIEVEMENTS) expect(def.need).toBeGreaterThan(0);
  });

  it('says something in every title and blurb', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.title.trim().length).toBeGreaterThan(0);
      expect(def.blurb.trim().length).toBeGreaterThan(0);
      expect(def.trackTitle.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no punishment in it', () => {
    // The design rule, asserted rather than trusted: nothing pays a negative,
    // which is what stops an achievement ever being taken back.
    for (const def of ACHIEVEMENTS) expect(payoutOf(def)).toBeGreaterThan(0);
  });

  it('finds a definition by the code that would be stored', () => {
    expect(achievementByCode('mood.1')?.tier).toBe(1);
    expect(achievementByCode('nothing.9')).toBeUndefined();
  });

  it('groups tracks in catalogue order without splitting one', () => {
    const seen = tracks().map((t) => t.track);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('keeps a payout well under what a quest or a boss is worth', () => {
    // An achievement notes that something happened. If it ever becomes the
    // efficient way to level, the app starts rewarding the checking.
    expect(Math.max(...Object.values(TIER_PAYOUT))).toBeLessThan(100);
  });
});

describe('NO_PROGRESS_KEYS', () => {
  it('covers every measure the catalogue uses', () => {
    for (const def of ACHIEVEMENTS) expect(NO_PROGRESS_KEYS).toContain(def.measure);
  });
});
