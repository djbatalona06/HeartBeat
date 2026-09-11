import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import {
  awardBossVictory,
  bossVictoryXp,
  buyDye,
  buyEgg,
  buyFurniture,
  buyGear,
  ensureIdentity,
  placeFurniture,
  getOrCreateAvatar,
  equipItem,
  markLoreSeen,
  setCompanion,
  spendMp,
  spendPetMp,
  startAdventure,
  unequipSlot,
  wearDye,
} from '../../db/repository';
import { flushPetXp } from '../../pwa/petSync';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import { GEAR, RARITY_NAMES, canEquip, gearForSlot, type GearItem, type Rarity } from '../../domain/rpg/gear';
import { adventureCost } from '../../domain/rpg/stage';
import { petKindById, petSheet, type PetInstance } from '../../domain/rpg/pets';
import { SKILLS, castBlockedBecause, skillById } from '../../domain/rpg/skills';
import { hpFraction, resolveBlow, victoryDropBonus, waitingOn, type BossState } from '../../domain/rpg/boss';
import { GEAR_SLOTS, type Avatar, type GearSlot } from '../../domain/rpg/types';
import { findOwned, ownsItem, refineByItemId, type InventoryItem } from '../../domain/rpg/inventory';
import { EGG_PRICE, GEAR_PRICE, REFINE_MAX, gearBonusWithRefinement, refinePrice } from '../../domain/rpg/shop';
import { DEFAULT_DYE_ID, DYES, dyeStyle } from '../../domain/rpg/dyes';
import {
  FURNITURE,
  HOUSE_SLOTS,
  HOUSE_SLOT_NAMES,
  furnitureForSlot,
  normalizeHouse,
  type House,
  type HouseSlot,
} from '../../domain/rpg/furniture';
import { houseArt } from './art/house';
import { PLACES, canTravel, nextPlace, travelCost } from '../../domain/rpg/locations';
import { useTheme } from '../../themes/ThemeProvider';
import { getMascot } from '../pet/mascots';
import { BorderGlow } from '../../components/BorderGlow';
import { AchievementShelf } from '../achievements/AchievementShelf';
import { gearArt } from './art/gear';
import { petArt } from './art/pets';

/**
 * How brightly a companion's card is lit, by how rare it is.
 *
 * Gold is reserved for godly and appears nowhere else in the theme, so a godly
 * drop is recognisable across the room without a badge saying so.
 */
const RARITY_GLOW: Record<Rarity, string[]> = {
  common: ['var(--color-border)', 'var(--color-surface-muted)', 'var(--color-border)'],
  rare: ['var(--color-accent)', 'var(--color-border)', 'var(--color-accent)'],
  epic: ['var(--color-accent)', '#f5c85c', 'var(--color-accent)'],
  godly: ['#f5c85c', 'var(--color-accent)', '#f5c85c'],
};

const RARITY_INTENSITY: Record<Rarity, number> = {
  common: 0.4,
  rare: 0.7,
  epic: 1,
  godly: 1.3,
};

interface BossPayload {
  tier: number;
  hp: number;
  maxHp: number;
  state: BossState;
  readyA: boolean;
  readyB: boolean;
  youAreReady: boolean;
}

/**
 * The things this page can show, and the order they read in.
 *
 * The tab bar gives Shop, Bag and Birb a screen each, and all three are
 * sections of this page — so they are selected here rather than copied into
 * three new files. Nothing forks: the identity effect, the three live queries
 * and the receipt are written once and every route gets the same ones, which
 * is what stops "the shop" behaving differently depending on how you reached
 * it. `/party` passes nothing and still shows all of them.
 */
export type PartySection =
  'companions' | 'worn' | 'colours' | 'house' | 'adventures' | 'shop' | 'boss' | 'achievements';

export const ALL_SECTIONS: readonly PartySection[] =
  ['companions', 'worn', 'colours', 'house', 'adventures', 'shop', 'boss', 'achievements'];

/**
 * The party: who is walking with you, what you are wearing, and the one fight
 * where health exists at all.
 *
 * The boss panel is the only screen in the app that cannot render from
 * IndexedDB, because boss HP is contested state — see `worker/src/boss.ts`. It
 * says so plainly when there is no Worker configured rather than showing a bar
 * that is quietly a lie.
 */
