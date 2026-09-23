import { bossOf, faceOf, islandView, type StageView } from '../../../domain/rpg/islands';
import { CHARGE_COPY, chargeForElement } from '../../../domain/rpg/charges';
import { STAGES_PER_ISLAND } from '../../../domain/rpg/world';
import { PixelSprite } from './PixelSprite';

/**
 * The current island's boss, standing in the arch.
 *
 * The gate used to be five companions and nothing to use them on. This puts
 * the reason to go in right in the middle of it: who is at the top of this
 * island, how much of them there is, what they cannot stand — and the seven
 * stages between here and there, with the semi-boss and the boss marked.
 *
 * Everything is read from `domain/rpg/islands.ts`, a tested mirror of the C#
 * data, because nothing behind the gate may boot the WebAssembly runtime.
 */

export interface GateBossProps {
  island: number;
  /** The stage the couple are standing on, 1-based. */
  stage: number;
  /** How many of this island's stages have fallen. */
  cleared: number;
  dark: boolean;
}

const MARK: Record<StageView['type'], string> = {
  Common: '',
  SemiBoss: 'Semi-boss',
  Elite: 'Elite',
  Boss: 'Boss',
};

export function GateBoss({ island, stage, cleared, dark }: GateBossProps) {
  const view = islandView(island);
  const boss = bossOf(island);
  const face = faceOf(boss, dark);
  const next = view.stages.find((s) => s.number === stage) ?? view.stages[0];
  const nextFace = faceOf(next, dark);
  const answer = CHARGE_COPY[chargeForElement(boss.weakness)];

  return (
    <div className="gate-boss">
      <div className="gate-boss-figure">
        <PixelSprite
          spriteKey={boss.spriteKey}
          label={face.name}
          className="gate-boss-sprite"
          dark={dark}
        />
      </div>

      <div className="gate-boss-card">
        <p className="gate-boss-island">
          Island {island} · {dark ? view.darkName : view.lightName}
        </p>
        <h2 className="gate-boss-name">{face.name}</h2>
        <p className="gate-boss-stats">
          <span>{face.hp} HP</span>
          <span>Weak to {boss.weakness.toLowerCase()}</span>
          <span>Shrugs off {boss.strength.toLowerCase()}</span>
        </p>
        <p className="gate-boss-hint">
          Log {answer.nudge} today and every hit on this island lands harder.
        </p>

        <ol className="gate-stages" aria-label={`${STAGES_PER_ISLAND} stages`}>
          {view.stages.map((s) => {
            const state = s.number <= cleared ? 'done' : s.number === stage ? 'here' : 'ahead';
            const name = faceOf(s, dark).name;
            return (
              <li
                key={s.number}
                className="gate-stage"
                data-state={state}
                data-type={s.type}
                title={`${s.number}. ${s.name} — ${name}`}
              >
                <span className="gate-stage-dot" aria-hidden="true">
                  {s.type === 'Boss' ? '★' : s.type === 'SemiBoss' ? '◆' : s.number}
                </span>
                <span className="visually-hidden">
                  Stage {s.number}, {name}{MARK[s.type] ? `, ${MARK[s.type].toLowerCase()}` : ''}
                  {state === 'done' ? ', cleared' : state === 'here' ? ', next' : ''}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="gate-boss-next">
          {cleared >= STAGES_PER_ISLAND
            ? 'Island cleared. The boss will fight you again if you ask.'
            : `Next: ${nextFace.name}, stage ${next.number} of ${STAGES_PER_ISLAND}${MARK[next.type] ? ` · ${MARK[next.type]}` : ''}.`}
        </p>
      </div>
    </div>
  );
}
