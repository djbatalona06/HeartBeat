import type { Element } from '../../features/eve-garden/engine/types';
import { MASCOT_ROSTER, FALLBACK_MASCOT_ID } from '../../features/pet/mascots/roster';
import { COMPANION_KITS, kitFor, type CompanionKit } from './companionSkills';
import { RAID_STATS, raidSheet, type RaidStatKey, type StatSource } from './raidStats';
import { FIGHT_HALF_AT, tierForStatLevel } from './loadout';
import { TIERS, tierRank, type Tier } from './tiers';
import { STAGES_PER_ISLAND } from './world';

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
 * ## Strength is the couple's level, and the same for all five
 *
 * A mascot's source used to be priced off *affinity* — rounds fought with that
 * one — so a favourite you had always picked outranked four you had not, and
 * the fifth you tried on a whim was genuinely weaker in the fight. That reads
 * as being punished for having a favourite. The source is now priced off the
 * shared pet's level, which is the number in the corner on every screen, and
 * it is **identical across the five**: what differs is the shape — which stats
 * it leans on (`MASCOT_RAID_ORDER`) — not how much it is worth.
 *
 * ## Affinity
 *
 * Rounds fought alongside a mascot, per mascot, still recorded. It no longer
 * sets strength; it is the ledger `mostFavoured` reads. It only ever rises,
 * like bond in `pets.ts`: nothing in this app takes something away because a
 * fortnight went quietly.
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

/**
 * The least a mascot is ever worth. Two points deal as 1 and 1 down a four-stat
 * order (`dealStatLevel`), so even a level-one couple's companion shows two
 * stats; one point deals as 1 and 0, which is how Foxglove and Marigold used
 * to show a single stat at the start.
 */
export const MASCOT_MIN_STAT_LEVEL = 2;

/** What every mascot is worth at the couple's level: the level itself, floored. */
export function mascotStatLevel(petLevel: number): number {
  return Math.max(MASCOT_MIN_STAT_LEVEL, Math.round(petLevel));
}

export interface GateCard {
  themeId: string;
  /** The mascot's own name. */
  name: string;
  species: string;
  blurb: string;
  element: Element;
  kit: CompanionKit;
  /** Rounds fought alongside it. Recorded, but it no longer sets strength. */
  affinity: number;
  /** The couple's level: the same on all five cards, and what prices `source`. */
  level: number;
  /** The rung that level lands on. The same for all five. */
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
  /** The shared pet's level. Prices every mascot equally. Defaults to 1. */
  petLevel?: number;
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
    const level = Math.max(1, Math.round(input.petLevel ?? 1));
    const statLevel = mascotStatLevel(level);
    const tier = tierForStatLevel(statLevel);
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
      level,
      tier,
      source: {
        id: `mascot-${kit.themeId}`,
        label: identity.name,
        tier,
        statLevel,
        order,
      },
      leans: order.slice(0, 3).filter((stat) => RAID_STATS.includes(stat)),
      resonance: Math.round((combo - 1) * 1000) / 10,
      available: reason === undefined,
      unavailableBecause: reason,
    };
  });
}

/* -- the gate's bubbles ------------------------------------------------------ */

export interface StatBubble {
  stat: RaidStatKey;
  /** The points this companion brings to the stat, at its current rank. */
  value: number;
  /**
   * How far along the fight's saturating curve those points are, 0-1. The same
   * `t / (t + FIGHT_HALF_AT)` that `Loadout.cs` puts every stat through, so a
   * half-full bubble is a stat already doing half of what it ever can.
   */
  fill: number;
}

/** The stats a card leans on, as bubbles: what it brings, and how far along. */
export function statBubbles(card: Pick<GateCard, 'source' | 'leans'>): StatBubble[] {
  const total = raidSheet([card.source]).total;
  return card.leans.map((stat) => {
    const value = Math.max(0, total[stat] ?? 0);
    return { stat, value, fill: value / (value + FIGHT_HALF_AT) };
  });
}

/* -- the gate's stat wheel --------------------------------------------------- */

export interface WheelSpoke {
  stat: RaidStatKey;
  value: number;
  /** 0-1, on the same saturating curve as `StatBubble.fill`. */
  fill: number;
  /**
   * 0-1, how far out to draw the spoke. Not `fill`: that curve tops out near 0.3
   * at level 50, which would draw a speck. This is relative to the companion's
   * own strongest stat (so the *shape* reads), lifted a little as it levels (so
   * growth shows), and never below `WHEEL_MIN_REACH` for a stat it has, so a
   * stat it brings is always visible against the empty ones.
   */
  reach: number;
  /** True for the stats the mascot is built around (`GateCard.leans`). */
  leans: boolean;
}

/** The shortest a spoke is drawn when the companion has any of that stat. */
export const WHEEL_MIN_REACH = 0.45;
/** The `fill` at which a wheel counts as fully grown: a level-50 top stat. */
const WHEEL_FULL_FILL = 0.3;

/**
 * One spoke per raid stat, in `RAID_STATS` order, so every wheel has the same
 * seven corners and two pets can be compared by laying one over the other.
 * Stats the mascot brings nothing to sit at the centre.
 */
