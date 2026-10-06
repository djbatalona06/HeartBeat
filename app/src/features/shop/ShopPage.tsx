import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../../ui/Toast';
import { db, loadSettings } from '../../db/database';
import {
  buyDeal,
  buyDye,
  buyEgg,
  buyGear,
  buyOffer,
  ensureIdentity,
  getOrCreateAvatar,
  markLoreSeen,
  loadWorldProgress,
  openChestFor,
  openStarChest,
  setCompanion,
  spendMp,
  spendPetMp,
  startAdventure,
  wearCostume,
  wearDye,
} from '../../db/repository';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import {
  RARITIES, RARITY_NAMES, gearById, type Rarity,
} from '../../domain/rpg/gear';
import { dealsFor, type Deal } from '../../domain/rpg/merchant';
import { adventureCost } from '../../domain/rpg/stage';
import {
  PITY_AT, chancesFor, petKindById, petSheet, pityFloor, type PetInstance,
} from '../../domain/rpg/pets';
import { offerFor } from '../../domain/rpg/mysteryShop';
import { todayKey } from '../../domain/day';
import type { DayKey } from '../../domain/types';
import type { Avatar } from '../../domain/rpg/types';
import { findOwned, ownsItem, refineByItemId, type InventoryItem } from '../../domain/rpg/inventory';
import { EGG_PRICE, REFINE_MAX, gearBonusWithRefinement, refinePrice } from '../../domain/rpg/shop';
import { DEFAULT_DYE_ID, DYES, dyeById, dyeStyle } from '../../domain/rpg/dyes';
import { COSTUMES } from '../../domain/rpg/costumes';
import { TIER_NAMES } from '../../domain/rpg/tiers';
import { CostumeLayer } from '../party/art/costumes';
import {
  HOUSE_SLOTS,
  HOUSE_SLOT_NAMES,
  furnitureById,
  normalizeHouse,
  type House,
} from '../../domain/rpg/furniture';
import type { Garden } from '../../domain/rpg/plots';
import { houseArt } from '../party/art/house';
import { PLACES, canTravel, nextPlace, travelCost } from '../../domain/rpg/locations';
import { useTheme } from '../../themes/ThemeProvider';
import { getMascot } from '../pet/mascots';
import { BorderGlow } from '../../components/BorderGlow';
import { GearIcon } from '../party/art/gear/GearIcon';
import { petArt } from '../party/art/pets';
import { ChestAlcove } from '../party/ChestAlcove';
import { GardenPlots } from './GardenPlots';
import { Merchant } from '../party/Merchant';
import { RaidSheet } from '../party/RaidSheet';
import { Boss } from '../party/Boss';
import { GearDiff } from '../party/GearDiff';
import { IslandPath } from '../party/IslandPath';
import { PRIZES_PER_CHEST } from '../../domain/rpg/chests';
import type { ChestOutcome } from '../../db/repository/chests';
import { ChestReveal } from '../chest/ChestReveal';
import { openingLine } from '../chest/receipt';
import { PrimaryAction } from '../../ui/PrimaryAction';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { Sheet } from '../../ui/Sheet';
import { SwipePane } from '../../ui/layout/SwipePane';
import { PageTitle } from '../../ui/layout/PageTitle';
import { GUIDES } from '../guide/guides';

/**
 * How brightly a companion's card is lit, by how rare it is.
 *
 * Gold is reserved for legendary and above and appears nowhere else in the
 * theme, so a legendary drop is recognisable across the room without a badge
 * saying so. Mythic is the one rung that is not gold: it is white, because
 * after four rungs of getting warmer the only place left to go is brighter.
 */
/**
 * What a chest actually gave you, in one line.
 *
 * Four cases and they are genuinely different events: a new thing, a thing you
 * already had made better, a companion whose bond deepened, and — the last
 * resort — coins back because there was nothing left to deepen. Collapsing
 * those into "you got a Paper Crown" would make the refund look like a bug.
 */
/**
 * A member's luck, the one stat the odds read.
 *
 * The same three-line derivation four places on this page already make, pulled
 * out because the chest row needs it too and a fifth copy is a fifth chance to
 * forget refinement — which would quietly print odds nobody actually has.
 */
function luckOf(avatar: Avatar, owned: InventoryItem[]): number {
  const level = levelOf(avatar);
  const bonus = gearBonusWithRefinement(avatar.gear, level, refineByItemId(owned));
  return sheetFor(avatar, bonus).stats.luck;
}

const RARITY_GLOW: Record<Rarity, string[]> = {
  common: ['var(--color-border)', 'var(--color-surface-muted)', 'var(--color-border)'],
  rare: ['var(--color-accent)', 'var(--color-border)', 'var(--color-accent)'],
  epic: ['var(--color-accent)', '#f5c85c', 'var(--color-accent)'],
  legendary: ['#f5c85c', 'var(--color-accent)', '#f5c85c'],
  mythic: ['#fff6da', '#f5c85c', '#fff6da'],
};

const RARITY_INTENSITY: Record<Rarity, number> = {
  common: 0.4,
  rare: 0.7,
  epic: 1,
  legendary: 1.3,
  mythic: 1.6,
};

/**
 * The things this page can show, and the order they read in.
 *
 * Three routes are sections of this one page — Shop, Birb and Raid — so they
 * are selected here rather than copied into three files. Nothing forks: the
 * identity effect, the live queries and the receipt are written once and every
 * route gets the same ones, which is what stops "the shop" behaving
 * differently depending on how you reached it.
 *
 * There used to be a fourth, `/party`, which passed nothing and showed all of
 * it at once. Every section had a better home by then, so it went, and the
 * page took the name of what it shows when asked for nothing: the shop. `/party`
 * redirects here for the links that still carry it. Wearing gear lives on the
 * Bag's slot grid now, and the achievement shelf on Tasks.
 */
