import type { Element } from '../../features/eve-garden/engine/types';
import { MASCOT_ROSTER, FALLBACK_MASCOT_ID } from '../../features/pet/mascots/roster';
import { COMPANION_KITS, kitFor, type CompanionKit } from './companionSkills';
import { RAID_STATS, sourceStatLevel, type RaidStatKey, type StatSource } from './raidStats';
import { TIERS, tierRank, type Tier } from './tiers';

/**
 * The Raid Gate: the scene you pass through on the way into Eve's Garden, and
 * the rules behind it.
 *
 * ## Why there is a gate at all
 *
 * Because the pet is the point of this app, and walking straight into a fight
 * makes the pet a sprite. The gate is a **ritual**: the island's boss standing
 * in an arch between two trees, five companions to choose from, and one
 * deliberate tap before anything is fought.
 * That is why it is still shown when there is only one companion to choose —
 * the choosing is not the only thing happening.
 *
 * ## What "the pet" means here
 *
 * The five mascots in `features/pet/mascots/`, one per theme. Choosing one sets
 * the **active character theme** for the session: the sprite in the battle
 * scene, the skill kit from `companionSkills.ts`, and the VFX all read off it.
 * The twenty collectibles in `pets.ts` are a different thing — those are
 * companions you hatch and rank up, and one of them rides along. This is who
 * you *are* in the garden; that is who came with you.
 *
 * ## Affinity
 *
 * Rounds fought alongside a mascot, per mascot. It is the only number on a
 * gate card that is that card's own — the shared pet's level belongs to the
 * couple and is the same behind every one of them — so it is what makes the
 * gate a board with five different things on it rather than five hats.
 *
 * It only ever rises, like bond in `pets.ts`, and for the same reason: nothing
 * in this app takes something away because a fortnight went quietly.
 */

/** Which of the garden's five elements each mascot answers to. */
export const MASCOT_ELEMENTS: Record<string, Element> = {
  kitty: 'Rest',
  sponge: 'Nourishment',
  shinobi: 'Movement',
  avatar: 'Focus',
  pony: 'Mood',
};

/** Which raid stats each mascot leans on, best first. Its passive lands on the
 *  first of them — see `raidSheet`. */
export const MASCOT_RAID_ORDER: Record<string, readonly RaidStatKey[]> = {
  kitty: ['recovery', 'resilience', 'resonance', 'fortify'],
  sponge: ['fortify', 'reveal', 'resilience', 'recovery'],
  shinobi: ['burden', 'energy', 'reveal', 'resonance'],
  avatar: ['fortify', 'energy', 'resonance', 'reveal'],
  pony: ['resonance', 'reveal', 'energy', 'burden'],
};

/* -- affinity ---------------------------------------------------------------- */

/**
 * Rounds fought for each rank. Five rungs, mapped onto the five tiers, so a
 * companion you have taken everywhere reads as *legendary* in exactly the sense
 * a legendary item does and the two numbers are comparable.
 *
 * The first rung is free, because a companion you have never taken out should
 * still be worth taking out.
 */
export const AFFINITY_RANKS: readonly number[] = [0, 25, 90, 260, 700];
export const MAX_AFFINITY_RANK = AFFINITY_RANKS.length;

export function affinityRank(affinity: number): number {
  let rank = 1;
  for (let i = 1; i < AFFINITY_RANKS.length; i += 1) {
    if (affinity >= AFFINITY_RANKS[i]) rank = i + 1;
  }
  return rank;
}

/** Rounds still to go for the next rank, or null at the top. */
export function toNextRank(affinity: number): number | null {
  const rank = affinityRank(affinity);
  if (rank >= MAX_AFFINITY_RANK) return null;
  return Math.max(0, AFFINITY_RANKS[rank] - affinity);
}

/** The rung a rank stands on. Rank one is common, rank five is mythic. */
export function tierForRank(rank: number): Tier {
  return TIERS[Math.min(TIERS.length - 1, Math.max(0, rank - 1))];
}

/* -- the cards --------------------------------------------------------------- */

export interface GateCard {
  themeId: string;
  /** The mascot's own name. */
  name: string;
  species: string;
  blurb: string;
  element: Element;
  kit: CompanionKit;
  affinity: number;
  rank: number;
  /** Rounds to the next rank, or null at the top. */
  toNextRank: number | null;
  tier: Tier;
  /** Its contribution to the raid sheet, at this rank. */
  source: StatSource;
  /** The three stats it leans on hardest, for the summary line. */
  leans: RaidStatKey[];
  /** What it adds to the tether, as a percentage. Zero when it adds none. */
  resonance: number;
  /** False only when something has genuinely put it out of reach. */
  available: boolean;
  unavailableBecause?: string;
}

export interface GateInput {
  /** Rounds fought alongside each mascot, keyed by theme id. */
  affinity?: Readonly<Record<string, number>>;
  /** Theme ids that are out of reach, with the reason to show. */
  unavailable?: Readonly<Record<string, string>>;
}

/**
 * The five cards, in `COMPANION_KITS` order.
 *
 * Walked off the kits rather than off the roster so a mascot without a skill
 * kit cannot reach the gate — a pedestal whose companion has nothing to do in a
 * fight is worse than an empty pedestal.
 */