export function wheelSpokes(card: Pick<GateCard, 'source' | 'leans'>): WheelSpoke[] {
  const total = raidSheet([card.source]).total;
  const values = RAID_STATS.map((stat) => Math.max(0, total[stat] ?? 0));
  const top = Math.max(1, ...values);
  const growth = Math.min(1, top / (top + FIGHT_HALF_AT) / WHEEL_FULL_FILL);
  return RAID_STATS.map((stat, i) => {
    const value = values[i];
    const reach = value > 0
      ? Math.min(1, (WHEEL_MIN_REACH + (1 - WHEEL_MIN_REACH) * (value / top)) * (0.7 + 0.3 * growth))
      : 0;
    return { stat, value, fill: value / (value + FIGHT_HALF_AT), reach, leans: card.leans.includes(stat) };
  });
}

/**
 * The corners of a spoke chart: spoke `i` of `n` points at `i / n` of a turn,
 * starting straight up and going clockwise. `fills` are 0-1; `radius` is the
 * length of a full spoke. Returned unrounded to two places so a snapshot of the
 * attribute is stable. A fill outside 0-1 is clamped rather than trusted.
 */
export function wheelPoints(
  fills: readonly number[],
  radius: number,
  centre: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number }[] {
  const n = fills.length;
  return fills.map((fill, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = radius * Math.min(1, Math.max(0, fill));
    return {
      x: Math.round((centre.x + Math.cos(angle) * r) * 100) / 100,
      y: Math.round((centre.y + Math.sin(angle) * r) * 100) / 100,
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

/* -- the partner gate -------------------------------------------------------- */

/**
 * Only the boss stage asks for the other half of the couple. Every stage before
 * it is **asynchronous**: you fight when you like, your partner fights when
 * they like, and what each of you clears reaches the other through the world
 * row. Nothing on those stages waits on anybody, and nothing reads presence.
 */
export function partnerGateApplies(stage: number): boolean {
  return stage === STAGES_PER_ISLAND;
}

/**
 * Whether the boss stage refuses a lone entrant. Off: the gate is an
 * invitation with a better payout, not a lock, so a couple whose other half is
 * asleep is never stood outside a door. The one switch to flip for a hard gate.
 */
export const BOSS_REQUIRES_PARTNER = false;

/** How long a stamp at the gate counts as "is here". */
export const PRESENCE_WINDOW_MS = 20 * 60 * 1000;
/** How often your own stamp is refreshed while the gate stays open. */
export const PRESENCE_REFRESH_MS = 5 * 60 * 1000;
/** Stamps are device clocks; a partner whose clock runs a little ahead is not a ghost. */
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

export function partnerAtGate(
  gate: Readonly<Record<string, number>> | undefined,
  partnerId: string | undefined,
  now: number,
): boolean {
  const stamp = partnerId ? gate?.[partnerId] : undefined;
  if (stamp === undefined) return false;
  return stamp <= now + CLOCK_SKEW_MS && now - stamp <= PRESENCE_WINDOW_MS;
}

/** What going in together adds on a boss stage. */
export const TOGETHER_XP_SHARE = 0.5;
export const TOGETHER_COIN_MULTIPLIER = 2;
export const TOGETHER_PURSES = 1;

export interface TogetherBonus {
  active: boolean;
  /** Extra pet XP, as a share of the stage's own. */
  xpShare: number;
  /** What coin drops are multiplied by. */
  coinMultiplier: number;
  /** Coin purses on top of the clear. */
  purses: number;
}

export const NO_BONUS: TogetherBonus = { active: false, xpShare: 0, coinMultiplier: 1, purses: 0 };

/** The bonus for a fight begun at `stage`, decided once and held for that fight. */
export function togetherBonus(stage: number, partnerPresent: boolean): TogetherBonus {
  if (!partnerGateApplies(stage) || !partnerPresent) return NO_BONUS;
  return {
    active: true,
    xpShare: TOGETHER_XP_SHARE,
    coinMultiplier: TOGETHER_COIN_MULTIPLIER,
    purses: TOGETHER_PURSES,
  };
}

export function togetherXp(baseXp: number, bonus: TogetherBonus): number {
  return bonus.active ? Math.round(Math.max(0, baseXp) * bonus.xpShare) : 0;
}

/** A reason to refuse entry on a boss stage, or null. Always null while the gate is only an invitation. */
export function bossEntryBlockedBecause(
  stage: number,
  hasPartner: boolean,
  partnerPresent: boolean,
  required: boolean = BOSS_REQUIRES_PARTNER,
): string | null {
  if (!required || !partnerGateApplies(stage) || !hasPartner || partnerPresent) return null;
  return 'The boss will not come out for one. Wait for your partner at the gate.';
}

export { kitFor };

/**
 * Which companion the partner walks in with: their last garden pick, else the
 * mascot their app draws, else undefined (the caller's own fallback -- the
 * default sprite, or the default mascot). One reading for the gate's partner
 * pedestal and the garden's ally, so the two can never show different pets.
 */
export function allyThemeId(
  avatar: { raidCompanion?: string; mascot?: string } | undefined,
): string | undefined {
  return avatar?.raidCompanion ?? avatar?.mascot;
}
