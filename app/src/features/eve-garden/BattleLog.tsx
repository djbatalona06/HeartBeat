import { useEffect, useRef, useState } from 'react';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { Sheet } from '../../ui/Sheet';
import type { BattleDto, MonsterDto } from './engine/types';
import { WEAKNESS_MULTIPLIER } from '../../domain/rpg/charges';
import { behaviorBlurb, telegraphText } from '../../domain/rpg/behaviours';

/**
 * What just happened, and what you are fighting.
 *
 * A strip above the board: the monster's name, both health bars, any warning,
 * and only the *latest* line of the log. The move pad sits under the board in
 * thumb reach, so this is read at a glance rather than scrolled. The whole log,
 * and the monster's card, open in a bottom sheet from "Full log".
 *
 * The strip is the page's live region, so every new line is still heard; the
 * sheet is for looking back and is deliberately not live, which would read the
 * whole history out again on every turn. Every decision is made in the action
 * bar — the one handler here only opens the sheet.
 */

export interface BattleLogProps {
  battle: BattleDto | null;
  monster: MonsterDto | null;
  /**
   * Indices of player lines whose hit was on the weakness. The picture shows
   * it with extra sparks; this is the same fact in words, inside the live
   * region, so it is heard, and still there under calm when nothing is drawn.
   */
  weakHits?: readonly number[];
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

export function BattleLog({ battle, monster, weakHits = [] }: BattleLogProps) {
  const tail = useRef<HTMLLIElement | null>(null);
  const [open, setOpen] = useState(false);

  // Keep the newest line in view. `block: 'nearest'` so a fight in a panel does
  // not drag the whole page around underneath the canvas. Also runs on open: the
  // sheet only exists while open, so its list starts at the top.
  useEffect(() => {
    tail.current?.scrollIntoView({ block: 'nearest' });
  }, [battle?.log.length, open]);

  if (!battle || !monster) return null;

  // The two props settle independently: clearing a stage advances `monster` to
  // the next one immediately, while `battle` holds the finished fight until the
  // victory banner is dismissed. Rendering that pair would put the next
  // monster's name over the last one's empty health bar — which is what it did
  // before this guard. Showing nothing for the half-second in between is the
  // honest answer.
  if (battle.monsterId !== monster.id) return null;

  const lineText = (line: BattleDto['log'][number], index: number) =>
    `${line.text}${weakHits.includes(index) ? ` On its weakness · ×${WEAKNESS_MULTIPLIER}.` : ''}`;
  const last = battle.log.length - 1;

  // Ward, hits left and effects on one line: they used to be three paragraphs,
  // which is what made the panel taller than the board.
  const status = [
    battle.player.shield > 0 ? `Ward holding ${battle.player.shield}` : null,
    battle.outcome === 'Fighting' && battle.hitsLeft > 0
      ? `About ${battle.hitsLeft} more ${battle.hitsLeft === 1 ? 'hit' : 'hits'}`
      : null,
    ...battle.player.effects.map((e) => `${e.kind} ${e.turnsLeft} ${e.turnsLeft === 1 ? 'turn' : 'turns'}`),
  ].filter(Boolean).join(' · ');

  const warning = battle.outcome === 'Fighting' && battle.turn === 'Player'
    ? telegraphText(monster.name, battle.telegraph)
    : null;

  return (
    <>
      <aside className="garden-battle" aria-live="polite">
        <div className="garden-foe">
          <div className="garden-foe-head">
            <h3 className="garden-foe-name">{monster.name}</h3>
            <SecondaryAction aria-haspopup="dialog" onClick={() => setOpen(true)}>Full log</SecondaryAction>
          </div>

          <Bar label="Them" value={battle.monster.hp} max={battle.monster.maxHp} tone="foe" />
          <Bar label="You" value={battle.player.hp} max={battle.player.maxHp} tone="you" />

          {/* The same warning the scene draws as a sign, in words and inside the
              live region — which is the only place calm and a screen reader get it. */}
          {warning && <p className="garden-foe-warning" role="status">{warning}</p>}
          {status && <p className="garden-foe-note">{status}.</p>}
          {last >= 0 && (
            <p className={`garden-log-latest ${battle.log[last].who === 'Player' ? 'is-you' : 'is-them'}`}>
              {lineText(battle.log[last], last)}
            </p>
          )}
        </div>
      </aside>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label="Battle log"
        scrimClassName="menu-scrim"
        panelClassName="menu-panel garden-log-sheet"
        draggable
      >
        <h2 className="section-title">{monster.name}</h2>
        <p className="garden-foe-kind">
          {monster.type === 'Boss' ? 'Island boss'
            : monster.type === 'SemiBoss' ? 'Semi-boss'
              : monster.type === 'Elite' ? 'Elite'
                : monster.type === 'Minion' ? 'Skirmish'
                  : 'Common'}
          {' · weak to '}
          <strong>{monster.weakness}</strong>
          {' · shrugs off '}
          {monster.strength}
        </p>
        {behaviorBlurb(monster.behavior) && (
          <p className="garden-foe-note">{behaviorBlurb(monster.behavior)}</p>
        )}
        <ol className="garden-log">
          {battle.log.map((line, index) => (
            <li
              // react-doctor-disable-next-line no-array-index-as-key -- an append-only log with no ids; lines are never reordered or removed
              key={`${line.round}-${index}`}
              className={line.who === 'Player' ? 'is-you' : 'is-them'}
              ref={index === last ? tail : undefined}
            >
              {lineText(line, index)}
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  );
}
