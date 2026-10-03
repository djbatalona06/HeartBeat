import { Icon } from '../../../components/icons';
import { TOGETHER_COIN_MULTIPLIER, TOGETHER_PURSES, TOGETHER_XP_SHARE } from '../../../domain/rpg/raidGate';

/**
 * The partner gate: what standing at the boss's gate together is worth.
 *
 * Only ever rendered on a boss stage — every other stage is asynchronous and
 * the gate says nothing about your partner there. It is an invitation first:
 * the line names who is missing, and the three rewards light up the moment they
 * arrive, so the reason to wait for them is on the screen before the button.
 */

export interface TogetherTetherProps {
  partnerName: string;
  present: boolean;
}

export function TogetherTether({ partnerName, present }: TogetherTetherProps) {
  const rewards = [
    { icon: 'sparkle' as const, text: `+${Math.round(TOGETHER_XP_SHARE * 100)}% pet XP` },
    { icon: 'coin' as const, text: `${TOGETHER_COIN_MULTIPLIER}× coins` },
    { icon: 'gift' as const, text: TOGETHER_PURSES === 1 ? 'A coin purse' : `${TOGETHER_PURSES} coin purses` },
  ];

  return (
    <section className="raid-gate-together" data-present={present} aria-label="Going in together">
      <div className="raid-gate-pair" aria-hidden="true">
        <span className="raid-gate-pair-dot" data-lit="true">You</span>
        <span className="raid-gate-pair-line" />
        <span className="raid-gate-pair-dot" data-lit={present}>{partnerName}</span>
      </div>
      <p className="raid-gate-together-line" role="status">
        {present
          ? `${partnerName} is at the gate. Go in together.`
          : `Bring ${partnerName} to the gate and the boss pays out more.`}
      </p>
      <ul className="raid-gate-bonus">
        {rewards.map((reward) => (
          <li key={reward.text} data-lit={present}>
            <Icon name={reward.icon} />
            {reward.text}
            <span className="visually-hidden">{present ? ', earned' : ', when you are both here'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