export type ShopSection = 'birb' | 'costumes' | 'raid' | 'shop';

/**
 * The shop: what coins are for. Birb and Raid are this page asked for other
 * sections — see `ShopSection`.
 *
 * The boss panel (Raid) is the only screen in the app that cannot render from
 * IndexedDB, because boss HP is contested state — see `worker/src/boss.ts`. It
 * says so plainly when there is no Worker configured rather than showing a bar
 * that is quietly a lie.
 */
type ShopIdentity = { memberId: string; coupleId: string };

/**
 * Everything the sections read, gathered once. The sheet has to exist before
 * the first completion, or a fresh install shows a page with no character on it
 * and no way to tell that is temporary.
 */
function useShopData() {
  const settings = useLiveQuery(loadSettings, []);
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');
  const [identity, setIdentity] = useState<ShopIdentity | null>(null);

  useEffect(() => {
    let live = true;
    ensureIdentity()
      .then(async (next) => {
        await getOrCreateAvatar(next.memberId, next.coupleId);
        if (live) setIdentity(next);
      });
    return () => { live = false; };
  }, []);

  const avatar = useLiveQuery(
    async () => (identity ? db.avatars.get(identity.memberId) : undefined),
    [identity?.memberId],
  );
  const pets = useLiveQuery(
    async () => (identity
      ? db.pets.where('memberId').equals(identity.memberId).toArray()
      : ([] as PetInstance[])),
    [identity?.memberId],
  );
  const owned = useLiveQuery(
    async () => (identity
      ? db.inventory.where('memberId').equals(identity.memberId).toArray()
      : ([] as InventoryItem[])),
    [identity?.memberId],
  );
  // The birbhouse is the couple's, so it is read off the shared pet row rather
  // than either avatar — see domain/rpg/furniture.ts.
  const pet = useLiveQuery(
    async () => (identity ? db.pet.get(identity.coupleId) : undefined),
    [identity?.coupleId],
  );

  return { settings, day, identity, avatar, pets: pets ?? [], owned: owned ?? [], pet };
}

/** What every section needs, once there is a character to show. */
interface ShopContext {
  avatar: Avatar;
  identity: ShopIdentity;
  pets: PetInstance[];
  owned: InventoryItem[];
  pet: ReturnType<typeof useShopData>['pet'];
  settings: ReturnType<typeof useShopData>['settings'];
  day: string;
  say: ReturnType<typeof useToast>['say'];
}

export function ShopPage({ only = ['shop'], title = 'Shop' }: {
  only?: readonly ShopSection[];
  title?: string;
}) {
  const { say } = useToast();
  const data = useShopData();
  // What the last chest handed over, while it is still being looked at. The
  // reveal is the receipt; the toast below is only the fallback for a page
  // that never mounted one.
  const [revealed, setRevealed] = useState<Extract<ChestOutcome, { ok: true }> | null>(null);

  const { avatar, identity } = data;
  const ctx: ShopContext | null = avatar && identity ? { ...data, avatar, identity, say } : null;

  return (
    <div className="page">
      <header className="page-head">
        {/* One page behind three routes; the guide follows the sections shown. */}
        <PageTitle guide={only.includes('raid') ? GUIDES.raid : only.includes('birb') ? GUIDES.birb : GUIDES.shop}>
          {title}
        </PageTitle>
        {/* Not on Birb: it is a tab of its own, and a back link on a tab is a
            way out of a place nobody arrived at from Tasks. */}
        {only.includes('birb') ? null : (
          <p className="page-sub">
            <Link className="sheet-party" to="/tasks">← Tasks</Link>
          </p>
        )}
      </header>

      {ctx ? (
        <>
          {only.includes('birb') ? <BirbView ctx={ctx} /> : null}
          {only.includes('costumes') ? <CostumesSection ctx={ctx} /> : null}
          {only.includes('raid') ? <RaidSection ctx={ctx} onRevealed={setRevealed} /> : null}
          {only.includes('shop') ? <ShopSectionView ctx={ctx} onRevealed={setRevealed} /> : null}
        </>
      ) : null}

      {/* Last in the document, because it is an overlay and nearest means
          nearest. Dismissing leaves the one-line form in a toast, so the thing
          that was opened is still named on the page behind it. */}
      {revealed ? (
        <ChestReveal
          outcome={revealed}
          onDismiss={() => { say(openingLine(revealed), 'success'); setRevealed(null); }}
        />
      ) : null}
    </div>
  );
}

/**
 * What the companions can be asked to do. A hook rather than a section now that
 * the Birb page splits them: hatching is the page's one primary action and
 * sits in the hero, while choosing and reading lore live in the Companions pane.
 */
function useCompanionActions(ctx: ShopContext) {
  const { avatar, identity, owned, say } = ctx;
  return {
    onChoose: (petId: string | undefined) => setCompanion(identity.memberId, identity.coupleId, petId),
    onSeeLore: (petId: string) => markLoreSeen(petId),
    onHatch: async () => {
      const level = levelOf(avatar);
      const bonus = gearBonusWithRefinement(avatar.gear, level, refineByItemId(owned));
      const luck = sheetFor(avatar, bonus).stats.luck;
      const result = await buyEgg(
        identity.coupleId,
        identity.memberId,
        { rarity: Math.random(), species: Math.random(), costume: Math.random() },
        luck,
      );
      if (!result.ok) { say(result.reason ?? null, 'error'); return; }
      const name = petKindById(result.pet!.kindId)!.name;
      const hatched = result.merged ? `Another ${name}. Two of the same found each other.` : `${name} hatched.`;
      const costume = result.costume;
      const brought = !costume ? ''
        : costume.duplicate
          ? ` Already had the ${costume.name.toLowerCase()}: ${costume.refunded ?? 0} coins back.`
          : ` It brought a ${TIER_NAMES[costume.tier].toLowerCase()} costume: ${costume.name}.`;
      say(`${hatched}${brought}`);
    },
    /* Stays on Birb now that Adventures has moved to /raid, because it is not
       the same action: this sends the companion out for a stretch of hours
       with no destination, while Adventures' `onGo` travels to a named place.
       The first is about the animal and belongs on its tab. */
    onAdventure: async () => {
      const result = await startAdventure(identity.memberId, identity.coupleId);
      say(result.ok ? `Gone for ${result.hours} hours.` : result.reason ?? null);
    },
  };
}

