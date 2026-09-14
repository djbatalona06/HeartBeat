import { describe, expect, it } from 'vitest';
import {
  AFFINITY_RANKS, ARCH_SPREAD_DEGREES, MASCOT_ELEMENTS, MASCOT_RAID_ORDER, MAX_AFFINITY_RANK,
  affinityRank, archLayout, canEnter, gateCards, gateDecision, gateGreeting, mostFavoured,
  skillPreview, tierForRank, toNextRank, withAffinity,
} from './raidGate';
import { COMPANION_KITS } from './companionSkills';
import { MASCOT_ROSTER } from '../../features/pet/mascots/roster';
import { RAID_STATS } from './raidStats';
import { TIERS, TIER_STAT_LEVELS } from './tiers';

describe('the arch', () => {
  it('stands one companion in the middle when there is only one', () => {
    expect(archLayout(1)).toEqual([{ index: 0, x: 0, depth: 0, scale: 1 }]);
    expect(archLayout(0)).toEqual([]);
  });

  it('spaces evenly, which is what makes it an arc rather than five guesses', () => {
    const slots = archLayout(5);
    const gaps = slots.slice(1).map((slot, i) => slot.x - slots[i].x);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
  });

  it('runs edge to edge, symmetrically about the middle', () => {
    const slots = archLayout(5);
    expect(slots[0].x).toBeCloseTo(-1, 6);
    expect(slots[4].x).toBeCloseTo(1, 6);
    expect(slots[2].x).toBeCloseTo(0, 6);
    expect(slots[0].x).toBeCloseTo(-slots[4].x, 6);
    expect(slots[1].depth).toBeCloseTo(slots[3].depth, 6);
  });

  it('curves, with the middle nearest and the ends furthest back', () => {
    const slots = archLayout(5);
    expect(slots[2].depth).toBeCloseTo(0, 6);
    expect(slots[0].depth).toBeCloseTo(1, 6);
    expect(slots[4].depth).toBeCloseTo(1, 6);
    expect(slots[1].depth).toBeGreaterThan(slots[2].depth);
  });

  it('shrinks with depth, so the back of the arc reads as the back', () => {
    const slots = archLayout(5);
    expect(slots[2].scale).toBe(1);
    expect(slots[0].scale).toBeLessThan(1);
    expect(slots[0].scale).toBeGreaterThan(0.8);
  });

  it('stays even at any count, which five typed offsets would not', () => {
    for (const count of [2, 3, 4, 5, 6, 9]) {
      const slots = archLayout(count);
      expect(slots).toHaveLength(count);
      const gaps = slots.slice(1).map((slot, i) => slot.x - slots[i].x);
      for (const gap of gaps) expect(gap, `count ${count}`).toBeCloseTo(gaps[0], 6);
    }
  });

  it('bends more when told to, and never flattens to a line', () => {
    expect(archLayout(5, 80)[0].depth).toBeCloseTo(1, 6);
    expect(archLayout(5, 80)[1].depth).toBeGreaterThan(archLayout(5, 20)[1].depth);
    expect(ARCH_SPREAD_DEGREES).toBeGreaterThan(0);
    expect(ARCH_SPREAD_DEGREES).toBeLessThan(90);
  });

  /** Even angles round a circle give uneven gaps on screen. Even gaps are
   *  what a front-facing arch actually needs, so the spacing is linear and
   *  the bend lives in the depth. */
  it('spaces by position rather than by angle', () => {
    const slots = archLayout(5);
    expect(slots.map((s) => s.x)).toEqual([-1, -0.5, 0, 0.5, 1]);
  });
});

