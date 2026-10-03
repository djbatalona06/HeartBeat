import { bossOf, faceOf, islandView } from '../../../domain/rpg/islands';
import { CHARGE_COPY, chargeForElement } from '../../../domain/rpg/charges';
import { PixelSprite } from './PixelSprite';

/**
 * The current island's boss, standing in the arch.
 *
 * The gate used to be five companions and nothing to use them on. This puts
 * the reason to go in right in the middle of it: who is at the top of this
 * island, how much of them there is, what they cannot stand. Where the
 * couple have got to is the world map's job and the compass's, not the
 * gate's.
 *
 * Everything is read from `domain/rpg/islands.ts`, a tested mirror of the C#
 * data, because nothing behind the gate may boot the WebAssembly runtime.
 */

export interface GateBossProps {
  island: number;
  dark: boolean;
}

export function GateBoss({ island, dark }: GateBossProps) {
  const view = islandView(island);
  const boss = bossOf(island);
  const face = faceOf(boss, dark);
  const answer = CHARGE_COPY[chargeForElement(boss.weakness)];

  return (
    <div className="raid-gate-boss">
      <div className="raid-gate-boss-figure">
        <PixelSprite
          spriteKey={boss.spriteKey}
          label={face.name}
          className="raid-gate-boss-sprite"
          dark={dark}
        />
      </div>

      <div className="raid-gate-boss-card">
        <p className="raid-gate-boss-island">
          Island {island} · {dark ? view.darkName : view.lightName}
        </p>
        <h2 className="raid-gate-boss-name">{face.name}</h2>
        <p className="raid-gate-boss-stats">
          <span>{face.hp} HP</span>
          <span>Weak to {boss.weakness.toLowerCase()}</span>
          <span>Shrugs off {boss.strength.toLowerCase()}</span>
        </p>
        <p className="raid-gate-boss-hint">
          Log {answer.nudge} today and every hit on this island lands harder.
        </p>
      </div>
    </div>
  );
}