/**
 * The Birb page, in about one screen (docs/ONE-SCROLL.md).
 *
 * Above the fold: the room with your bird in it, who it walks with, and the
 * page's one primary action, hatching. Everything else is a labelled pane --
 * companions, the look, the room and its yard -- instead of four tall panels
 * stacked under a title, which is what made this page feel like a list.
 */
function BirbView({ ctx }: { ctx: ShopContext }) {
  const { avatar, pets, owned, identity } = ctx;
  const actions = useCompanionActions(ctx);
  const house = (ctx.pet?.house ?? {}) as House;
  const walking = pets.find((pet) => pet.id === avatar.companionId);
  const walkingName = walking ? petKindById(walking.kindId)?.name : undefined;
  const WalkingArt = walking ? petArt(walking.kindId) : undefined;
  const level = levelOf(avatar);
  const sheet = sheetFor(avatar, gearBonusWithRefinement(avatar.gear, level, refineByItemId(owned)));
  const cost = adventureCost(level, sheet.energy);

  return (
    <>
      <section className="panel birb-hero" aria-label="Your birb">
        <HouseScene house={house} avatar={avatar} />
        <div className="birb-hero-side">
          <div className="birb-hero-walk">
            {WalkingArt ? <span className="birb-hero-pet"><WalkingArt /></span> : null}
            <span className="birb-hero-walk-text">
              {walkingName ? `Walking with ${walkingName}` : 'Nobody walking with you yet'}
            </span>
          </div>
          <span className="birb-hero-coins">{avatar.coins} coins</span>
          <PrimaryAction disabled={avatar.coins < EGG_PRICE} onClick={actions.onHatch}>
            {avatar.coins < EGG_PRICE
              ? `${EGG_PRICE - avatar.coins} more for an egg`
              : `Hatch an egg · ${EGG_PRICE}`}
          </PrimaryAction>
          <SecondaryAction onClick={actions.onAdventure}>{cost.shortBy > 0
            ? `${cost.shortBy} more energy to adventure`
            : `Adventure · ${cost.energy} energy, ${cost.hours}h`}</SecondaryAction>
        </div>
      </section>

      <SwipePane
        label="Birb"
        tabs
        panes={[
          {
            id: 'companions',
            label: 'Companions',
            content: (
              <Companions
                avatar={avatar}
                pets={pets}
                owned={owned}
                onChoose={actions.onChoose}
                onSeeLore={actions.onSeeLore}
              />
            ),
          },
          { id: 'look', label: 'Look', content: <ColoursSection ctx={ctx} /> },
          {
            id: 'home',
            label: 'Room & yard',
            content: (
              <section className="panel">
                <HouseInventory house={house} />
                <GardenPlots
                  memberId={identity.memberId}
                  coupleId={identity.coupleId}
                  garden={(ctx.pet?.plots ?? {}) as Garden}
                  petXp={ctx.pet?.xp ?? 0}
                  coins={avatar.coins}
                  say={ctx.say}
                />
              </section>
            ),
          },
        ]}
      />
    </>
  );
}

function CostumesSection({ ctx }: { ctx: ShopContext }) {
  const { avatar, identity, owned, say } = ctx;
  return (
    <Costumes
      avatar={avatar}
      owned={owned}
      onWear={async (costumeId) => {
        const result = await wearCostume(identity.memberId, identity.coupleId, costumeId);
        if (!result.ok) say(result.reason ?? null, 'error');
      }}
    />
  );
}

function ColoursSection({ ctx }: { ctx: ShopContext }) {
  const { avatar, identity, owned, say } = ctx;
  return (
    <Colours
      avatar={avatar}
      owned={owned}
      onBuy={async (dyeId) => {
        const result = await buyDye(identity.memberId, identity.coupleId, dyeId);
        say(result.ok ? 'Bought. Tap it again to put it on.' : result.reason ?? null, result.ok ? 'success' : 'error');
      }}
      onWear={async (dyeId) => {
        const result = await wearDye(identity.memberId, identity.coupleId, dyeId);
        if (!result.ok) say(result.reason ?? null, 'error');
      }}
    />
  );
}

/** One roll set per item, drawn here and handed in, so the domain and the
 *  repository both stay deterministic given their inputs. */
function freshRolls() {
  return Array.from({ length: PRIZES_PER_CHEST }, () => ({
    tier: Math.random(), kind: Math.random(), stat: Math.random(), pick: Math.random(),
  }));
}

/**
 * -- the raid ------------------------------------------------------------
 * One section, three panels, in the order the question is asked: what you
 * bring, the fight it is for, and the smaller outings that are not it.
 *
 * These three used to be spread across `/birb` — the sheet under `worn`, the
 * boss and the adventures each their own flag — which put the seven raid stats
 * on the tab about dressing a bird and gave the one screen that fetches a
 * Worker no home of its own. The sheet's old comment argued it belonged "at
 * the wardrobe, not mid-fight", and that is still true: it is *also* rendered
 * by the Bag, which is the wardrobe. One implementation, two callers, the same
 * argument `ChestAlcove`'s header makes about published odds.
 */
