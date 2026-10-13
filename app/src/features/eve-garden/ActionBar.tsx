import { useBuzz } from '../../pwa/haptics';
import type { ActionDto, BattleDto, Charge, MonsterDto, MoveStyle, RaidStatsDto } from './engine/types';
import { Icon } from '../../components/icons';
import type { IconName } from '../../nav';
import { PixelSprite } from './gate/PixelSprite';
import {
  ULTIMATE_COOLDOWN_TURNS, moveKeyFor, type CompanionKit,
} from '../../domain/rpg/companionSkills';
import { FEEDS, chargeOnWeakness, moveLift } from '../../domain/rpg/charges';

/**
 * The move pad: six tiles, three across, always in the same places.
 *
 * Top row is the fighting basics (physical, defensive, magic). The bottom row
 * is the heal, the couple's move and this companion's own finisher, which wears
 * its own sprite and is the only tile with a border of its own colour.
 *
 * A tile says its name and at most one short badge ("+25%", "Lv 8", "in 2");
 * everything longer is the tooltip and the screen-reader label. What today's
 * charges and gear are worth still arrives as that badge, because a bonus
 * nobody can see is a bonus nobody plays towards.
 *
 * In a fight the pad is the controller, locked tiles included: the level curve
 * is a promise and an empty tile makes none. Out of a fight there is nothing
 * to press, so the pad folds away and one line names what comes next.
 */

export interface MovePadProps {
  /** What is unlocked now. */
  actions: ActionDto[];
  /** Everything the couple will eventually have, for the locked tiles. */
  allActions: ActionDto[];
  battle: BattleDto | null;
  monster: MonsterDto | null;
  busy: boolean;
  kit: CompanionKit;
  charges: readonly Charge[];
  /** The raid sheet's totals, for the gear badge on each move. */
  stats: RaidStatsDto;
  /** The pet's combat rank, for the idle line. */
  level: number;
  onAct(action: ActionDto): void;
}

const PAD_ORDER: readonly MoveStyle[] = ['Physical', 'Defensive', 'Magic', 'Mend', 'Together', 'Ultimate'];

const STYLE_ICON: Record<Exclude<MoveStyle, 'Ultimate'>, IconName> = {
  Physical: 'sword',
  Defensive: 'shield',
  Magic: 'sparkle',
  Mend: 'heart',
  Together: 'friends',
};

const STYLE_LABEL: Record<MoveStyle, string> = {
  Physical: 'Physical', Defensive: 'Defensive', Magic: 'Magic', Mend: 'Mend',
  Together: 'The couple’s move', Ultimate: 'Finisher',
};

function nameOf(style: MoveStyle, kit: CompanionKit): string {
  if (style === 'Ultimate') return kit.ultimate.name;
  const key = moveKeyFor(style);
  return key ? kit.moves[key].name : 'Together';
}

function describe(style: MoveStyle, kit: CompanionKit): string | undefined {
  if (style === 'Ultimate') return kit.ultimate.description;
  const key = moveKeyFor(style);
  return key ? kit.moves[key].description : undefined;
}

export function MovePad({
  actions, allActions, battle, monster, busy, kit, charges, stats, level, onAct,
}: MovePadProps) {
  const buzz = useBuzz();
  const fighting = battle?.outcome === 'Fighting';
  const yourTurn = fighting && battle?.turn === 'Player';
  const unlocked = new Set(actions.map((a) => a.id));
  const onWeakness = chargeOnWeakness(charges, monster?.weakness);
  const lit = new Set(charges);

  if (!fighting) {
    const next = allActions.find((a) => !unlocked.has(a.id));
    return (
      <p className="garden-idle">
        {`Level ${level}. Walk into something to start a fight.`}
        {next ? ` Next move: ${nameOf(next.style, kit)} at level ${next.unlockLevel}.` : ''}
      </p>
    );
  }

  return (
    <ul className="pad-grid">
      {PAD_ORDER.map((style) => {
        const action = allActions.find((a) => a.style === style);
        if (!action) return null;
        const open = unlocked.has(action.id);
        const wait = style === 'Together' ? (battle?.togetherCooldown ?? 0)
          : style === 'Ultimate' ? (battle?.ultimateCooldown ?? 0) : 0;
        const fed = FEEDS[style];
        const charged = fed !== undefined && lit.has(fed);
        const strong = action.type === 'Attack' && onWeakness !== undefined;
        const lift = moveLift({
          charges, stats, style, weakness: monster?.weakness, strength: monster?.strength,
        });
        const badge = !open ? `Lv ${action.unlockLevel}`
          : wait > 0 ? (style === 'Ultimate' ? `in ${wait}` : 'resting')
            : style === 'Ultimate' ? 'Ready'
              : lift > 0 ? `+${lift}%` : '';
        const name = nameOf(style, kit);
        const classes = [
          'pad-tile', `is-${style.toLowerCase()}`,
          strong && open && wait === 0 ? 'is-strong' : '',
          charged ? 'is-charged' : '',
          wait > 0 ? 'is-recharging' : '',
          open ? '' : 'is-locked',
        ].filter(Boolean).join(' ');

        return (
          <li key={style}>
            <button
              type="button"
              className={classes}
              disabled={!open || busy || !yourTurn || wait > 0}
              // Buzz before anything async: iOS only ticks inside the tap itself.
              onClick={() => { buzz('tap'); onAct(action); }}
              title={describe(style, kit)}
              aria-label={`${name}. ${STYLE_LABEL[style]}.${badge ? ` ${badge}.` : ''}${strong && open && wait === 0 ? ' It feels this.' : ''}`}
            >
              <span className="pad-art" aria-hidden="true">
                {style === 'Ultimate'
                  ? <PixelSprite spriteKey={kit.ultimate.sprite} label="" className="pad-sprite" />
                  : <Icon name={STYLE_ICON[style]} />}
              </span>
              <span className="pad-name">{name}</span>
              <span className="pad-badge" aria-hidden="true">
                {style === 'Ultimate' && open && wait > 0
                  ? Array.from({ length: ULTIMATE_COOLDOWN_TURNS }, (_, i) => (
                    <i key={i} data-on={i < ULTIMATE_COOLDOWN_TURNS - wait || undefined} />
                  ))
                  : badge}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Backing away. Small and apart from the pad, so it is never hit by accident. */
export function FleeButton({ battle, busy, onFlee }: { battle: BattleDto | null; busy: boolean; onFlee(): void }) {
  const buzz = useBuzz();
  if (battle?.outcome !== 'Fighting') return null;
  return (
    <button
      type="button"
      className="garden-flee"
      disabled={busy || battle.turn !== 'Player'}
      onClick={() => { buzz('tap'); onFlee(); }}
    >
      <Icon name="arrow" turn="left" />
      Walk away
    </button>
  );
}
