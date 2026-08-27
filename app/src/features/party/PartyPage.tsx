import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import {
  ensureIdentity,
  getOrCreateAvatar,
  equipItem,
  hatchPet,
  markLoreSeen,
  setCompanion,
  spendMp,
  spendPetMp,
  startAdventure,
  unequipSlot,
} from '../../db/repository';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import { RARITY_NAMES, canEquip, gearBonus, gearForSlot, type Rarity } from '../../domain/rpg/gear';
import { adventureCost } from '../../domain/rpg/stage';
import { petKindById, petSheet, type PetInstance } from '../../domain/rpg/pets';
import { SKILLS, castBlockedBecause, skillById } from '../../domain/rpg/skills';
import { hpFraction, resolveBlow, victoryDropBonus, waitingOn, type BossState } from '../../domain/rpg/boss';
import { GEAR_SLOTS, type Avatar, type GearSlot } from '../../domain/rpg/types';
import { BorderGlow } from '../../components/BorderGlow';

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
 * The party: who is walking with you, what you are wearing, and the one fight
 * where health exists at all.
 *
 * The boss panel is the only screen in the app that cannot render from
 * IndexedDB, because boss HP is contested state — see `worker/src/boss.ts`. It
 * says so plainly when there is no Worker configured rather than showing a bar
 * that is quietly a lie.
 */
export function PartyPage() {
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

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4200);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Party</h1>
        <p className="page-sub">
          <Link className="sheet-party" to="/tasks">← Tasks</Link>
        </p>
      </header>

      {avatar && identity ? (
        <>
          <Companions
            avatar={avatar}
            pets={pets ?? []}
            onChoose={(petId) => setCompanion(identity.memberId, identity.coupleId, petId)}
            onSeeLore={(petId) => markLoreSeen(petId)}
            onHatch={async () => {
              const level = levelOf(avatar);
              const luck = sheetFor(avatar, gearBonus(avatar.gear, level)).stats.luck;
              const pet = await hatchPet(
                identity.coupleId,
                identity.memberId,
                { rarity: Math.random(), species: Math.random() },
                luck,
              );
              setMessage(`${petKindById(pet.kindId)!.name} hatched.`);
            }}
            onAdventure={async () => {
              const result = await startAdventure(identity.memberId, identity.coupleId);
              setMessage(result.ok ? `Gone for ${result.hours} hours.` : result.reason ?? null);
            }}
          />

          <Wardrobe
            avatar={avatar}
            onEquip={async (itemId) => {
              const result = await equipItem(identity.memberId, identity.coupleId, itemId);
              if (!result.ok) setMessage(result.reason ?? null);
            }}
            onUnequip={(slot) => unequipSlot(identity.memberId, identity.coupleId, slot)}
          />

          <Boss
            avatar={avatar}
            pets={pets ?? []}
            workerUrl={settings?.workerUrl}
            token={settings?.workerSecret}
            onSpendMp={(amount) => spendMp(identity.memberId, identity.coupleId, amount)}
            onSpendPetMp={spendPetMp}
            onMessage={setMessage}
          />
        </>
      ) : null}

      {message ? <div className="receipt" role="status">{message}</div> : null}
    </div>
  );
}

function Companions({ avatar, pets, onChoose, onSeeLore, onHatch, onAdventure }: {
  avatar: Avatar;
  pets: PetInstance[];
  onChoose: (petId: string | undefined) => void;
  onSeeLore: (petId: string) => void;
  onHatch: () => void;
  onAdventure: () => void;
}) {
  const level = levelOf(avatar);
  const sheet = sheetFor(avatar, gearBonus(avatar.gear, level));
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
        <button type="button" className="primary" onClick={onHatch}>Hatch an egg</button>
        <button type="button" className="quiet" onClick={onAdventure}>
          {cost.shortBy > 0
            ? `${cost.shortBy} more energy`
            : `Adventure · ${cost.energy} energy, ${cost.hours}h`}
        </button>
      </div>
    </section>
  );
}

function Wardrobe({ avatar, onEquip, onUnequip }: {
  avatar: Avatar;
  onEquip: (itemId: string) => void;
  onUnequip: (slot: GearSlot) => void;
}) {
  const level = levelOf(avatar);
  const bonus = gearBonus(avatar.gear, level);

  return (
    <section className="panel">
      <h2 className="section-title">Worn</h2>
      <p className="section-sub">
        Four slots. Levelling is flat so nobody can build themselves out of a
        boss; this is where a choice lives, and it comes off in one tap.
      </p>

      {GEAR_SLOTS.map((slot) => (
        <div key={slot} className="slot">
          <div className="slot-name">{slot}</div>
          <div className="chips">
            {gearForSlot(slot).map((item) => {
              const worn = avatar.gear[slot] === item.id;
              const allowed = canEquip(item, level);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${worn ? 'chip-on' : ''} ${allowed ? '' : 'chip-locked'}`}
                  title={allowed ? item.blurb : `From level ${item.minLevel}`}
                  onClick={() => (worn ? onUnequip(slot) : onEquip(item.id))}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="section-sub">
        Worn: +{bonus.strength ?? 0} strength · +{bonus.insight ?? 0} insight ·
        +{bonus.heart ?? 0} heart · +{bonus.luck ?? 0} luck
      </p>
    </section>
  );
}

function Boss({ avatar, pets, workerUrl, token, onSpendMp, onSpendPetMp, onMessage }: {
  avatar: Avatar;
  pets: PetInstance[];
  workerUrl?: string;
  token?: string;
  onSpendMp: (amount: number) => Promise<boolean>;
  onSpendPetMp: (petId: string, amount: number) => Promise<boolean>;
  onMessage: (text: string) => void;
}) {
  const [boss, setBoss] = useState<BossPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const level = levelOf(avatar);
  const sheet = sheetFor(avatar, gearBonus(avatar.gear, level));

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
          onMessage(
            `Down. Drops run ${Math.round(victoryDropBonus(next.tier) * 100)}% richer now.`,
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
