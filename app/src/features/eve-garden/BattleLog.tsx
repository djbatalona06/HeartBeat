import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import type { BattleDto, Charge, MonsterDto } from './engine/types';
import { CHARGE_COPY, WEAKNESS_MULTIPLIER, chargeForElement, chargeOnWeakness } from '../../domain/rpg/charges';
import { behaviorBlurb, telegraphText } from '../../domain/rpg/behaviours';

/**
 * What just happened, and what you are fighting.
 *
 * A strip above the board: both health bars side by side, whose move it is,
 * what the foe is weak to, any warning, and only the *latest* line of the log.
 * The move pad sits under the board in thumb reach, so this is read at a glance
 * rather than scrolled. The whole log, the monster's card and the "about N more
 * hits" read open in a bottom sheet from "Log".
 *
 * The strip is the page's live region, so every new line is still heard; the
 * sheet is for looking back and is deliberately not live, which would read the
 * whole history out again on every turn. Every decision is made in the action
 * bar — the one handler here only opens the sheet.
 */

export interface BattleLogProps {
  battle: BattleDto | null;
  monster: MonsterDto | null;
  /** Today's charges, for the weakness chip. */
  charges: readonly Charge[];
  /**
   * Indices of player lines whose hit was on the weakness. The picture shows
   * it with extra sparks; this is the same fact in words, inside the live
   * region, so it is heard, and still there under calm when nothing is drawn.
   */
  weakHits?: readonly number[];
}

function Meter({ name, value, max, shield = 0, tone }: {
  name: string; value: number; max: number; shield?: number; tone: 'foe' | 'you';
}) {
  const percent = max <= 0 ? 0 : Math.round(Math.min(1, Math.max(0, value / max)) * 100);
  return (
    <div className={`hud-meter is-${tone}`}>
      <span className="hud-meter-head">
        <span className="hud-name">{name}</span>
        <span className="hud-value">{value}/{max}{shield > 0 ? ` +${shield} ward` : ''}</span>
      </span>
      <span className="hud-track"><span className="hud-fill" style={{ width: `${percent}%` }} /></span>
    </div>
  );
}

export function BattleLog({ battle, monster, charges, weakHits = [] }: BattleLogProps) {
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
  const fighting = battle.outcome === 'Fighting';
  const yourTurn = fighting && battle.turn === 'Player';

  // What to log to make the next hit count, or the fact that it already does.
  const answer = chargeOnWeakness(charges, monster.weakness);
  const weak = answer
    ? `✦ ${CHARGE_COPY[answer].label} lit · hits ×${WEAKNESS_MULTIPLIER}`
    : `Weak to ${monster.weakness.toLowerCase()} · log ${CHARGE_COPY[chargeForElement(monster.weakness)].nudge}`;

  const effects = battle.player.effects.map((e) => `${e.kind} ${e.turnsLeft}`);
  const warning = yourTurn ? telegraphText(monster.name, battle.telegraph) : null;

  return (
    <>
      <aside className="garden-hud" aria-live="polite">
        <div className="hud-bars">
          <Meter name={monster.name} value={battle.monster.hp} max={battle.monster.maxHp} tone="foe" />
          <Meter name="You" value={battle.player.hp} max={battle.player.maxHp} shield={battle.player.shield} tone="you" />
        </div>

        <div className="hud-meta">
          <span className="hud-turn" data-mine={yourTurn || undefined}>
            {fighting ? (yourTurn ? 'Your move' : 'Their move') : battle.outcome}
          </span>
          {fighting && <span className="hud-chip" data-lit={answer ? true : undefined}>{weak}</span>}
          {fighting && effects.map((text) => <span key={text} className="hud-chip">{text}</span>)}
        </div>

        {/* The same warning the scene draws as a sign, in words and inside the
            live region — which is the only place calm and a screen reader get it. */}
        {warning && <p className="garden-foe-warning" role="status">{warning}</p>}
        {last >= 0 && (
          <button
            type="button"
            className={`hud-line ${battle.log[last].who === 'Player' ? 'is-you' : 'is-them'}`}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <span>{lineText(battle.log[last], last)}</span>
            <span className="hud-line-more" aria-label="Open the full log">Log ›</span>
          </button>
        )}
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
        {fighting && battle.hitsLeft > 0 && (
          <p className="garden-foe-note">
            About {battle.hitsLeft} more plain {battle.hitsLeft === 1 ? 'hit' : 'hits'}.
          </p>
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
