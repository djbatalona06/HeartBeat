import type { ActionDto, BattleDto, Charge, MonsterDto, MoveStyle, RaidStatsDto } from './engine/types';
import {
  MOVE_STYLE_NAMES, moveKeyFor, type CompanionKit,
} from '../../domain/rpg/companionSkills';
import {
  CHARGE_COPY, FEEDS, LIFT_FULL, chargeForElement, chargeOnWeakness, moveLift,
} from '../../domain/rpg/charges';

/**
 * The move pad.
 *
 * Every button is one of the companion's moves — Wishbell's Hoofbeat,
 * Foxglove's Foxfire — and pressing it logs nothing. What the couple logged
 * today arrives as charges (drawn beside this in `ChargeMeter`), and each
 * move carries a boost bar saying what those charges and the raid sheet are
 * doing to it, because a bonus nobody can see is a bonus nobody plays towards.
 *
 * Locked moves are rendered rather than hidden: the level curve is a promise
 * about what is coming, and an empty bar makes no promises.
 */

export interface ActionBarProps {
  actions: ActionDto[];
  /** Everything the couple will eventually have, for the locked rows. */
  allActions: ActionDto[];
  battle: BattleDto | null;
  monster: MonsterDto | null;
  level: number;
  busy: boolean;
  kit: CompanionKit;
  charges: readonly Charge[];
  /** The raid sheet's totals, for the gear line on each move. */
  stats: RaidStatsDto;
  onAct(action: ActionDto): void;
  onFlee(): void;
}

/** What to log to hit this monster's weakness, in a sentence. */
function weaknessHint(monster: MonsterDto): string {
  const answer = CHARGE_COPY[chargeForElement(monster.weakness)];
  return `It is weak to ${monster.weakness.toLowerCase()}: log ${answer.nudge} today and it will feel every hit.`;
}

function moveName(action: ActionDto, kit: CompanionKit): string {
  const key = moveKeyFor(action.style);
  return key ? kit.moves[key].name : action.name;
}

function styleName(style: MoveStyle): string {
  const key = moveKeyFor(style);
  return key ? MOVE_STYLE_NAMES[key] : 'Together';
}

export function ActionBar({
  actions, allActions, battle, monster, level, busy, kit, charges, stats, onAct, onFlee,
}: ActionBarProps) {
  const fighting = battle?.outcome === 'Fighting';
  const yourTurn = fighting && battle?.turn === 'Player';
  const unlocked = new Set(actions.map((a) => a.id));
  const locked = allActions.filter((a) => !unlocked.has(a.id)).slice(0, 2);
  const onWeakness = chargeOnWeakness(charges, monster?.weakness);

  return (
    <div className="garden-actions">
      <ul className="garden-action-list">
        {actions.map((action) => {
          const fed = FEEDS[action.style];
          const charged = fed !== undefined && charges.includes(fed);
          const lift = moveLift({
            charges, stats, style: action.style,
            weakness: monster?.weakness, strength: monster?.strength,
          });
          const strong = fighting && action.type === 'Attack' && onWeakness !== undefined;
          return (
            <li key={action.id} className={action.style === 'Together' ? 'is-wide' : undefined}>
              <button
                type="button"
                className={`garden-action is-${action.style.toLowerCase()}${strong ? ' is-strong' : ''}${charged ? ' is-charged' : ''}`}
                // Outside a fight there is nothing to press them at.
                disabled={busy || !yourTurn}
                onClick={() => onAct(action)}
                title={(() => {
                  const key = moveKeyFor(action.style);
                  return key ? kit.moves[key].description : undefined;
                })()}
              >
                <span className="garden-action-name">{moveName(action, kit)}</span>
                <span className="garden-action-note">
                  {styleName(action.style)}
                  {lift > 0 ? ` · +${lift}%` : ''}
                  {strong ? ' · it feels this' : ''}
                </span>
                {/* The boost bar. Full at +LIFT_FULL%; the number above keeps
                    counting past it, the bar does not pretend to. */}
                <span
                  className="garden-action-boost"
                  aria-hidden="true"
                  style={{ '--boost': `${Math.min(100, (lift / LIFT_FULL) * 100)}%` } as React.CSSProperties}
                />
              </button>
            </li>
          );
        })}

        {locked.map((action) => (
          <li key={action.id}>
            <button type="button" className="garden-action is-locked" disabled>
              <span className="garden-action-name">{moveName(action, kit)}</span>
              <span className="garden-action-note">Level {action.unlockLevel}</span>
            </button>
          </li>
        ))}
      </ul>

      {fighting && (
        <button
          type="button"
          className="garden-flee"
          disabled={busy || !yourTurn}
          onClick={onFlee}
        >
          Walk away
        </button>
      )}

      <p className="garden-actions-hint">
        {!fighting
          ? `Level ${level}. Walk into something to start a fight.`
          : !yourTurn
            ? 'Waiting on them.'
            : onWeakness
              ? `Your move. Today's ${CHARGE_COPY[onWeakness].label.toLowerCase()} is on its weakness — every hit lands harder.`
              : monster
                ? `Your move. ${weaknessHint(monster)}`
                : 'Your move.'}
      </p>
    </div>
  );
}
