import { useEffect, useRef } from 'react';
import type { BattleDto, MonsterDto } from './engine/types';

/**
 * What just happened, and what you are fighting.
 *
 * Two panels that share a corner of the garden: the monster's card while a
 * fight is open, and the running log underneath it. Both are read-only — every
 * decision is made in the action bar — so this is the one part of the page with
 * no handlers on it.
 */

export interface BattleLogProps {
  battle: BattleDto | null;
  monster: MonsterDto | null;
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const percent = max <= 0 ? 0 : Math.round(Math.min(1, Math.max(0, value / max)) * 100);
  return (
    <div className={`garden-bar garden-bar-${tone}`}>
      <span className="garden-bar-label">{label}</span>
      <span className="garden-bar-track">
        <span className="garden-bar-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="garden-bar-value">{value}/{max}</span>
    </div>
  );
}

export function BattleLog({ battle, monster }: BattleLogProps) {
  const tail = useRef<HTMLLIElement | null>(null);

  // Keep the newest line in view. `block: 'nearest'` so a fight in a panel does
  // not drag the whole page around underneath the canvas.
  useEffect(() => {
    tail.current?.scrollIntoView({ block: 'nearest' });
  }, [battle?.log.length]);

  if (!battle || !monster) return null;

  // The two props settle independently: clearing a stage advances `monster` to
  // the next one immediately, while `battle` holds the finished fight until the
  // victory banner is dismissed. Rendering that pair would put the next
  // monster's name over the last one's empty health bar — which is what it did
  // before this guard. Showing nothing for the half-second in between is the
  // honest answer.
  if (battle.monsterId !== monster.id) return null;

  return (
    <aside className="garden-battle" aria-live="polite">
      <div className="garden-foe">
        <h3 className="garden-foe-name">{monster.name}</h3>
        <p className="garden-foe-kind">
          {monster.type === 'Boss' ? 'Island boss'
            : monster.type === 'SemiBoss' ? 'Semi-boss'
              : monster.type === 'Elite' ? 'Elite'
                : 'Common'}
          {' · weak to '}
          <strong>{monster.weakness}</strong>
          {' · shrugs off '}
          {monster.strength}
        </p>

        <Bar label="Them" value={battle.monster.hp} max={battle.monster.maxHp} tone="foe" />
        <Bar label="You" value={battle.player.hp} max={battle.player.maxHp} tone="you" />

        {battle.player.shield > 0 && (
          <p className="garden-foe-note">Ward holding {battle.player.shield}.</p>
        )}
        {battle.outcome === 'Fighting' && battle.hitsLeft > 0 && (
          <p className="garden-foe-note">
            About {battle.hitsLeft} more {battle.hitsLeft === 1 ? 'hit' : 'hits'}.
          </p>
        )}
        {battle.player.effects.length > 0 && (
          <ul className="garden-effects">
            {battle.player.effects.map((effect, index) => (
              <li key={`${effect.kind}-${index}`}>
                {effect.kind} · {effect.turnsLeft} {effect.turnsLeft === 1 ? 'turn' : 'turns'}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ol className="garden-log">
        {battle.log.map((line, index) => (
          <li
            key={`${line.round}-${index}`}
            className={line.who === 'Player' ? 'is-you' : 'is-them'}
            ref={index === battle.log.length - 1 ? tail : undefined}
          >
            {line.text}
          </li>
        ))}
      </ol>
    </aside>
  );
}