function RaidSection({ ctx, onRevealed }: {
  ctx: ShopContext;
  onRevealed: (outcome: Extract<ChestOutcome, { ok: true }>) => void;
}) {
  const { avatar, identity, pets, owned, pet, settings, say } = ctx;
  const petXp = pet?.xp ?? 0;
  const house = (pet?.house ?? {}) as House;
  const companion = pets.find((p) => p.id === avatar.companionId);
  const world = useLiveQuery(() => loadWorldProgress(identity.coupleId), [identity.coupleId]);
  /** One star chest at a time, for the same reason the Shop opens one chest at a time. */
  const [opening, setOpening] = useState(false);

  const openStar = async (monsterId: string) => {
    if (opening) return;
    setOpening(true);
    try {
      const result = await openStarChest(identity.memberId, identity.coupleId, monsterId, freshRolls());
      if (!result.ok) { say(result.reason, 'error'); return; }
      onRevealed(result);
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      {/* The map first: where the couple are, what is next, and the stars. The
          panels after it are the detail, folded so the page stays one scroll. */}
      {world && (
        <IslandPath
          world={world}
          opened={avatar.starChests ?? []}
          busy={opening}
          onOpenStar={(id) => { void openStar(id); }}
        />
      )}
      <Merchant title="Your raid sheet" sub="Every stat, where it comes from, and what one swap would change.">
        <RaidSheet
          avatar={avatar}
          owned={owned}
          petXp={petXp}
          house={house}
          garden={pet?.plots as Garden | undefined}
          companion={companion}
        />
        {/* Directly under the sheet, because it is the rest of the same
            sentence: the sheet says what every number is and where it came
            from, and this says what one different piece would make of it. */}
        <GearDiff avatar={avatar} owned={owned} petXp={petXp} house={house} companion={companion} />
      </Merchant>
      <Merchant title="Boss and adventures" sub="The weekly boss, and short trips that bring something back.">
        <Boss
          avatar={avatar}
          pets={pets}
          owned={owned}
          workerUrl={settings?.workerUrl}
          token={settings?.workerSecret}
          onSpendMp={(amount) => spendMp(identity.memberId, identity.coupleId, amount)}
          onSpendPetMp={spendPetMp}
          onMessage={(text) => say(text)}
        />
        <Adventures
          avatar={avatar}
          owned={owned}
          onGo={async (placeId) => {
            // The roll is drawn here and handed in, so the repository and the
            // domain both stay deterministic given their inputs.
            const result = await startAdventure(
              identity.memberId, identity.coupleId, placeId, Math.random(),
            );
            if (!result.ok) say(result.reason ?? null, 'error');
            else say(
              `${result.place}: came back with ${result.found}.`
              + (result.bounty ? ` +${result.bounty} coins for getting there first.` : ''),
            );
          }}
        />
      </Merchant>
    </>
  );
}

/**
 * The shop is the chests; everything you can simply buy is the drawer under
 * them. Four purchase panels stacked one after another were the whole page,
 * which put a screen about spending money in front of somebody every time they
 * came looking for a chest.
 */
function ShopSectionView({ ctx, onRevealed }: {
  ctx: ShopContext;
  onRevealed: (outcome: Extract<ChestOutcome, { ok: true }>) => void;
}) {
  const { avatar, identity, owned, day, say } = ctx;
  /** One chest at a time. Two taps racing would spend twice and show once. */
  const [opening, setOpening] = useState(false);

  const openChest = async (chestId: string) => {
    if (opening) return;
    setOpening(true);
    try {
      const result = await openChestFor(
        identity.memberId, identity.coupleId, chestId,
        // One roll set per item, drawn here and handed in, so the domain and
        // the repository both stay deterministic given their inputs -- the
        // same arrangement `buyEgg` has.
        freshRolls(),
      );
      if (!result.ok) { say(result.reason, 'error'); return; }
      onRevealed(result);
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <ChestAlcove
        coins={avatar.coins}
        luck={luckOf(avatar, owned)}
        pity={avatar.chestPity ?? {}}
        busy={opening}
        onOpen={openChest}
      />
      <Merchant>
        <Surprise
          avatar={avatar}
          owned={owned}
          day={day}
          onBuy={async () => {
            const result = await buyOffer(identity.memberId, identity.coupleId, day);
            say(
              result.ok ? 'Bought, at today\u2019s price.' : result.reason ?? null,
              result.ok ? 'success' : 'error',
            );
          }}
        />
        <Deals
          avatar={avatar}
          owned={owned}
          day={day}
          onBuy={async (itemId) => {
            const result = await buyDeal(identity.memberId, identity.coupleId, day, itemId);
            say(result.ok ? 'Bought, at today\u2019s price.' : result.reason ?? null, result.ok ? 'success' : 'error');
          }}
        />
        <Refine
          avatar={avatar}
          owned={owned}
          onRefine={async (itemId) => {
            const result = await buyGear(identity.memberId, identity.coupleId, itemId);
            if (!result.ok) say(result.reason ?? null, 'error');
            else if (result.refined) say(`Refined to +${result.refined}.`);
          }}
        />
      </Merchant>
    </>
  );
}


/** How many companion cards the pane shows before "See all" (ONE-SCROLL rule 3). */
const COMPANIONS_SHOWN = 3;

function Companions({ avatar, pets, owned, onChoose, onSeeLore }: {
  avatar: Avatar;
  pets: PetInstance[];
  owned: InventoryItem[];
  onChoose: (petId: string | undefined) => void;
  onSeeLore: (petId: string) => void;
}) {
  const [all, setAll] = useState(false);
  const level = levelOf(avatar);
  const sheet = sheetFor(avatar, gearBonusWithRefinement(avatar.gear, level, refineByItemId(owned)));
  // The one you walk with first, so it is never the card behind "See all".
  const ordered = [...pets].sort((a, b) =>
    Number(b.id === avatar.companionId) - Number(a.id === avatar.companionId));
  const shown = ordered.slice(0, COMPANIONS_SHOWN);
  const card = (pet: PetInstance, compact = false) => (
    <PetCard
      key={pet.id}
      pet={pet}
      chosen={avatar.companionId === pet.id}
      compact={compact}
      onChoose={onChoose}
      onSeeLore={onSeeLore}
    />
  );

  return (
    <section className="panel">
      {pets.length === 0 ? (
        <div className="birb-empty">
          <span className="birb-empty-egg" aria-hidden="true">
            <svg viewBox="0 0 40 48"><ellipse cx="20" cy="27" rx="15" ry="19" fill="var(--color-surface-muted)" stroke="var(--color-text-muted)" strokeWidth="1.5" /><path d="M9 26l5-4 5 5 5-5 5 4 3-2" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <p className="section-sub">No eggs hatched yet. The first one is above, at the top of the page.</p>
        </div>
      ) : (
        <ul className="pet-list pet-list-compact">{shown.map((pet) => card(pet, true))}</ul>
      )}

      {pets.length > 0 ? (
        <SecondaryAction onClick={() => setAll(true)}>
          {pets.length > COMPANIONS_SHOWN ? `See all ${pets.length}` : 'Skills and lore'}
        </SecondaryAction>
      ) : null}

      <Sheet
        open={all}
        onClose={() => setAll(false)}
        label="All companions"
        scrimClassName="menu-scrim"
        panelClassName="menu-panel birb-sheet"
      >
        <div className="birb-sheet-head">
          <h2 className="section-title">All companions</h2>
          <SecondaryAction onClick={() => setAll(false)}>Done</SecondaryAction>
        </div>
        <ul className="pet-list">{ordered.map((pet) => card(pet))}</ul>
      </Sheet>

      <Merchant title="Egg odds" sub="What the next egg could be, with your luck folded in.">
        <Odds luck={sheet.stats.luck} pity={avatar.pity ?? 0} />
      </Merchant>
    </section>
  );
}

/**
 * One companion. Shared by the pane and the "See all" sheet: the pane shows
 * it `compact` -- portrait, name, rank and the walk button -- and the sheet
 * shows the MP, the skill and the lore, so three companions fit in a screen.
 */
function PetCard({ pet, chosen, compact = false, onChoose, onSeeLore }: {
  pet: PetInstance;
  chosen: boolean;
  compact?: boolean;
  onChoose: (petId: string | undefined) => void;
  onSeeLore: (petId: string) => void;
}) {
  const view = petSheet(pet);
  const Art = petArt(pet.kindId);
  // A rarer companion is lit more brightly, and the one you have actually
  // chosen is the only one whose ring drifts on its own.
  return (
    <li>
      <BorderGlow
        className={`pet ${chosen ? 'pet-chosen' : ''}`}
        colors={RARITY_GLOW[view.kind.rarity]}
        intensity={RARITY_INTENSITY[view.kind.rarity]}
        animated={chosen}
      >
        {Art ? <div className="pet-portrait" data-tier={view.kind.rarity}><Art /></div> : null}
        <div className="pet-head">
          <span className="pet-name">{view.kind.name}</span>
          <span className="pet-rarity">{RARITY_NAMES[view.kind.rarity]} · rank {view.rank}</span>
        </div>

        {compact ? null : (<>
        <div className="bar-row">
          <span className="bar-label">MP</span>
          <div className="bar">
            <div
              className="bar-fill bar-fill-accent"
              style={{ width: `${(view.mp / Math.max(1, view.maxMp)) * 100}%` }}
            />
          </div>
          <span className="bar-value">{view.mp}/{view.maxMp}</span>
        </div>

        <div className="pet-skill">
          <strong>{view.kind.skill.name}</strong> · {view.kind.skill.mpCost} MP
          <div className="task-line">{view.kind.skill.blurb}</div>
        </div>

        {/* The lore is a reveal, not a label: it exists only once the egg is
            open, which is the whole of why an egg is worth having. */}
        {pet.loreSeenAt ? (
          <p className="pet-lore">{view.kind.lore}</p>
        ) : (
          <SecondaryAction onClick={() => onSeeLore(pet.id)}>Read who this is</SecondaryAction>
        )}
        </>)}

        <button
          type="button"
          className={chosen ? 'quiet' : 'primary'}
          onClick={() => onChoose(chosen ? undefined : pet.id)}
        >
          {chosen ? 'Walking with you' : 'Walk with this one'}
        </button>
      </BorderGlow>
    </li>
  );
}

/**
 * Where to send the bird, and where it has already been.
 *
 * Locations unlock by level rather than by purchase: coins already have three
 * things to buy, and a level had never bought anything at all. A place you
 * cannot reach yet is shown anyway, with the level it opens at — the list is
 * as much a reason to keep going as it is a menu.
 */
function Adventures({ avatar, owned, onGo }: {
  avatar: Avatar;
  owned: InventoryItem[];
  onGo: (placeId: string) => void;
}) {
  const level = levelOf(avatar);
  const sheet = sheetFor(avatar, gearBonusWithRefinement(avatar.gear, level, refineByItemId(owned)));
  const base = adventureCost(sheet.level, sheet.energy).energy;
  const visited = avatar.visited ?? [];
  const next = nextPlace(level);

  return (
    <section className="panel">
      <h2 className="section-title">Adventures</h2>
      <p className="section-sub">
        {sheet.energy} energy. Somewhere new pays a bounty the first time;
        after that they go for the trip.
      </p>

      <ul className="place-list">
        {PLACES.map((place) => {
          const verdict = canTravel(place, sheet.level, sheet.energy, base);
          const locked = level < place.unlockLevel;
          const been = visited.includes(place.id);
          return (
            <li className="place" key={place.id} data-locked={locked ? 'true' : 'false'}>
              <div className="place-body">
                <div className="place-name">
                  {place.name}
                  {been ? <span className="place-been" title="Been here">✓</span> : null}
                </div>
                <div className="place-blurb">{place.blurb}</div>
              </div>
              <button
                type="button"
                className="place-go"
                disabled={!verdict.ok}
                onClick={() => onGo(place.id)}
                title={verdict.ok ? `${travelCost(place, base)} energy` : verdict.reason}
                aria-label={verdict.ok ? `Go to ${place.name}` : `${place.name}: ${verdict.reason}`}
              >
                {/* Words, not a ⚡: a colour emoji is the one thing on screen
                    that cannot take the theme, and icons.tsx rejects
                    glyph-as-icon for exactly this reason. */}
                {locked
                  ? `Your Lv ${place.unlockLevel}`
                  : `${travelCost(place, base)} energy`}
              </button>
            </li>
          );
        })}
      </ul>

      {next ? (
        <p className="section-sub">
          {next.name} opens at level {next.unlockLevel}.
        </p>
      ) : (
        <p className="section-sub">Everywhere is open. They have been busy.</p>
      )}
    </section>
  );
}

/**
 * The birbhouse: one room, drawn in layers, with the bird standing in it.
 *
 * The room is the couple's — it lives on the shared `pet` row — so rearranging
 * it changes what both of you see. See the note at the top of
 * `domain/rpg/furniture.ts`.
 *
 * Everything is drawn into one 100×100 SVG so the pieces share a coordinate
 * space and can actually sit behind and in front of each other: window and
 * wall behind the bird, floor and perch in front. Compositing separate boxes
 * would have meant a rug that is always painted over the feet standing on it.
 */
/**
 * The birbhouse room with your bird standing in it: the Birb page's hero.
 *
 * Yours together. It furnishes itself from what the two of you own, so there
 * is nothing to place -- see `refurnishHouse`. The bird is laid over the room
 * rather than drawn inside its SVG, because the mascot may be a canvas, and a
 * canvas cannot live in an SVG.
 */
function HouseScene({ house, avatar }: { house: House; avatar: Avatar }) {
  const { theme } = useTheme();
  const mascot = getMascot(theme.id);
  const placed = normalizeHouse(house);
  return (
    <div className="house" role="img" aria-label={`${mascot.name} in the birbhouse`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="house-scene">
        <rect x="4" y="8" width="92" height="80" rx="6" fill="var(--color-surface-muted)" />
        <path d="M4 76h92" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.5" />
        {/* The whole room, then the bird on top of it. Nothing is drawn in
            front of the character -- see the note on HOUSE_SLOTS. */}
        {HOUSE_SLOTS.map((slot) => {
          const Art = houseArt(placed[slot]);
          return Art ? <Art key={slot} /> : null;
        })}
      </svg>
      <div className="house-birb" style={dyeStyle(avatar.dye) as React.CSSProperties}>
        <mascot.Art mood="content" />
        <CostumeLayer id={avatar.costume} />
      </div>
    </div>
  );
}

/**
 * What is in the room, as a list. An inventory rather than a control: each
 * line is the piece that won its slot, so the drawing is never a change
 * nobody can account for.
 */
function HouseInventory({ house }: { house: House }) {
  const placed = normalizeHouse(house);
  const bare = HOUSE_SLOTS.filter((slot) => !placed[slot]);
  return (
    <>
      <h3 className="section-title">The room</h3>
      <ul className="house-list">
        {HOUSE_SLOTS.filter((slot) => placed[slot]).map((slot) => {
          const item = furnitureById(placed[slot]);
          return item ? (
            <li className="house-line" key={slot}>
              <span className="house-line-slot">{HOUSE_SLOT_NAMES[slot]}</span>
              <span className="house-line-name">{item.name}</span>
            </li>
          ) : null;
        })}
      </ul>
      {bare.length > 0 ? (
        <p className="section-sub">
          {bare.length === HOUSE_SLOTS.length
            ? 'Nothing in it yet. The merchant stocks furniture most days; the best piece either of you owns moves in.'
            : `Still bare: ${bare.map((slot) => HOUSE_SLOT_NAMES[slot].toLowerCase()).join(', ')}.`}
        </p>
      ) : null}
    </>
  );
}

/**
 * Colourways, each shown on the actual bird rather than as a swatch.
 *
 * The preview is the real mascot component with the dye's three custom
 * properties set on its wrapper — the same mechanism that dresses the bird for
 * real, so what you see here cannot disagree with what you get. That works
 * because every mascot paints only in `--color-text`, `--color-accent` and
 * `--color-text-muted`; see `domain/rpg/dyes.ts`.
 *
 * One button per colourway, which buys it if it is not yours and wears it if it
 * is. Two buttons on a tile this size would be two targets too small to hit,
 * and the second one is never the one you want first.
 */
function Colours({ avatar, owned, onBuy, onWear }: {
  avatar: Avatar;
  owned: InventoryItem[];
  onBuy: (dyeId: string) => void;
  onWear: (dyeId: string) => void;
}) {
  const { theme } = useTheme();
  const mascot = getMascot(theme.id);
  const worn = avatar.dye ?? DEFAULT_DYE_ID;

  return (
    <section className="panel">
      <h2 className="section-title">Colours</h2>
      <p className="section-sub">
        {avatar.coins} coins. Purely how {mascot.name} looks — a colourway changes
        nothing you can do.
      </p>

      <ul className="dye-grid">
        {DYES.map((dye) => {
          const isOwned = dye.price === 0 || ownsItem(owned, dye.id);
          const isWorn = worn === dye.id;
          const afford = avatar.coins >= dye.price;
          return (
            <li key={dye.id} className="dye">
              <button
                type="button"
                className="dye-button"
                data-worn={isWorn ? 'true' : 'false'}
                disabled={isWorn || (!isOwned && !afford)}
                title={dye.blurb}
                onClick={() => (isOwned ? onWear(dye.id) : onBuy(dye.id))}
                aria-label={
                  isWorn ? `${dye.name}, currently worn`
                    : isOwned ? `Put ${dye.name} on`
                      : `Buy ${dye.name} for ${dye.price} coins`
                }
              >
                <span className="dye-art" style={dyeStyle(dye.id) as React.CSSProperties}>
                  <mascot.Art mood="content" />
                </span>
                <span className="dye-name">{dye.name}</span>
                <span className="dye-state">
                  {isWorn ? 'Worn' : isOwned ? 'Wear it' : `${dye.price} coins`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The wardrobe: every costume, shown on the actual bird, worn if it is yours.
 *
 * Costumes are not sold. Every egg brings one at the tier of the companion that
 * hatched, so the rarest things to wear come out of the rarest hatches — the
 * ones you have not found yet are shown shut away, with the tier of egg they
 * come from, so the hunt has a direction. Kept apart from Colours on purpose: a
 * costume is drawn over the bird in colours of its own, so the preview here
 * wears the bird's *current* dye and the costume does not follow it. Tapping the
 * worn one takes it off.
 */
function Costumes({ avatar, owned, onWear }: {
  avatar: Avatar;
  owned: InventoryItem[];
  onWear: (costumeId: string | null) => void;
}) {
  const { theme } = useTheme();
  const mascot = getMascot(theme.id);
  const have = COSTUMES.filter((costume) => ownsItem(owned, costume.id)).length;

  return (
    <section className="panel">
      <h2 className="section-title">Costumes</h2>
      <p className="section-sub">
        {have} of {COSTUMES.length}. Every egg brings one, at the same rarity as the
        companion that hatches — something {mascot.name} wears, not a colour it is.
      </p>

      <ul className="costume-grid">
        {COSTUMES.map((costume) => {
          const isOwned = ownsItem(owned, costume.id);
          const isWorn = avatar.costume === costume.id;
          return (
            <li key={costume.id} className="costume" data-tier={costume.tier}>
              <button
                type="button"
                className="costume-button"
                data-worn={isWorn ? 'true' : 'false'}
                data-owned={isOwned ? 'true' : 'false'}
                disabled={!isOwned}
                title={isOwned ? costume.blurb : `Comes out of a ${TIER_NAMES[costume.tier].toLowerCase()} hatch`}
                onClick={() => onWear(isWorn ? null : costume.id)}
                aria-label={
                  isWorn ? `${costume.name}, currently worn. Take it off`
                    : isOwned ? `Put ${costume.name} on`
                      : `${TIER_NAMES[costume.tier]} costume, not found yet`
                }
              >
                <span className="costume-art" style={dyeStyle(avatar.dye) as React.CSSProperties}>
                  <mascot.Art mood="content" />
                  <CostumeLayer id={costume.id} />
                </span>
                <span className="costume-name">{isOwned ? costume.name : '???'}</span>
                <span className="costume-state">
                  {isWorn ? 'Worn' : isOwned ? 'Wear it' : `${TIER_NAMES[costume.tier]} egg`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * What an egg is actually going to do, before anybody spends a hundred and
 * twenty coins finding out.
 *
 * Reads `chancesFor` rather than `dropChances`, and the difference is the whole
 * reason this screen is defensible: `dropChances` is the general table, and
 * `chancesFor` is the table **for the next egg** with this member's luck and
 * their pity floor already in it. A screen printing a flat 10% next to a
 * guarantee it did not mention would be telling a small lie every fifteenth
 * egg, which is worse than publishing nothing.
 *
 * The pity line is here for the same reason. A floor nobody can see is not a
 * kindness, it is a hidden number — and said plainly it is also the thing that
 * makes a bad run bearable while it is happening.
 *
 * Note the bonus is zero: `buyEgg` is called without a victory bonus at the one
 * call site, so showing one would describe a roll the app does not make.
 */
function Odds({ luck, pity }: { luck: number; pity: number }) {
  const chances = chancesFor(luck, 0, pity);
  const floored = pityFloor(pity) !== null;

  return (
    <div className="odds">
      <ul className="odds-table">
        {RARITIES.map((rarity) => (
          <li key={rarity} className="odds-row" data-rarity={rarity} data-none={chances[rarity] === 0}>
            <span className="odds-name">{RARITY_NAMES[rarity]}</span>
            <span className="odds-chance">{(chances[rarity] * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <p className="section-sub">
        {/* At zero this must not read as "you just had an epic" to somebody
            who has never hatched anything, so the two cases are worded apart. */}
        {floored
          ? `This one is guaranteed epic or better — ${PITY_AT} eggs without one.`
          : pity === 0
            ? `Epic or better guaranteed within ${PITY_AT} eggs.`
            : `${pity} ${pity === 1 ? 'egg' : 'eggs'} since an epic. Guaranteed at ${PITY_AT}.`}
        {luck > 0 ? ` Your luck is already folded in.` : ''}
      </p>
    </div>
  );
}

/**
 * The day's offer.
 *
 * No countdown, and that is a decision rather than an omission — see the banner
 * in `domain/rpg/mysteryShop.ts`. A clock on a purchase is a device for
 * stopping somebody thinking, and the coins here were earned by logging a mood.
 * "Changes daily" is the whole of what a person needs to know.
 */
function Surprise({ avatar, owned, day, onBuy }: {
  avatar: Avatar;
  owned: InventoryItem[];
  day: DayKey;
  onBuy: () => void;
}) {
  const offer = offerFor(day);
  if (!offer) return null;

  const alreadyOwned = findOwned(owned, offer.id) !== undefined;
  const afford = avatar.coins >= offer.price;

  return (
    <section className="panel">
      <h2 className="section-title">Today&rsquo;s find</h2>
      <p className="section-sub">
        One thing, a third off, changing daily. Both of you see the same one.
      </p>

      <div className="surprise">
        <div className="surprise-body">
          <span className="surprise-name">{offer.name}</span>
          <span className="surprise-blurb">{offer.blurb}</span>
        </div>
        <button
          type="button"
          className="primary"
          disabled={alreadyOwned || !afford}
          onClick={onBuy}
        >
          {alreadyOwned
            ? 'Already yours'
            : afford
              ? `${offer.price} coins`
              : `${offer.price - avatar.coins} more coins`}
          {alreadyOwned ? null : <s className="surprise-was">{offer.listPrice}</s>}
        </button>
      </div>
    </section>
  );
}

/** A deal's picture: the gear drawing, the furniture fragment, or the two colours of a dye. */
function DealArt({ deal }: { deal: Deal }) {
  if (deal.kind === 'gear') {
    return <GearIcon id={deal.id} />;
  }
  if (deal.kind === 'decor') {
    const Art = houseArt(deal.id);
    return <svg viewBox="0 0 100 100">{Art ? <Art /> : null}</svg>;
  }
  const dye = dyeById(deal.id);
  return (
    <svg viewBox="0 0 100 100">
      <circle cx="42" cy="50" r="28" fill={dye?.ink} />
      <circle cx="66" cy="50" r="18" fill={dye?.accent} />
    </svg>
  );
}

/**
 * Today's shelf: a handful of gear, furniture and a colourway, each a fifth to
 * a third off, the same on both phones. See `domain/rpg/merchant.ts` for why
 * this is short and what is never on it.
 *
 * Owned pieces stay listed as "Owned" rather than vanishing, so the two shelves
 * match even when the two bags do not.
 */
function Deals({ avatar, owned, day, onBuy }: {
  avatar: Avatar;
  owned: InventoryItem[];
  day: DayKey;
  onBuy: (itemId: string) => void;
}) {
  return (
    <section className="panel">
      <h2 className="section-title">Today&rsquo;s deals</h2>
      <p className="section-sub">
        {avatar.coins} coins. New stock tomorrow; you both see the same shelf.
      </p>
      <ul className="decor-list">
        {dealsFor(day).map((deal) => {
          const isOwned = findOwned(owned, deal.id) !== undefined;
          const afford = avatar.coins >= deal.price;
          return (
            <li className="decor" key={deal.id} data-tier={deal.rarity}>
              <span className="decor-art" aria-hidden="true"><DealArt deal={deal} /></span>
              <span className="decor-body">
                <span className="decor-name">
                  {deal.name}{deal.rarity ? ` · ${RARITY_NAMES[deal.rarity]}` : ''}
                </span>
                <span className="decor-blurb">{deal.blurb}</span>
              </span>
              <button
                type="button"
                className="decor-buy"
                disabled={isOwned || !afford}
                onClick={() => onBuy(deal.id)}
                aria-label={isOwned
                  ? `${deal.name}, already owned`
                  : `Buy ${deal.name} for ${deal.price} coins, ${deal.percentOff} percent off`}
              >
                {isOwned ? 'Owned' : <>{deal.price} <s className="surprise-was">{deal.listPrice}</s></>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** How many refinable pieces the merchant lists at once: the cheapest next steps. */
const REFINE_LISTED = 5;

/**
 * Gear you own, one refine further. Re-buying an owned piece refines it, and
 * the rotating shelf would otherwise have stranded that -- the full catalogue
 * used to be the only place to do it.
 */
function Refine({ avatar, owned, onRefine }: {
  avatar: Avatar;
  owned: InventoryItem[];
  onRefine: (itemId: string) => void;
}) {
  const rows = owned
    .map((row) => ({ row, item: gearById(row.itemId) }))
    .filter((entry): entry is { row: InventoryItem; item: NonNullable<ReturnType<typeof gearById>> } =>
      entry.item !== undefined && entry.row.refine < REFINE_MAX)
    .map(({ row, item }) => ({ row, item, price: refinePrice(item.rarity, row.refine) }))
    .sort((a, b) => a.price - b.price || a.item.id.localeCompare(b.item.id))
    .slice(0, REFINE_LISTED);
  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <h2 className="section-title">Refine what you own</h2>
      <p className="section-sub">The next step for the gear in your bag, cheapest first.</p>
      <ul className="decor-list">
        {rows.map(({ row, item, price }) => {
          return (
            <li className="decor" key={item.id} data-tier={item.rarity}>
              <span className="decor-art" aria-hidden="true"><GearIcon id={item.id} /></span>
              <span className="decor-body">
                <span className="decor-name">{item.name}{row.refine > 0 ? ` +${row.refine}` : ''}</span>
                <span className="decor-blurb">Refine to +{row.refine + 1}</span>
              </span>
              <button
                type="button"
                className="decor-buy"
                disabled={avatar.coins < price}
                onClick={() => onRefine(item.id)}
                aria-label={`Refine ${item.name} for ${price} coins`}
              >
                {price}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
