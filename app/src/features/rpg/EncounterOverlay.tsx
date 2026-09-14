import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  act, beginEncounter, enemyMove, hpFractionOf, type CombatAction, type EncounterState,
  type Party,
} from '../../domain/rpg/encounter';
import { enemyById } from '../../domain/rpg/enemies';
import { castBlockedBecause, unlockedSkills } from '../../domain/rpg/skills';
import { hash } from '../../domain/hash';
import type { PartyRead, VictoryReceipt } from '../../db/repository';
import { settleVictory, spendMp } from '../../db/repository';
import type { DayKey, MemberId } from '../../domain/types';

/**
 * The fight, as a panel over the still world.
 *
 * There is no combat logic in this file, and that is the payoff for `act` being
 * a pure `(state, action) => state`: the component renders two bars, some
 * buttons and a log, and every rule lives in `domain/rpg/encounter.ts` where a
 * test can reach it. The world stays visible behind this rather than a scene
 * transition, which is lighter and keeps the garden present while you fight in
 * it.
 */

export interface EncounterOverlayProps {
  enemyId: string;
  party: PartyRead;
  memberId: MemberId;
  coupleId: string;
  day: DayKey;
  /** Told what happened, so the page can settle and un-pause the world. */
  onClose(outcome: EncounterState['outcome'], receipt: VictoryReceipt | null): void;
}

export function EncounterOverlay({
  enemyId, party, memberId, coupleId, day, onClose,
}: EncounterOverlayProps) {
  const enemy = enemyById(enemyId);
  const [mp, setMp] = useState(party.mp);
  const [receipt, setReceipt] = useState<VictoryReceipt | null>(null);
  // Guards the settle against a re-render, independently of the fact that
  // `settleVictory` is already idempotent. Belt and braces, cheaply.
  const settled = useRef(false);

  const fighter: Party = useMemo(
    () => ({ stats: party.stats, level: party.level, mp, petEffect: party.petEffect }),
    [party.stats, party.level, party.petEffect, mp],
  );

  /**
   * One reducer, one state.
   *
   * `'their-turn'` is a step the component asks for on a timer rather than an
   * action the player can pick, which is why it is not in `CombatAction`. Both
   * branches are total and both refuse when it is not that side's turn, so a
   * stray dispatch costs nothing.
   */
  type Step = CombatAction | { kind: 'their-turn' };

  const [state, dispatch] = useReducer(
    (current: EncounterState, step: Step) => {
      if (!enemy) return current;
      return step.kind === 'their-turn'
        ? enemyMove(current, enemy)
        : act(current, step, enemy, fighter);
    },
    undefined,
    () => (enemy
      ? beginEncounter(enemy, { stats: party.stats, level: party.level, mp: party.mp },
        party.vigour, hash(`${enemyId}:${day}:${memberId}`))
      : null as unknown as EncounterState),
  );

  // The enemy answers on its own beat, so a round reads as an exchange rather
  // than both halves landing in one frame.
  useEffect(() => {
    if (!enemy || !state || state.outcome !== 'fighting' || state.turn !== 'them') return undefined;
    const timer = setTimeout(() => dispatch({ kind: 'their-turn' }), 420);
    return () => clearTimeout(timer);
  }, [enemy, state]);

  const shown = state;

  useEffect(() => {
    if (!shown || shown.outcome === 'fighting' || settled.current) return;
    settled.current = true;
    if (shown.outcome === 'won') {
      settleVictory(memberId, coupleId, enemyId, day).then(setReceipt).catch(() => setReceipt(null));
    }
  }, [shown, memberId, coupleId, enemyId, day]);

  if (!enemy || !shown) return null;

  const skills = unlockedSkills(party.level);

  async function cast(skillId: string) {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    // MP is a repository write, so it is spent here and the reducer is only told
    // what is left. `act` refuses a cast the party cannot afford either way.
    const paid = await spendMp(memberId, coupleId, skill.mpCost);
    if (!paid) return;
    setMp((current) => Math.max(0, current - skill.mpCost));
    dispatch({ kind: 'skill', skillId });
  }

  const over = shown.outcome !== 'fighting';

  return (
    <div className="encounter" role="dialog" aria-modal="true" aria-label={enemy.name}>
      <div className="encounter-card">
        <header className="encounter-head">
          <h2>{enemy.name}</h2>
          <p className="encounter-blurb">{enemy.blurb}</p>
        </header>

        {/* The vigour line. An absence, never an accusation — see vigour.ts. */}
        <p className={party.vigour.plain ? 'encounter-vigour is-plain' : 'encounter-vigour'}>
          {party.vigour.note}
        </p>

        <div className="encounter-bars">
          <Bar label={enemy.name} who={shown.them} tone="them" />
          <Bar label="You" who={shown.you} tone="you" />
        </div>

        <ul className="encounter-log">
          {shown.log.slice(-5).map((line, i) => (
            <li key={`${line.round}-${i}`} className={`is-${line.who}`}>{line.text}</li>
          ))}
        </ul>

        {over ? (
          <div className="encounter-done">
            <p>{outcomeWords(shown.outcome, enemy.name)}</p>
            {receipt && receipt.xp > 0 && (
              <p className="encounter-receipt">
                +{receipt.xp} XP for the bird
                {receipt.coins > 0 ? `, and ${receipt.coins} coins for a first win.` : '.'}
              </p>
            )}
            <button type="button" onClick={() => onClose(shown.outcome, receipt)}>
              Back to the garden
            </button>
          </div>
        ) : (
          <div className="encounter-actions">
            <button
              type="button"
              disabled={shown.turn !== 'you'}
              onClick={() => dispatch({ kind: 'hit' })}
            >
              Hit
            </button>
            {skills.map((skill) => {
              const blocked = castBlockedBecause(skill, party.level, mp);
              return (
                <button
                  key={skill.id}
                  type="button"
                  disabled={shown.turn !== 'you' || blocked !== null}
                  title={blocked ?? skill.blurb}
                  onClick={() => void cast(skill.id)}
                >
                  {skill.name}
                </button>
              );
            })}
            <button
              type="button"
              disabled={shown.turn !== 'you'}
              onClick={() => dispatch({ kind: 'flee' })}
            >
              Walk away
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Bar({ label, who, tone }: {
  label: string;
  who: EncounterState['you'];
  tone: 'you' | 'them';
}) {
  return (
    <div className={`encounter-bar is-${tone}`}>
      <span className="encounter-bar-label">{label}</span>
      <span className="encounter-bar-track">
        <span
          className="encounter-bar-fill"
          style={{ width: `${Math.round(hpFractionOf(who) * 100)}%` }}
        />
      </span>
      <span className="encounter-bar-count">
        {who.hp}/{who.maxHp}{who.shield > 0 ? ` +${who.shield}` : ''}
      </span>
    </div>
  );
}

function outcomeWords(outcome: EncounterState['outcome'], name: string): string {
  if (outcome === 'won') return `${name} gives it up.`;
  // Never "you lost". Nothing was lost — see the ruling in encounter.ts.
  if (outcome === 'down') return 'You sit down for a minute. Nothing is lost but the walk back.';
  if (outcome === 'fled') return 'You back away, and it lets you.';
  return '';
}
