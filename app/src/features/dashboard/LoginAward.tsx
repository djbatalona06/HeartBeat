import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { claimDailyLogin } from '../../db/repository';
import { LOGIN_CYCLE, LOGIN_REWARDS, loginState, purseById } from '../../domain/rpg/coinSources';
import type { DayKey } from '../../domain/types';
import { PrimaryAction } from '../../ui/PrimaryAction';

/**
 * The seven-day login award: one small claim a day, a purse on the seventh.
 *
 * Counted in claims rather than streak days, so a quiet week costs nothing —
 * see `loginState`. Hidden once today's is taken, so it is a card that is
 * there when there is something to take and gone when there is not.
 */
export function LoginAward({ memberId, coupleId, day }: {
  memberId: string | undefined;
  coupleId: string | undefined;
  day: DayKey;
}) {
  const avatar = useLiveQuery(
    () => (memberId ? db.avatars.get(memberId) : undefined),
    [memberId],
  );
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  if (!memberId || !coupleId) return null;
  const state = loginState(avatar ?? {}, day);
  if (!state.claimable) {
    return said ? <p className="section-sub login-award-said" role="status">{said}</p> : null;
  }

  const claim = async () => {
    setBusy(true);
    try {
      const receipt = await claimDailyLogin(memberId, coupleId, day);
      if (receipt) {
        const purse = receipt.reward.purse ? purseById(receipt.reward.purse) : undefined;
        setSaid(`Day ${receipt.day}: +${receipt.reward.coins} coins${purse ? ` and a ${purse.name.toLowerCase()} in your bag` : ''}.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const reward = state.reward;
  const purse = reward.purse ? purseById(reward.purse) : undefined;
  return (
    <section className="panel login-award" aria-label="Daily award">
      <h2 className="section-title">Day {state.day} of {LOGIN_CYCLE}</h2>
      <ol className="chips" aria-label="The seven days">
        {LOGIN_REWARDS.map((entry, i) => (
          <li
            key={entry.coins}
            className={`chip ${i + 1 === state.day ? '' : 'chip-locked'}`}
            aria-current={i + 1 === state.day ? 'step' : undefined}
          >
            {i + 1}{entry.purse ? ' ★' : ''}
          </li>
        ))}
      </ol>
      <PrimaryAction disabled={busy} onClick={() => void claim()}>
        Claim +{reward.coins} coins{purse ? ` and a ${purse.name.toLowerCase()}` : ''}
      </PrimaryAction>
    </section>
  );
}
