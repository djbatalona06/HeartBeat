import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../../ui/Toast';
import { db, loadSettings } from '../../db/database';
import {
  buyDye,
  buyEgg,
  buyFurniture,
  buyGear,
  buyOffer,
  ensureIdentity,
  getOrCreateAvatar,
  markLoreSeen,
  openChestFor,
  setCompanion,
  spendMp,
  spendPetMp,
  startAdventure,
  wearDye,
} from '../../db/repository';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import {
  GEAR, RARITIES, RARITY_NAMES, type GearItem, type Rarity,
} from '../../domain/rpg/gear';
import { adventureCost } from '../../domain/rpg/stage';
import {
  PITY_AT, chancesFor, petKindById, petSheet, pityFloor, type PetInstance,
} from '../../domain/rpg/pets';
import { offerFor } from '../../domain/rpg/mysteryShop';
import { todayKey } from '../../domain/day';
import type { DayKey } from '../../domain/types';
import type { Avatar } from '../../domain/rpg/types';
import { findOwned, ownsItem, refineByItemId, type InventoryItem } from '../../domain/rpg/inventory';
import { EGG_PRICE, GEAR_PRICE, REFINE_MAX, gearBonusWithRefinement, refinePrice } from '../../domain/rpg/shop';
import { DEFAULT_DYE_ID, DYES, dyeStyle } from '../../domain/rpg/dyes';
import {
  FURNITURE,
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
import { gearArt } from '../party/art/gear';
import { petArt } from '../party/art/pets';
import { ChestAlcove } from '../party/ChestAlcove';
import { Purchases } from '../party/Purchases';
import { RaidSheet } from '../party/RaidSheet';
import { Boss } from '../party/Boss';
import { GearDiff } from '../party/GearDiff';
import { PRIZES_PER_CHEST } from '../../domain/rpg/chests';
import type { ChestOutcome } from '../../db/repository/chests';
import { ChestReveal } from '../chest/ChestReveal';
import { openingLine } from '../chest/receipt';
import { SecondaryAction } from '../../ui/SecondaryAction';

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
export type ShopSection = 'companions' | 'colours' | 'house' | 'raid' | 'shop';

/**
 * The shop: what coins are for. Birb and Raid are this page asked for other
 * sections — see `ShopSection`.
 *
 * The boss panel (Raid) is the only screen in the app that cannot render from
 * IndexedDB, because boss HP is contested state — see `worker/src/boss.ts`. It
 * says so plainly when there is no Worker configured rather than showing a bar
 * that is quietly a lie.
 */
export function ShopPage({ only = ['shop'], title = 'Shop' }: {
  only?: readonly ShopSection[];
  title?: string;
}) {
  const settings = useLiveQuery(loadSettings, []);
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const { say } = useToast();
  /** One chest at a time. Two taps racing would spend twice and show once. */
  const [opening, setOpening] = useState(false);
  // What the last chest handed over, while it is still being looked at. The
  // reveal is the receipt; the toast below is only the fallback for a page
  // that never mounted one.
  const [revealed, setRevealed] = useState<Extract<ChestOutcome, { ok: true }> | null>(null);

  // The sheet has to exist before the first completion, or a fresh install
  // shows a page with no character on it and no way to tell that is temporary.
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


  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">
          <Link className="sheet-party" to="/tasks">← Tasks</Link>
        </p>
      </header>

      {avatar && identity ? (
        <>
          {only.includes('companions') ? (
          <Companions
            avatar={avatar}
            pets={pets ?? []}
            owned={owned ?? []}
            onChoose={(petId) => setCompanion(identity.memberId, identity.coupleId, petId)}
            onSeeLore={(petId) => markLoreSeen(petId)}
            onHatch={async () => {
              const level = levelOf(avatar);
              const bonus = gearBonusWithRefinement(avatar.gear, level, refineByItemId(owned ?? []));
              const luck = sheetFor(avatar, bonus).stats.luck;
              const result = await buyEgg(
                identity.coupleId,
                identity.memberId,
                { rarity: Math.random(), species: Math.random() },
                luck,
              );
              if (!result.ok) { say(result.reason ?? null, 'error'); return; }
              const name = petKindById(result.pet!.kindId)!.name;
              say(result.merged ? `Another ${name}. Two of the same found each other.` : `${name} hatched.`);
            }}
            /* Stays here now that Adventures has moved to /raid, because it
               is not the same action: this sends the companion out for a
               stretch of hours with no destination, while Adventures' `onGo`
               travels to a named place. The first is about the animal and
               belongs on its tab; only the second is a raid concern. */
            onAdventure={async () => {
              const result = await startAdventure(identity.memberId, identity.coupleId);
              say(result.ok ? `Gone for ${result.hours} hours.` : result.reason ?? null);
            }}
          />
          ) : null}

          {only.includes('colours') ? (
          <Colours
            avatar={avatar}
            owned={owned ?? []}
            onBuy={async (dyeId) => {
              const result = await buyDye(identity.memberId, identity.coupleId, dyeId);
              say(result.ok ? 'Bought. Tap it again to put it on.' : result.reason ?? null, result.ok ? 'success' : 'error');
            }}
            onWear={async (dyeId) => {
              const result = await wearDye(identity.memberId, identity.coupleId, dyeId);
              if (!result.ok) say(result.reason ?? null, 'error');
            }}
          />
          ) : null}

          {/*
            -- the raid ------------------------------------------------------
            One section, three panels, in the order the question is asked: what
            you bring, the fight it is for, and the smaller outings that are
            not it.

            These three used to be spread across `/birb` — the sheet under
            `worn`, the boss and the adventures each their own flag — which put
            the seven raid stats on the tab about dressing a bird and gave the
            one screen that fetches a Worker no home of its own. The sheet's
            old comment argued it belonged "at the wardrobe, not mid-fight",
            and that is still true: it is *also* rendered by the Bag, which is
            the wardrobe. One implementation, two callers, the same argument
            `ChestAlcove`'s header makes about published odds.
          */}
          {only.includes('raid') ? (
          <>
            <RaidSheet
              avatar={avatar}
              owned={owned ?? []}
              petXp={pet?.xp ?? 0}
              house={(pet?.house ?? {}) as House}
              garden={pet?.plots as Garden | undefined}
              companion={(pets ?? []).find((p) => p.id === avatar.companionId)}
            />
            {/* Directly under the sheet, because it is the rest of the same
                sentence: the sheet says what every number is and where it came
                from, and this says what one different piece would make of it. */}
            <GearDiff
              avatar={avatar}
              owned={owned ?? []}
              petXp={pet?.xp ?? 0}
              house={(pet?.house ?? {}) as House}
              companion={(pets ?? []).find((p) => p.id === avatar.companionId)}
            />
            <Boss
              avatar={avatar}
              pets={pets ?? []}
              owned={owned ?? []}
              workerUrl={settings?.workerUrl}
              token={settings?.workerSecret}
              onSpendMp={(amount) => spendMp(identity.memberId, identity.coupleId, amount)}
              onSpendPetMp={spendPetMp}
              onMessage={(text) => say(text)}
            />
            <Adventures
              avatar={avatar}
              owned={owned ?? []}
              onGo={async (placeId) => {
                // The roll is drawn here and handed in, so the repository and
                // the domain both stay deterministic given their inputs.
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
          </>
          ) : null}

          {only.includes('house') ? (
          <Birbhouse house={(pet?.house ?? {}) as House} avatar={avatar} />
          ) : null}

          {/* The shop is the chests; everything you can simply buy is the
              drawer under them. Four purchase panels stacked one after another
              were the whole page, which put a screen about spending money in
              front of somebody every time they came looking for a chest. */}
          {only.includes('shop') ? (
          <ChestAlcove
            coins={avatar.coins}
            luck={luckOf(avatar, owned ?? [])}
            pity={avatar.chestPity ?? {}}
            busy={opening}
            onOpen={async (chestId) => {
              if (opening) return;
              setOpening(true);
              try {
                const result = await openChestFor(
                  identity.memberId, identity.coupleId, chestId,
                  // One roll set per item, drawn here and handed in, so the
                  // domain and the repository both stay deterministic given
                  // their inputs -- the same arrangement `buyEgg` has.
                  Array.from({ length: PRIZES_PER_CHEST }, () => ({
                    tier: Math.random(),
                    kind: Math.random(),
                    stat: Math.random(),
                    pick: Math.random(),
                  })),
                );
                if (!result.ok) { say(result.reason, 'error'); return; }
                setRevealed(result);
              } finally {
                setOpening(false);
              }
            }}
          />
          ) : null}

          {only.includes('shop') ? (
          <Purchases>
            <Surprise
              avatar={avatar}
              owned={owned ?? []}
              day={day}
              onBuy={async () => {
                const result = await buyOffer(identity.memberId, identity.coupleId, day);
                say(
                  result.ok ? 'Bought, at today\u2019s price.' : result.reason ?? null,
                  result.ok ? 'success' : 'error',
                );
              }}
            />
            <Shop
              avatar={avatar}
              owned={owned ?? []}
              onBuy={async (itemId) => {
                const result = await buyGear(identity.memberId, identity.coupleId, itemId);
                if (!result.ok) say(result.reason ?? null, 'error');
                else if (result.refined) say(`Refined to +${result.refined}.`);
              }}
            />
            <Decor
              avatar={avatar}
              owned={owned ?? []}
              onBuy={async (itemId) => {
                const result = await buyFurniture(identity.memberId, identity.coupleId, itemId);
                // No "place it" any more: buying furnished the room, in the
                // same transaction that took the coins.
                say(result.ok ? 'Bought, and it has moved in.' : result.reason ?? null, result.ok ? 'success' : 'error');
              }}
            />
          </Purchases>
          ) : null}

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

function Companions({ avatar, pets, owned, onChoose, onSeeLore, onHatch, onAdventure }: {
  avatar: Avatar;
  pets: PetInstance[];
  owned: InventoryItem[];
  onChoose: (petId: string | undefined) => void;
  onSeeLore: (petId: string) => void;
  onHatch: () => void;
  onAdventure: () => void;
}) {
  const level = levelOf(avatar);
  const sheet = sheetFor(avatar, gearBonusWithRefinement(avatar.gear, level, refineByItemId(owned)));
  const cost = adventureCost(level, sheet.energy);

  return (
    <section className="panel">
      <h2 className="section-title">Companions</h2>
      <p className="section-sub">
        Doing your own list charges their bar. That is the reason to have chosen one.
      </p>

      {pets.length === 0 ? (
        <p className="section-sub">No eggs hatched yet.</p>
      ) : (
        <ul className="pet-list">
          {pets.map((pet) => {
            const view = petSheet(pet);
            const chosen = avatar.companionId === pet.id;
            const Art = petArt(pet.kindId);
            // A rarer companion is lit more brightly, and the one you have
            // actually chosen is the only one whose ring drifts on its own.
            return (
              <li key={pet.id}>
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

                {/* The lore is a reveal, not a label: it exists only once the
                    egg is open, which is the whole of why an egg is worth having. */}
                {pet.loreSeenAt ? (
                  <p className="pet-lore">{view.kind.lore}</p>
                ) : (
                  <SecondaryAction onClick={() => onSeeLore(pet.id)}>Read who this is</SecondaryAction>
                )}

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
          })}
        </ul>
      )}

      <Odds luck={sheet.stats.luck} pity={avatar.pity ?? 0} />

      <div className="row">
        <button type="button" className="primary" disabled={avatar.coins < EGG_PRICE} onClick={onHatch}>
          {avatar.coins < EGG_PRICE
            ? `${EGG_PRICE - avatar.coins} more coins for an egg`
            : `Hatch an egg · ${EGG_PRICE} coins`}
        </button>
        <SecondaryAction onClick={onAdventure}>{cost.shortBy > 0
            ? `${cost.shortBy} more energy`
            : `Adventure · ${cost.energy} energy, ${cost.hours}h`}</SecondaryAction>
      </div>
      <p className="section-sub">
        A kind you already have does not queue a second — it folds into the
        one you have, the same way a duplicate item refines rather than stacks.
      </p>
    </section>
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
                  ? `Lv ${place.unlockLevel}`
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
 * The room, which furnishes itself.
 *
 * ## What came out, and why
 *
 * Twelve controls: four slots, each with a Bare chip and two pieces, plus copy
 * explaining that rearranging it changed what you both saw. Eight pieces
 * exist. A configuration screen for four either-or decisions is a lot of
 * surface for a question nobody was really asking, and the answer was almost
 * always "the better one" — so that is what it does now. Buying a piece places
 * it; see `refurnishHouse`.
 *
 * ## What auto-placement can decide
 *
 * *Which* piece stands in each slot, and never *where*. Every drawing in
 * `art/house/` uses absolute coordinates in this one shared 100×100 space —
 * the rainy window is at x=58, y=18 and can be nowhere else — so position is
 * not a thing there is a choice about. Making it one would mean rewriting all
 * eight to be position-agnostic inside a `<g transform>`.
 *
 * ## What is still shown
 *
 * The room, and a line naming what is in it with the empty slots said plainly.
 * A room that changed on its own with no account of why would be worse than
 * the chips were: the point of losing the controls is not losing the
 * information.
 */
function Birbhouse({ house, avatar }: {
  house: House;
  avatar: Avatar;
}) {
  const { theme } = useTheme();
  const mascot = getMascot(theme.id);
  const placed = normalizeHouse(house);
  const bare = HOUSE_SLOTS.filter((slot) => !placed[slot]);

  return (
    <section className="panel">
      <h2 className="section-title">Birbhouse</h2>
      <p className="section-sub">
        Yours together. It furnishes itself from what the two of you own — buy a
        better piece and it moves in.
      </p>

      <div className="house" role="img" aria-label="The birbhouse">
        <svg viewBox="0 0 100 100" aria-hidden="true" className="house-scene">
          <rect x="4" y="8" width="92" height="80" rx="6" fill="var(--color-surface-muted)" />
          <path d="M4 76h92" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.5" />
          {/* The whole room, then the bird on top of it. Nothing is drawn in
              front of the character — see the note on HOUSE_SLOTS. */}
          {HOUSE_SLOTS.map((slot) => {
            const Art = houseArt(placed[slot]);
            return Art ? <Art key={slot} /> : null;
          })}
        </svg>
        {/* Over the room rather than inside its SVG, at the box the old
            `translate(28 40) scale(0.44)` gave it: the mascot may be a canvas,
            and a canvas cannot live in an SVG. */}
        <div className="house-birb" style={dyeStyle(avatar.dye) as React.CSSProperties}>
          <mascot.Art mood="content" />
        </div>
      </div>

      {/* An inventory of the room rather than a control for it. Each line is
          the piece that won its slot, so the drawing is never a change nobody
          can account for. */}
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
            ? 'Nothing in it yet. The Shop has the furniture.'
            : `Still bare: ${bare.map((slot) => HOUSE_SLOT_NAMES[slot].toLowerCase()).join(', ')}.`}
        </p>
      ) : null}
    </section>
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

function Shop({ avatar, owned, onBuy }: {
  avatar: Avatar;
  owned: InventoryItem[];
  onBuy: (itemId: string) => void;
}) {
  return (
    <section className="panel">
      <h2 className="section-title">Shop</h2>
      <p className="section-sub">
        {avatar.coins} coins. A second purchase of something already owned
        refines it instead of sitting unworn.
      </p>

      <ul className="shop-grid">
        {GEAR.map((item: GearItem) => {
          const itemOwned = findOwned(owned, item.id);
          const price = itemOwned ? refinePrice(item.rarity, itemOwned.refine) : GEAR_PRICE[item.rarity];
          const atCap = itemOwned !== undefined && itemOwned.refine >= REFINE_MAX;
          const afford = avatar.coins >= price;
          const Art = gearArt(item.id);
          return (
            <li key={item.id} className="shop-item">
              <button
                type="button"
                className="shop-item-button"
                data-tier={item.rarity}
                disabled={!afford || atCap}
                title={item.blurb}
                onClick={() => onBuy(item.id)}
              >
                {Art ? <span className="shop-item-art"><Art /></span> : null}
                <span className="shop-item-name">
                  {item.name}{itemOwned && itemOwned.refine > 0 ? ` +${itemOwned.refine}` : ''}
                </span>
                <span className="shop-item-rarity">{RARITY_NAMES[item.rarity]}</span>
                <span className="shop-item-price">
                  {atCap ? 'Fully refined' : itemOwned ? `Refine · ${price}` : `${price} coins`}
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

/**
 * Furniture, sold here and moved in on its own — see `Birbhouse`.
 *
 * Its own section rather than more rows in the gear grid, because a rug has no
 * rarity, no stat bonus and no refine level — the three things every column of
 * that grid is showing. Putting it there would have meant either four empty
 * cells per row or four meaningless ones.
 */
function Decor({ avatar, owned, onBuy }: {
  avatar: Avatar;
  owned: InventoryItem[];
  onBuy: (itemId: string) => void;
}) {
  return (
    <section className="panel">
      <h2 className="section-title">For the birbhouse</h2>
      <p className="section-sub">
        Bought with your coins, into a room you both see. It moves in by itself; the Birb tab shows the room.
      </p>

      <ul className="decor-list">
        {FURNITURE.map((item) => {
          const isOwned = ownsItem(owned, item.id);
          const afford = avatar.coins >= item.price;
          const Art = houseArt(item.id);
          return (
            <li className="decor" key={item.id}>
              {/* The same fragment the room draws, shown in its own 100×100
                  window so a piece positioned for the far wall is still
                  visible in a list row. */}
              <span className="decor-art" aria-hidden="true">
                <svg viewBox="0 0 100 100">{Art ? <Art /> : null}</svg>
              </span>
              <span className="decor-body">
                <span className="decor-name">{item.name}</span>
                <span className="decor-blurb">{item.blurb}</span>
              </span>
              <button
                type="button"
                className="decor-buy"
                disabled={isOwned || !afford}
                onClick={() => onBuy(item.id)}
                aria-label={isOwned ? `${item.name}, already owned` : `Buy ${item.name} for ${item.price} coins`}
              >
                {isOwned ? 'Owned' : item.price}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