export function PartyPage({ only = ALL_SECTIONS, title = 'Party' }: {
  only?: readonly PartySection[];
  title?: string;
}) {
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4200);
    return () => clearTimeout(timer);
  }, [message]);

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
              if (!result.ok) { setMessage(result.reason ?? null); return; }
              const name = petKindById(result.pet!.kindId)!.name;
              setMessage(result.merged ? `Another ${name}. Two of the same found each other.` : `${name} hatched.`);
            }}
            onAdventure={async () => {
              const result = await startAdventure(identity.memberId, identity.coupleId);
              setMessage(result.ok ? `Gone for ${result.hours} hours.` : result.reason ?? null);
            }}
          />
          ) : null}

          {only.includes('worn') ? (
          <Worn
            avatar={avatar}
            owned={owned ?? []}
            onEquip={async (itemId) => {
              const result = await equipItem(identity.memberId, identity.coupleId, itemId);
              if (!result.ok) setMessage(result.reason ?? null);
            }}
            onUnequip={(slot) => unequipSlot(identity.memberId, identity.coupleId, slot)}
            /* Worn no longer carries the shop with it, so it can no longer send
               you "below" to a panel that is on another tab now. */
            shopIsHere={only.includes('shop')}
          />
          ) : null}

          {only.includes('colours') ? (
          <Colours
            avatar={avatar}
            owned={owned ?? []}
            onBuy={async (dyeId) => {
              const result = await buyDye(identity.memberId, identity.coupleId, dyeId);
              setMessage(result.ok ? 'Bought. Tap it again to put it on.' : result.reason ?? null);
            }}
            onWear={async (dyeId) => {
              const result = await wearDye(identity.memberId, identity.coupleId, dyeId);
              if (!result.ok) setMessage(result.reason ?? null);
            }}
          />
          ) : null}

          {only.includes('adventures') ? (
          <Adventures
            avatar={avatar}
            owned={owned ?? []}
            onGo={async (placeId) => {
              // The roll is drawn here and handed in, so the repository and the
              // domain both stay deterministic given their inputs.
              const result = await startAdventure(
                identity.memberId, identity.coupleId, placeId, Math.random(),
              );
              if (!result.ok) setMessage(result.reason ?? null);
              else setMessage(
                `${result.place}: came back with ${result.found}.`
                + (result.bounty ? ` +${result.bounty} coins for getting there first.` : ''),
              );
            }}
          />
          ) : null}

          {only.includes('house') ? (
          <Birbhouse
            house={(pet?.house ?? {}) as House}
            owned={owned ?? []}
            avatar={avatar}
            onPlace={async (slot, itemId) => {
              const result = await placeFurniture(identity.memberId, identity.coupleId, slot, itemId);
              if (!result.ok) setMessage(result.reason ?? null);
            }}
            onClear={async (slot) => {
              const result = await placeFurniture(identity.memberId, identity.coupleId, slot, undefined);
              if (!result.ok) setMessage(result.reason ?? null);
            }}
          />
          ) : null}

          {only.includes('shop') ? (
          <Shop
            avatar={avatar}
            owned={owned ?? []}
            onBuy={async (itemId) => {
              const result = await buyGear(identity.memberId, identity.coupleId, itemId);
              if (!result.ok) setMessage(result.reason ?? null);
              else if (result.refined) setMessage(`Refined to +${result.refined}.`);
            }}
          />
          ) : null}

          {only.includes('shop') ? (
          <Decor
            avatar={avatar}
            owned={owned ?? []}
            onBuy={async (itemId) => {
              const result = await buyFurniture(identity.memberId, identity.coupleId, itemId);
              setMessage(result.ok ? 'Bought. Place it on the Birb tab.' : result.reason ?? null);
            }}
          />
          ) : null}

          {only.includes('boss') ? (
          <Boss
            avatar={avatar}
            pets={pets ?? []}
            owned={owned ?? []}
            workerUrl={settings?.workerUrl}
            token={settings?.workerSecret}
            onSpendMp={(amount) => spendMp(identity.memberId, identity.coupleId, amount)}
            onSpendPetMp={spendPetMp}
            onMessage={setMessage}
          />
          ) : null}

          {/* The shelf has its own tab now, alongside the quests it rhymes
              with. It stays on /party because /party is the everything view. */}
          {only.includes('achievements') ? <AchievementShelf coupleId={identity.coupleId} /> : null}
        </>
      ) : null}

      {message ? <div className="receipt" role="status">{message}</div> : null}
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
                {Art ? <div className="pet-portrait"><Art /></div> : null}
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
                  <button type="button" className="quiet" onClick={() => onSeeLore(pet.id)}>
                    Read who this is
                  </button>
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

      <div className="row">
        <button type="button" className="primary" disabled={avatar.coins < EGG_PRICE} onClick={onHatch}>
          {avatar.coins < EGG_PRICE
            ? `${EGG_PRICE - avatar.coins} more coins for an egg`
            : `Hatch an egg · ${EGG_PRICE} coins`}
        </button>
        <button type="button" className="quiet" onClick={onAdventure}>
          {cost.shortBy > 0
            ? `${cost.shortBy} more energy`
            : `Adventure · ${cost.energy} energy, ${cost.hours}h`}
        </button>
      </div>
      <p className="section-sub">
        A kind you already have does not queue a second — it folds into the
        one you have, the same way a duplicate item refines rather than stacks.
      </p>
    </section>
  );
}

