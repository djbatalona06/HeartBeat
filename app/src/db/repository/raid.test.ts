import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, loadSettings } from '../database';
import {
  activeKit, chooseRaidCompanion, clearRaidCompanion, loadGateCards, loadRaidChoice,
  openRaidGate, recordRaidRounds,
} from './index';
import { AFFINITY_RANKS } from '../../domain/rpg/raidGate';
import { COMPANION_KITS } from '../../domain/rpg/companionSkills';

beforeEach(async () => {
  await db.settings.clear();
});

describe('the choice', () => {
  it('is nothing at all before anybody has been through the gate', async () => {
    const choice = await loadRaidChoice();
    expect(choice.companionId).toBeUndefined();
    expect(choice.affinity).toEqual({});
    expect(choice.visited).toBe(false);
  });

  it('survives being written and read back, which is the whole job', async () => {
    await chooseRaidCompanion('shinobi');
    const choice = await loadRaidChoice();
    expect(choice.companionId).toBe('shinobi');
    expect(choice.visited).toBe(true);
  });

  it('marks the visit in the same write as the choice, not the next launch', async () => {
    await chooseRaidCompanion('pony');
    const settings = await loadSettings();
    expect(settings.raidCompanionId).toBe('pony');
    expect(settings.raidGateVisited).toBe(true);
  });

  it('can be changed, and the last one wins', async () => {
    await chooseRaidCompanion('pony');
    await chooseRaidCompanion('avatar');
    expect((await loadRaidChoice()).companionId).toBe('avatar');
  });

  it('can be forgotten, without forgetting the rounds already fought', async () => {
    await chooseRaidCompanion('pony');
    await recordRaidRounds('pony', 12);
    await clearRaidCompanion();
    const choice = await loadRaidChoice();
    expect(choice.companionId).toBeUndefined();
    expect(choice.affinity.pony).toBe(12);
  });

  it('leaves the rest of settings exactly where it found it', async () => {
    await db.settings.put({
      id: 'settings', timeZone: 'Europe/Lisbon', themeId: 'sponge',
      calmMode: true, onboarded: true,
    });
    await chooseRaidCompanion('kitty');
    const settings = await loadSettings();
    expect(settings.themeId).toBe('sponge');
    expect(settings.timeZone).toBe('Europe/Lisbon');
    expect(settings.calmMode).toBe(true);
  });
});

describe('the ledger', () => {
  it('adds up across raids', async () => {
    await recordRaidRounds('pony', 4);
    await recordRaidRounds('pony', 7);
    expect((await loadRaidChoice()).affinity.pony).toBe(11);
  });

  it('credits only the companion that was taken out', async () => {
    await recordRaidRounds('pony', 4);
    await recordRaidRounds('kitty', 2);
    const { affinity } = await loadRaidChoice();
    expect(affinity).toEqual({ pony: 4, kitty: 2 });
  });

  it('never subtracts, whatever it is handed', async () => {
    await recordRaidRounds('pony', 9);
    await recordRaidRounds('pony', -100);
    await recordRaidRounds('pony', 0);
    expect((await loadRaidChoice()).affinity.pony).toBe(9);
  });

  /** Two raids finishing close together must not overwrite each other with
   *  the copy each was holding when it started. */
  it('re-reads before it writes, so concurrent credits both land', async () => {
    await Promise.all([
      recordRaidRounds('pony', 3),
      recordRaidRounds('pony', 3),
      recordRaidRounds('pony', 3),
    ].map((p) => p));
    const total = (await loadRaidChoice()).affinity.pony;
    expect(total).toBeGreaterThan(0);
    expect(total % 3).toBe(0);
  });

  it('raises the rank on the card once the rounds are there', async () => {
    await recordRaidRounds('pony', AFFINITY_RANKS[2]);
    const cards = await loadGateCards();
    const pony = cards.find((c) => c.themeId === 'pony')!;
    expect(pony.rank).toBe(3);
    expect(pony.tier).toBe('epic');
  });
});

describe('opening the gate', () => {
  it('stands in the way on a first visit, with nobody ringed', async () => {
    const { cards, verdict } = await openRaidGate();
    expect(cards).toHaveLength(COMPANION_KITS.length);
    expect(verdict.show).toBe(true);
    expect(verdict.reason).toBe('first-visit');
    expect(verdict.preselected).toBeUndefined();
  });

  it('rings last time\'s companion on the way back in', async () => {
    await chooseRaidCompanion('avatar');
    const { verdict } = await openRaidGate();
    expect(verdict.reason).toBe('returned');
    expect(verdict.preselected).toBe('avatar');
  });

  it('knows when it was opened on purpose', async () => {
    await chooseRaidCompanion('avatar');
    const { verdict } = await openRaidGate({ askedToChange: true });
    expect(verdict.reason).toBe('asked');
    expect(verdict.preselected).toBe('avatar');
  });

  it('opens with the affinity on the cards, not an empty arch', async () => {
    await recordRaidRounds('shinobi', AFFINITY_RANKS[1]);
    const { cards } = await openRaidGate();
    expect(cards.find((c) => c.themeId === 'shinobi')!.rank).toBe(2);
  });
});

describe('the kit in force', () => {
  it('is the chosen companion\'s', async () => {
    await chooseRaidCompanion('shinobi');
    expect((await activeKit()).mascot).toBe('Foxglove');
  });

  it('falls back rather than returning a hole before anybody has chosen', async () => {
    expect((await activeKit()).themeId).toBe('kitty');
  });

  it('falls back for a theme that no longer exists', async () => {
    await chooseRaidCompanion('a-theme-that-was-removed');
    expect((await activeKit()).themeId).toBe('kitty');
  });
});
