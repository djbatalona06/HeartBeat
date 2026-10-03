import type { MonsterDto } from './engine/types';

/**
 * The slide-down after a win.
 *
 * Says the two things a victory is actually worth: what fell, and what the
 * couple got for it. `rewardText` is only set when the win crossed a level, so
 * the banner is one line on an ordinary stage and three on the one that matters.
 */

export interface VictoryBannerProps {
  monster: MonsterDto;
  xp: number;
  leveledUp: boolean;
  level: number;
  rewardText: string;
  /** What this member's own coins and bag got, if anything. Theirs alone — the XP above is the couple's. */
  lootText?: string;
  islandComplete: boolean;
  nextIslandName: string | null;
  onDismiss(): void;
}

export function VictoryBanner({
  monster, xp, leveledUp, level, rewardText, lootText, islandComplete, nextIslandName, onDismiss,
}: VictoryBannerProps) {
  return (
    <div className="garden-victory" role="status">
      <div className="garden-victory-card">
        <h2>{monster.name} is down.</h2>
        <p className="garden-victory-xp">+{xp} XP, to the two of you.</p>
        {lootText ? <p className="garden-victory-loot">{lootText}</p> : null}

        {leveledUp && (
          <p className="garden-victory-level">
            Level {level}. {rewardText}
          </p>
        )}

        {islandComplete && (
          <p className="garden-victory-island">
            That is the island.
            {nextIslandName ? ` ${nextIslandName} is open.` : ' There is no further to go — yet.'}
          </p>
        )}

        <button type="button" className="garden-victory-go" onClick={onDismiss}>
          {islandComplete ? 'On, then' : 'Next stage'}
        </button>
      </div>
    </div>
  );
}
