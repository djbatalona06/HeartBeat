import type { ActionDto, BattleDto, Element, MonsterDto } from './engine/types';

/**
 * The action bar, which is also the log.
 *
 * This is the whole argument of Eve's Garden in one component. Every button is
 * a wellness activity *and* a combat move: "Log Exercise" writes an exercise
 * row and swings at the monster, in that order, with one tap. There is no
 * Attack button that is only a button.
 *
 * Which is why the effectiveness hint matters. A player who can see that
 * Morning Meadow's monsters flinch at movement has been told something true
 * about the island and something true about their week at the same time.
 *
 * Locked actions are rendered rather than hidden: the level curve is a promise
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
  onAct(action: ActionDto): void;
  onFlee(): void;
}

/** Mirrors `Battle.Effectiveness` in C#, for the hint only — never for damage. */
function effectivenessOf(element: Element, monster: MonsterDto | null): 'weak' | 'plain' | 'strong' {
  if (!monster) return 'plain';
  if (element === monster.weakness) return 'strong';
  if (element === monster.strength) return 'weak';
  return 'plain';
}

export function ActionBar({
  actions, allActions, battle, monster, level, busy, onAct, onFlee,
}: ActionBarProps) {
  const fighting = battle?.outcome === 'Fighting';
  const yourTurn = fighting && battle?.turn === 'Player';
  const unlocked = new Set(actions.map((a) => a.id));
  const locked = allActions.filter((a) => !unlocked.has(a.id)).slice(0, 2);

  return (
    <div className="garden-actions">
      <ul className="garden-action-list">
        {actions.map((action) => {
          const edge = effectivenessOf(action.element, monster);
          return (
            <li key={action.id}>
              <button
                type="button"
                className={`garden-action is-${edge}`}
                // Outside a fight these still log. Disabling them between turns
                // would make the garden a worse tracker than the mood page.
                disabled={busy || (fighting && !yourTurn)}
                onClick={() => onAct(action)}
              >
                <span className="garden-action-name">{action.name}</span>
                <span className="garden-action-note">
                  {action.xp > 0 ? `+${action.xp} XP` : 'Together'}
                  {fighting && edge === 'strong' ? ' · it feels this' : ''}
                  {fighting && edge === 'weak' ? ' · it shrugs this off' : ''}
                </span>
              </button>
            </li>
          );
        })}

        {locked.map((action) => (
          <li key={action.id}>
            <button type="button" className="garden-action is-locked" disabled>
              <span className="garden-action-name">{action.name}</span>
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
        {fighting
          ? yourTurn
            ? 'Your move. Everything here logs as well as lands.'
            : 'Waiting on them.'
          : `Level ${level}. Walk into something to start a fight — every button still logs.`}
      </p>
    </div>
  );
}
