import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { claimDailyLogin } from '../../db/repository';
import {
  LOGIN_CYCLE, LOGIN_REWARDS, loginPopupOpen, loginState, purseById,
} from '../../domain/rpg/coinSources';
import { todayKey } from '../../domain/day';
import { OPEN_WHILE_UNPAIRED } from '../../nav';
import { PrimaryAction } from '../../ui/PrimaryAction';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { Sheet } from '../../ui/Sheet';

/**
 * The seven-day login award, as a popup that finds you.
 *
 * It was an inline card on Home that disappeared once claimed, so anyone who
 * opened the app on another screen -- a notification deep link, the Bag -- never
 * saw it, and Home was the only route that ever mentioned it. This is mounted
 * once in `App` and shows on whatever route the app opens to, as soon as there
 * is something to claim.
 *
 * It stays off every route an unpaired phone can reach (`OPEN_WHILE_UNPAIRED`):
 * Settings holds the pairing form, which a popup over it would cover, the first
 * run is not the moment for a reward, and First Aid is a page for somebody's
 * worst hour and gets nothing in front of it.
 *
 * "Later" puts it off for today only (kept per day in `sessionStorage`, so a new
 * day, or a new session on the same day, offers it again). Counted in claims
 * rather than streak days, so a quiet week costs nothing -- see `loginState`.
 */

const LATER_KEY = 'heartbeat.login.putOff';

function readPutOff(): string | null {
  try { return sessionStorage.getItem(LATER_KEY); } catch { return null; }
}

function writePutOff(day: string): void {
  try { sessionStorage.setItem(LATER_KEY, day); } catch { /* private window: it just comes back sooner */ }
}

export function LoginPopup() {
  const { pathname } = useLocation();
  const settings = useLiveQuery(loadSettings, []);
  const memberId = settings?.memberId;
  const coupleId = settings?.coupleId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  const avatar = useLiveQuery(
    () => (memberId ? db.avatars.get(memberId) : undefined),
    [memberId],
  );
  const [putOffOn, setPutOffOn] = useState<string | null>(readPutOff);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!memberId || !coupleId || !avatar || OPEN_WHILE_UNPAIRED.includes(pathname)) return null;

  const state = loginState(avatar, day);
  const open = loginPopupOpen({
    claimable: state.claimable, day, putOffOn, showingReceipt: receipt !== null,
  });
  if (!open) return null;

  const putOff = () => { writePutOff(day); setPutOffOn(day); setReceipt(null); };

  const claim = async () => {
    setBusy(true);
    try {
      const got = await claimDailyLogin(memberId, coupleId, day);
      if (got) {
        const purse = got.reward.purse ? purseById(got.reward.purse) : undefined;
        setReceipt(`Day ${got.day}: +${got.reward.coins} coins${purse ? ` and a ${purse.name.toLowerCase()} in your bag` : ''}.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const purse = state.reward.purse ? purseById(state.reward.purse) : undefined;
  return (
    <Sheet
      open
      onClose={receipt ? () => setReceipt(null) : putOff}
      label="Daily award"
      scrimClassName="popup-scrim"
      panelClassName="popup-panel login-popup"
    >
      {receipt ? (
        <>
          <h2 className="section-title">Claimed</h2>
          <p className="section-sub" role="status">{receipt}</p>
          <PrimaryAction onClick={() => setReceipt(null)}>Done</PrimaryAction>
        </>
      ) : (
        <>
          <h2 className="section-title">Day {state.day} of {LOGIN_CYCLE}</h2>
          <p className="section-sub">
            {purse ? 'The seventh day brings a purse as well.' : 'One small award a day; the seventh brings a purse.'}
          </p>
          <ol className="chips" aria-label="The seven days">
            {LOGIN_REWARDS.map((entry, i) => (
              <li
                key={entry.coins}
                className={`chip ${i + 1 < state.day ? 'chip-on' : i + 1 === state.day ? '' : 'chip-locked'}`}
                aria-current={i + 1 === state.day ? 'step' : undefined}
              >
                {i + 1}{entry.purse ? ' ★' : ''}
              </li>
            ))}
          </ol>
          <div className="popup-actions">
            <PrimaryAction disabled={busy} onClick={() => void claim()}>
              Claim +{state.reward.coins} coins{purse ? ` and a ${purse.name.toLowerCase()}` : ''}
            </PrimaryAction>
            <SecondaryAction onClick={putOff}>Later</SecondaryAction>
          </div>
        </>
      )}
    </Sheet>
  );
}
