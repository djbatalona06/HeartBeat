import { loadSettings, saveSettings } from '../database';
import { gateCards, withAffinity, type GateCard, type GateVerdict, gateDecision } from '../../domain/rpg/raidGate';
import { kitFor, type CompanionKit } from '../../domain/rpg/companionSkills';

/* -- the raid gate -----------------------------------------------------------
 * Which companion walks into the garden with you, and how many rounds each of
 * them has fought.
 *
 * All of it lives on the single `settings` row, which is the one table in this
 * app that is **local by design**. That is the right home for this and not a
 * shortcut: two people can walk into the same garden behind different
 * companions, and one partner picking the ink fox must not change who the
 * other one is playing. `loadSettings` spreads defaults underneath, so these
 * three fields needed no migration and no Dexie version.
 */

export interface RaidChoice {
  /** The chosen theme id, or undefined before anybody has chosen. */
  companionId?: string;
  affinity: Record<string, number>;
  visited: boolean;
}

export async function loadRaidChoice(): Promise<RaidChoice> {
  const settings = await loadSettings();
  return {
    companionId: settings.raidCompanionId,
    affinity: settings.raidAffinity ?? {},
    visited: settings.raidGateVisited ?? false,
  };
}

/**
 * The cards as they stand for this device, already laid out in the arch.
 *
 * Reads the ledger rather than taking one, so a screen cannot render a gate
 * from stale affinity it happened to be holding.
 */
export async function loadGateCards(): Promise<GateCard[]> {
  const { affinity } = await loadRaidChoice();
  return gateCards({ affinity });
}

/** The cards, and whether the gate stands in the way — one call for a mount. */
export async function openRaidGate(
  options: { askedToChange?: boolean } = {},
): Promise<{ cards: GateCard[]; verdict: GateVerdict }> {
  const { affinity, companionId, visited } = await loadRaidChoice();
  const cards = gateCards({ affinity });
  return {
    cards,
    verdict: gateDecision(cards, companionId, { ...options, visitedBefore: visited }),
  };
}

/**
 * Lock one in.
 *
 * Marks the device as having been through the gate at the same moment, so the
 * greeting changes on the next visit rather than on the next launch. Both in
 * one write, because they are one event.
 */
export async function chooseRaidCompanion(themeId: string): Promise<void> {
  await saveSettings({ raidCompanionId: themeId, raidGateVisited: true });
}

/**
 * Credit a companion with the rounds it fought.
 *
 * Re-read inside rather than taking a ledger, so two raids finishing close
 * together cannot overwrite each other with the copy each was holding when it
 * started. `withAffinity` owns the arithmetic and clamps at zero: a raid can
 * never take affinity away.
 */
export async function recordRaidRounds(themeId: string, rounds: number): Promise<void> {
  if (rounds <= 0) return;
  const settings = await loadSettings();
  await saveSettings({ raidAffinity: withAffinity(settings.raidAffinity, themeId, rounds) });
}

/** The skill kit currently in force, falling back the way the mascot does. */
export async function activeKit(): Promise<CompanionKit> {
  const { companionId } = await loadRaidChoice();
  return kitFor(companionId);
}

/** Forget the choice, so the next visit is a first visit again. Used by the
 *  "Change Pet" affordance's reset, and by tests. */
export async function clearRaidCompanion(): Promise<void> {
  await saveSettings({ raidCompanionId: undefined });
}