describe('affinity', () => {
  it('starts everybody at rank one, for free', () => {
    expect(AFFINITY_RANKS[0]).toBe(0);
    expect(affinityRank(0)).toBe(1);
    expect(affinityRank(-50)).toBe(1);
  });

  it('climbs one rank per threshold, and stops at the top', () => {
    AFFINITY_RANKS.forEach((at, i) => {
      expect(affinityRank(at), `at ${at}`).toBe(i + 1);
      if (i > 0) expect(affinityRank(at - 1)).toBe(i);
    });
    expect(affinityRank(999_999)).toBe(MAX_AFFINITY_RANK);
  });

  it('counts the rounds left, and says nothing is left at the top', () => {
    expect(toNextRank(0)).toBe(AFFINITY_RANKS[1]);
    expect(toNextRank(AFFINITY_RANKS[1] - 4)).toBe(4);
    expect(toNextRank(AFFINITY_RANKS[MAX_AFFINITY_RANK - 1])).toBeNull();
  });

  it('maps its five rungs onto the five tiers, in order', () => {
    for (let rank = 1; rank <= MAX_AFFINITY_RANK; rank += 1) {
      expect(tierForRank(rank)).toBe(TIERS[rank - 1]);
    }
    expect(tierForRank(0)).toBe('common');
    expect(tierForRank(99)).toBe('mythic');
  });

  it('only ever rises, and never below nothing', () => {
    expect(withAffinity({}, 'pony', 3)).toEqual({ pony: 3 });
    expect(withAffinity({ pony: 3 }, 'pony', 4)).toEqual({ pony: 7 });
    expect(withAffinity({ pony: 3 }, 'pony', -9)).toEqual({ pony: 3 });
    expect(withAffinity({ pony: -5 }, 'pony', 2)).toEqual({ pony: 2 });
    expect(withAffinity(undefined, 'kitty', 1)).toEqual({ kitty: 1 });
  });

  it('leaves the ledger it was handed alone', () => {
    const ledger = { pony: 3 };
    withAffinity(ledger, 'pony', 5);
    expect(ledger).toEqual({ pony: 3 });
  });

  it('touches only the companion that was taken out', () => {
    expect(withAffinity({ pony: 3, kitty: 9 }, 'pony', 1)).toEqual({ pony: 4, kitty: 9 });
  });
});

describe('the cards', () => {
  it('stands one pedestal per skill kit, and none without one', () => {
    const cards = gateCards();
    expect(cards.map((c) => c.themeId)).toEqual(COMPANION_KITS.map((k) => k.themeId));
    for (const card of cards) expect(card.kit.themeId).toBe(card.themeId);
  });

  it('carries the mascot\'s own name, species and line', () => {
    for (const card of gateCards()) {
      const identity = MASCOT_ROSTER[card.themeId];
      expect(card.name).toBe(identity.name);
      expect(card.species).toBe(identity.species);
      expect(card.blurb).toBe(identity.blurb);
    }
  });

  it('gives every one of them a different element to answer to', () => {
    const cards = gateCards();
    expect(new Set(cards.map((c) => c.element)).size).toBe(cards.length);
    for (const card of cards) expect(MASCOT_ELEMENTS[card.themeId]).toBe(card.element);
  });

  it('lays them out along the arch, left to right', () => {
    const cards = gateCards();
    for (let i = 1; i < cards.length; i += 1) {
      expect(cards[i].slot.x).toBeGreaterThan(cards[i - 1].slot.x);
    }
  });

  it('reads affinity, and defaults everybody to a fresh rank one', () => {
    const cards = gateCards({ affinity: { pony: AFFINITY_RANKS[2] } });
    const pony = cards.find((c) => c.themeId === 'pony')!;
    const kitty = cards.find((c) => c.themeId === 'kitty')!;
    expect(pony.rank).toBe(3);
    expect(pony.tier).toBe('epic');
    expect(kitty.affinity).toBe(0);
    expect(kitty.rank).toBe(1);
    expect(kitty.tier).toBe('common');
  });

  it('gives each one a raid contribution inside its own tier band', () => {
    for (const card of gateCards({ affinity: { shinobi: 9999 } })) {
      const band = TIER_STAT_LEVELS[card.tier];
      expect(card.source.tier).toBe(card.tier);
      expect(card.source.statLevel, card.themeId).toBeGreaterThanOrEqual(band.min);
      expect(card.source.statLevel, card.themeId).toBeLessThanOrEqual(band.max);
      expect(card.source.order[0]).toBe(MASCOT_RAID_ORDER[card.themeId][0]);
    }
  });

  it('summarises three real stats it leans on', () => {
    for (const card of gateCards()) {
      expect(card.leans).toHaveLength(3);
      for (const stat of card.leans) expect(RAID_STATS).toContain(stat);
      expect(new Set(card.leans).size).toBe(3);
    }
  });

  it('reports what it adds to the tether as a plain percentage', () => {
    const pony = gateCards().find((c) => c.themeId === 'pony')!;
    const avatar = gateCards().find((c) => c.themeId === 'avatar')!;
    expect(pony.resonance).toBeCloseTo(8, 6);
    expect(avatar.resonance).toBe(0);
  });

  it('previews the kit in one line', () => {
    const pony = gateCards().find((c) => c.themeId === 'pony')!;
    expect(skillPreview(pony)).toBe('Star Missile · Horn Glow');
  });

  it('marks one out of reach when it is told to, with the reason given', () => {
    const cards = gateCards({ unavailable: { sponge: 'Off at sea.' } });
    const sponge = cards.find((c) => c.themeId === 'sponge')!;
    expect(sponge.available).toBe(false);
    expect(sponge.unavailableBecause).toBe('Off at sea.');
    expect(cards.filter((c) => c.available)).toHaveLength(cards.length - 1);
  });
});