function Worn({ avatar, owned, onEquip, onUnequip, shopIsHere }: {
  avatar: Avatar;
  owned: InventoryItem[];
  onEquip: (itemId: string) => void;
  onUnequip: (slot: GearSlot) => void;
  /** Whether the shop panel is on this screen too, or a tab away. */
  shopIsHere: boolean;
}) {
  const level = levelOf(avatar);
  const refine = refineByItemId(owned);
  const bonus = gearBonusWithRefinement(avatar.gear, level, refine);

  return (
      <section className="panel">
        <h2 className="section-title">Worn</h2>
        <p className="section-sub">
          Five slots. Levelling is flat so nobody can build themselves out of a
          boss; this is where a choice lives, and it comes off in one tap.
        </p>

        {GEAR_SLOTS.map((slot) => {
          const slotOwned = gearForSlot(slot).filter((item) => ownsItem(owned, item.id));
          return (
            <div key={slot} className="slot">
              <div className="slot-name">{slot}</div>
              {slotOwned.length === 0 ? (
                <p className="section-sub">
                  {shopIsHere ? 'Nothing owned yet. See the shop below.' : 'Nothing owned yet — the Shop tab has some.'}
                </p>
              ) : (
                <div className="chips">
                  {slotOwned.map((item) => {
                    const worn = avatar.gear[slot] === item.id;
                    const allowed = canEquip(item, level);
                    const itemRefine = refine[item.id] ?? 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`chip ${worn ? 'chip-on' : ''} ${allowed ? '' : 'chip-locked'}`}
                        title={allowed ? item.blurb : `From level ${item.minLevel}`}
                        onClick={() => (worn ? onUnequip(slot) : onEquip(item.id))}
                      >
                        {item.name}{itemRefine > 0 ? ` +${itemRefine}` : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <p className="section-sub">
          Worn: +{bonus.strength} strength · +{bonus.insight} insight ·
          +{bonus.heart} heart · +{bonus.luck} luck
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
function Birbhouse({ house, owned, avatar, onPlace, onClear }: {
  house: House;
  owned: InventoryItem[];
  avatar: Avatar;
  onPlace: (slot: HouseSlot, itemId: string) => void;
  onClear: (slot: HouseSlot) => void;
}) {
  const { theme } = useTheme();
  const mascot = getMascot(theme.id);
  const placed = normalizeHouse(house);

  return (
    <section className="panel">
      <h2 className="section-title">Birbhouse</h2>
      <p className="section-sub">
        Yours together — rearranging it changes what you both see.
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
          <g transform="translate(28 40) scale(0.44)" style={dyeStyle(avatar.dye) as React.CSSProperties}>
            <mascot.Art mood="content" />
          </g>
        </svg>
      </div>

      {HOUSE_SLOTS.map((slot) => {
        const options = furnitureForSlot(slot);
        return (
          <div className="house-slot" key={slot}>
            <h3 className="house-slot-name">{HOUSE_SLOT_NAMES[slot]}</h3>
            <div className="chips">
              <button
                type="button"
                className={`chip ${placed[slot] ? '' : 'chip-on'}`}
                aria-pressed={!placed[slot]}
                onClick={() => onClear(slot)}
              >
                Bare
              </button>
              {options.map((item) => {
                const isOwned = ownsItem(owned, item.id);
                const isPlaced = placed[slot] === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`chip ${isPlaced ? 'chip-on' : ''} ${isOwned ? '' : 'chip-locked'}`}
                    aria-pressed={isPlaced}
                    title={isOwned ? item.blurb : `${item.blurb} — ${item.price} coins in the Shop.`}
                    onClick={() => (isOwned ? onPlace(slot, item.id) : undefined)}
                    disabled={!isOwned}
                  >
                    {item.name}{isOwned ? '' : ` · ${item.price}`}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
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
 * Furniture, sold here and placed on the Birb tab.
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
        Bought with your coins, into a room you both see. Place them on the Birb tab.
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

function Boss({ avatar, pets, owned, workerUrl, token, onSpendMp, onSpendPetMp, onMessage }: {
  avatar: Avatar;
  pets: PetInstance[];
  owned: InventoryItem[];
  workerUrl?: string;
  token?: string;
  onSpendMp: (amount: number) => Promise<boolean>;
  onSpendPetMp: (petId: string, amount: number) => Promise<boolean>;
  onMessage: (text: string) => void;
}) {
  const [boss, setBoss] = useState<BossPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const level = levelOf(avatar);
  const sheet = sheetFor(avatar, gearBonusWithRefinement(avatar.gear, level, refineByItemId(owned)));

  const call = useCallback(async (path: string, body?: unknown): Promise<BossPayload | null> => {
    if (!workerUrl || !token) return null;
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { boss?: BossPayload };
    return payload.boss ?? null;
  }, [workerUrl, token]);

  useEffect(() => {
    let live = true;
    call('/boss').then((next) => { if (live && next) setBoss(next); }).catch(() => {});
    return () => { live = false; };
  }, [call]);

  if (!workerUrl || !token) {
    return (
      <section className="panel">
        <h2 className="section-title">The boss</h2>
        <p className="section-sub">
          This is the one screen that cannot render from the phone. Boss HP is
          contested state — two phones subtracting under last-write-wins would
          discard one of your hits — so it lives on the Worker. Pair a Worker in
          Settings and it appears here.
        </p>
      </section>
    );
  }

  const companion = pets.find((p) => p.id === avatar.companionId);
  const companionView = companion ? petSheet(companion) : null;

  async function attack(skillId?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const effects = [];
      const skill = skillId ? skillById(skillId) : undefined;
      if (skill) {
        const blocked = castBlockedBecause(skill, level, sheet.mp);
        if (blocked) { onMessage(blocked); return; }
        if (!(await onSpendMp(skill.mpCost))) { onMessage(`${skill.name} needs more MP.`); return; }
        effects.push(skill.effect);
      }
      // The companion joins in whenever its own bar can pay for it.
      if (companion && companionView?.skillReady) {
        if (await onSpendPetMp(companion.id, companionView.kind.skill.mpCost)) {
          effects.push(companionView.kind.skill.effect);
        }
      }

      const blow = resolveBlow(sheet.stats, effects);
      const next = await call('/boss/attack', { damage: blow.damage });
      if (next) {
        setBoss(next);
        if (next.state === 'won') {
          // Both of you were in it, so the shared pet is what it pays. The
          // award is keyed on the tier, so the other phone reporting the same
          // victory is the same award rather than a second one; the flush is
          // best-effort because the award is already queued in IndexedDB and
          // the next foreground will carry it.
          const gained = bossVictoryXp(next.tier);
          await awardBossVictory(avatar.coupleId, next.tier);
          void flushPetXp().catch(() => {});
          onMessage(
            `Down. +${gained} XP to the pet, and drops run `
            + `${Math.round(victoryDropBonus(next.tier) * 100)}% richer now.`,
          );
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="section-title">The boss</h2>

      {!boss ? (
        <p className="section-sub">Asking the Worker…</p>
      ) : (
        <>
          <p className="section-sub">Tier {boss.tier}</p>
          <div className="bar bar-boss">
            <div
              className="bar-fill bar-fill-danger"
              style={{ width: `${hpFraction(boss) * 100}%` }}
            />
          </div>
          <p className="task-line">{boss.hp} / {boss.maxHp}</p>

          {boss.state === 'gathering' ? (
            <>
              <p className="section-sub">
                {waitingOn(boss) ?? 'Both of you are in.'}
              </p>
              <button
                type="button"
                className="primary"
                disabled={busy || boss.youAreReady}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const next = await call('/boss/ready', {});
                    if (next) setBoss(next);
                  } finally { setBusy(false); }
                }}
              >
                {boss.youAreReady ? 'You are ready' : 'Ready'}
              </button>
            </>
          ) : null}

          {boss.state === 'fighting' ? (
            <>
              <button type="button" className="primary" disabled={busy} onClick={() => attack()}>
                Hit it for {resolveBlow(sheet.stats).damage}
              </button>
              <div className="chips">
                {SKILLS.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    className={`chip ${castBlockedBecause(skill, level, sheet.mp) ? 'chip-locked' : ''}`}
                    title={castBlockedBecause(skill, level, sheet.mp) ?? skill.blurb}
                    disabled={busy}
                    onClick={() => attack(skill.id)}
                  >
                    {skill.name} · {skill.mpCost}
                  </button>
                ))}
              </div>
              {companionView ? (
                <p className="task-line">
                  {companionView.skillReady
                    ? `${companionView.kind.name} joins with ${companionView.kind.skill.name}.`
                    : companionView.skillBlockedBecause}
                </p>
              ) : null}
            </>
          ) : null}

          {boss.state === 'won' || boss.state === 'lost' ? (
            <>
              <p className="section-sub">
                {boss.state === 'won'
                  ? 'Cleared. The next one is a quarter bigger.'
                  : 'Not this time. The same tier is still there.'}
              </p>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const next = await call('/boss/ready', {});
                    if (next) setBoss(next);
                  } finally { setBusy(false); }
                }}
              >
                Line up the next one
              </button>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