export function gateCards(input: GateInput = {}): GateCard[] {
  return COMPANION_KITS.map((kit) => {
    const identity = MASCOT_ROSTER[kit.themeId] ?? MASCOT_ROSTER[FALLBACK_MASCOT_ID];
    const affinity = Math.max(0, input.affinity?.[kit.themeId] ?? 0);
    const rank = affinityRank(affinity);
    const tier = tierForRank(rank);
    const order = MASCOT_RAID_ORDER[kit.themeId] ?? MASCOT_RAID_ORDER[FALLBACK_MASCOT_ID];
    const reason = input.unavailable?.[kit.themeId];

    const combo = kit.passive.modifiers.combo ?? kit.signature.modifiers.combo ?? 1;

    return {
      themeId: kit.themeId,
      name: identity.name,
      species: identity.species,
      blurb: identity.blurb,
      element: MASCOT_ELEMENTS[kit.themeId] ?? 'Mood',
      kit,
      affinity,
      rank,
      toNextRank: toNextRank(affinity),
      tier,
      source: {
        id: `mascot-${kit.themeId}`,
        label: identity.name,
        tier,
        statLevel: sourceStatLevel(`mascot-${kit.themeId}`, tier),
        order,
      },
      leans: order.slice(0, 3).filter((stat) => RAID_STATS.includes(stat)),
      resonance: Math.round((combo - 1) * 1000) / 10,
      available: reason === undefined,
      unavailableBecause: reason,
    };
  });
}

/* -- when the gate opens ----------------------------------------------------- */

export type GateReason = 'first-visit' | 'returned' | 'asked' | 'gone';

export interface GateVerdict {
  /** Whether the gate stands in the way. */
  show: boolean;
  /** Which card to put the ring around when it does. */
  preselected?: string;
  /** Why, in a word — so a screen can word its own heading. */
  reason: GateReason;
  /** True when there is only one to pick and it is already picked for you. */
  onlyOne: boolean;
}

/**
 * Whether to show the gate, and with what already chosen.
 *
 * The rule from the plan, with one deliberate softening. The gate re-opens
 * every time the garden is entered — that is the point of a ritual, and it is
 * what makes the choice conscious rather than sticky. But it opens with **last
 * time's companion already ringed**, so re-entering is one tap rather than a
 * decision you did not want to make again. A gate that made you re-choose from
 * nothing every time would be a toll booth.
 *
 * `gone` is the case where the saved choice is a theme that no longer exists.
 * It is not an error state: the gate simply opens with nothing ringed, which is
 * exactly what a first visit looks like, and that is correct — the companion
 * they picked is not there any more.
 */
export function gateDecision(
  cards: readonly GateCard[],
  lastChoice: string | undefined,
  options: { askedToChange?: boolean; visitedBefore?: boolean } = {},
): GateVerdict {
  const reachable = cards.filter((card) => card.available);
  const onlyOne = reachable.length === 1;
  const known = reachable.some((card) => card.themeId === lastChoice);

  const preselected = known
    ? lastChoice
    : onlyOne
      ? reachable[0].themeId
      : undefined;

  const reason: GateReason = options.askedToChange
    ? 'asked'
    : !options.visitedBefore
      ? 'first-visit'
      : known
        ? 'returned'
        : 'gone';

  return { show: true, preselected, reason, onlyOne };
}

/** The line under the heading, which is different for each way you got here. */
export function gateGreeting(verdict: GateVerdict, name?: string): string {
  if (verdict.onlyOne && name) return `${name} awaits. Your companion is ready when you are.`;
  switch (verdict.reason) {
    case 'first-visit':
      return 'Five are waiting under the trees. One of them comes with you.';
    case 'asked':
      return 'Change your mind. Nothing is lost by it.';
    case 'gone':
      return 'The one you took last time is not here. Choose again.';
    case 'returned':
    default:
      return name
        ? `${name} is still here. Tap to go again, or pick another.`
        : 'Choose who walks in with you.';
  }
}

/**
 * Whether a choice may be locked in, and why not when it may not.
 *
 * A refusal always carries a reason, the same shape `castBlockedBecause` uses
 * in `skills.ts`: a button that goes quietly dead is the interaction this app
 * is trying not to have.
 */
export function canEnter(
  cards: readonly GateCard[],
  choice: string | undefined,
): { ok: true; card: GateCard } | { ok: false; reason: string } {
  if (!choice) return { ok: false, reason: 'Pick a companion first.' };
  const card = cards.find((entry) => entry.themeId === choice);
  if (!card) return { ok: false, reason: 'That one is not at the gate.' };
  if (!card.available) {
    return { ok: false, reason: card.unavailableBecause ?? `${card.name} cannot come today.` };
  }
  return { ok: true, card };
}

/** What a card's skill kit reads as, in one line, for the preview on the card. */
export function skillPreview(card: GateCard): string {
  return `${card.kit.signature.name} · ${card.kit.passive.name}`;
}

/** The three moves a card fights with, by name, for the line under its skill. */
export function movePreview(card: GateCard): string {
  const { physical, defensive, magic } = card.kit.moves;
  return `${physical.name} · ${defensive.name} · ${magic.name}`;
}

/**
 * The affinity ledger after a raid, as a new object.
 *
 * Pure, so the repository has no arithmetic of its own to get wrong — the same
 * reason `nextPity` is pure. Rounds are clamped at zero: a raid cannot take
 * affinity away, and nothing should be able to write one that does.
 */
export function withAffinity(
  ledger: Readonly<Record<string, number>> | undefined,
  themeId: string,
  rounds: number,
): Record<string, number> {
  const next = { ...(ledger ?? {}) };
  next[themeId] = Math.max(0, next[themeId] ?? 0) + Math.max(0, Math.round(rounds));
  return next;
}

/** The best-ranked companion at the gate, for a screen that wants to say so. */
export function mostFavoured(cards: readonly GateCard[]): GateCard | undefined {
  return [...cards]
    .filter((card) => card.affinity > 0)
    .sort((a, b) => b.affinity - a.affinity || tierRank(b.tier) - tierRank(a.tier))[0];
}

export { kitFor };
