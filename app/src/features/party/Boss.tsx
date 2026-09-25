import { useCallback, useEffect, useState } from 'react';
import { awardBossVictory, bossVictoryXp } from '../../db/repository';
import { flushPetXp } from '../../pwa/petSync';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import { petSheet, type PetInstance } from '../../domain/rpg/pets';
import { SKILLS, castBlockedBecause, skillById } from '../../domain/rpg/skills';
import {
  hpFraction, resolveBlow, victoryDropBonus, waitingOn, type BossState,
} from '../../domain/rpg/boss';
import type { Avatar } from '../../domain/rpg/types';
import { refineByItemId, type InventoryItem } from '../../domain/rpg/inventory';
import { gearBonusWithRefinement } from '../../domain/rpg/shop';
import { PrimaryAction } from '../../ui/PrimaryAction';

/**
 * The one fight where health exists at all.
 *
 * ## Why this is the only screen that cannot render from the phone
 *
 * Boss HP is **contested state**. Everything else in HeartBeat renders from
 * IndexedDB and syncs last-write-wins, which is right for a record of what one
 * person did and wrong for a number two people are subtracting from at the
 * same time: one of their hits would silently vanish. So HP lives in D1 and
 * damage lands as an atomic `UPDATE` — see `worker/src/boss.ts`.
 *
 * That makes this the only panel in `features/party/` that holds a `fetch`,
 * and it says so plainly when no Worker is configured rather than showing a
 * bar that is quietly a lie.
 *
 * ## Why it is its own file
 *
 * It was module-private inside `PartyPage.tsx` (now `shop/ShopPage.tsx`) and came out when the raid got
 * a section of its own. Nothing about it was shared with the page: it takes
 * what it needs as props, and the two `onSpend*` callbacks are there precisely
 * so the fetching panel still writes through the repository like everything
 * else.
 */

/** What `worker/src/boss.ts` returns. Its shape is the wire format. */
interface BossPayload {
  tier: number;
  hp: number;
  maxHp: number;
  state: BossState;
  readyA: boolean;
  readyB: boolean;
  youAreReady: boolean;
}

export function Boss({ avatar, pets, owned, workerUrl, token, onSpendMp, onSpendPetMp, onMessage }: {
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
              <PrimaryAction disabled={busy} onClick={() => attack()}>Hit it for {resolveBlow(sheet.stats).damage}</PrimaryAction>
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