describe('whether the gate opens', () => {
  const cards = gateCards();

  /** The ritual. It opens every time, and that is the design. */
  it('always stands in the way', () => {
    expect(gateDecision(cards, undefined).show).toBe(true);
    expect(gateDecision(cards, 'pony', { visitedBefore: true }).show).toBe(true);
    expect(gateDecision(cards, 'pony', { askedToChange: true }).show).toBe(true);
  });

  it('rings nobody on a first visit', () => {
    const verdict = gateDecision(cards, undefined);
    expect(verdict.preselected).toBeUndefined();
    expect(verdict.reason).toBe('first-visit');
  });

  /** Re-entering is one tap, not a decision you did not want to make again. */
  it('rings last time\'s companion on the way back in', () => {
    const verdict = gateDecision(cards, 'shinobi', { visitedBefore: true });
    expect(verdict.preselected).toBe('shinobi');
    expect(verdict.reason).toBe('returned');
  });

  it('says so plainly when the saved companion is no longer there', () => {
    const verdict = gateDecision(cards, 'a-theme-that-was-removed', { visitedBefore: true });
    expect(verdict.preselected).toBeUndefined();
    expect(verdict.reason).toBe('gone');
  });

  it('knows it was opened on purpose', () => {
    expect(gateDecision(cards, 'pony', { visitedBefore: true, askedToChange: true }).reason)
      .toBe('asked');
  });

  /** Still the whole ritual, and the choosing is not the only thing happening. */
  it('shows the scene with one companion and rings it already', () => {
    const only = gateCards({
      unavailable: Object.fromEntries(
        COMPANION_KITS.slice(1).map((kit) => [kit.themeId, 'Not today.']),
      ),
    });
    const verdict = gateDecision(only, undefined);
    expect(verdict.show).toBe(true);
    expect(verdict.onlyOne).toBe(true);
    expect(verdict.preselected).toBe(COMPANION_KITS[0].themeId);
  });

  it('never rings one that is out of reach', () => {
    const some = gateCards({ unavailable: { pony: 'Not today.' } });
    expect(gateDecision(some, 'pony', { visitedBefore: true }).preselected).toBeUndefined();
  });
});

describe('the greeting', () => {
  const cards = gateCards();

  it('is worded differently for each way you arrived', () => {
    const lines = [
      gateGreeting(gateDecision(cards, undefined)),
      gateGreeting(gateDecision(cards, 'pony', { visitedBefore: true }), 'Wishbell'),
      gateGreeting(gateDecision(cards, 'x', { visitedBefore: true })),
      gateGreeting(gateDecision(cards, 'pony', { askedToChange: true }), 'Wishbell'),
    ];
    expect(new Set(lines).size).toBe(lines.length);
    for (const line of lines) expect(line.length).toBeGreaterThan(20);
  });

  it('says the companion awaits when there is only one of them', () => {
    const only = gateCards({
      unavailable: Object.fromEntries(
        COMPANION_KITS.slice(1).map((kit) => [kit.themeId, 'Not today.']),
      ),
    });
    expect(gateGreeting(gateDecision(only, undefined), 'Mochi')).toContain('awaits');
  });
});

describe('locking one in', () => {
  const cards = gateCards({ unavailable: { sponge: 'Off at sea.' } });

  it('lets a reachable one through, with its card', () => {
    const verdict = canEnter(cards, 'pony');
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.card.name).toBe('Wishbell');
  });

  it('says why rather than going dead', () => {
    for (const [choice, expected] of [
      [undefined, 'Pick a companion first.'],
      ['nobody', 'That one is not at the gate.'],
      ['sponge', 'Off at sea.'],
    ] as const) {
      const verdict = canEnter(cards, choice);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).toBe(expected);
    }
  });
});

describe('mostFavoured', () => {
  it('is nobody until somebody has actually been taken out', () => {
    expect(mostFavoured(gateCards())).toBeUndefined();
  });

  it('is whoever has fought the most rounds', () => {
    const cards = gateCards({ affinity: { pony: 40, kitty: 400, shinobi: 5 } });
    expect(mostFavoured(cards)!.themeId).toBe('kitty');
  });
});
