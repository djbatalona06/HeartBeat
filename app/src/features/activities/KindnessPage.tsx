import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, grantLifeEvent } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { actForDay, actsFor } from '../../domain/selfcare/kindness';

/**
 * One small thing, for them or for anyone.
 *
 * The two halves behave differently on purpose. Something done for your partner
 * can be sent, because the app already has an honest way to do that — the
 * existing `good-vibes` life event, with the daily cap it already carries,
 * rather than a second mechanism needing its own cap and its own abuse to think
 * about. Something done for anybody else is not recorded at all: counting a
 * kindness to a stranger turns it into a score, and the version of this feature
 * that tracks how kind you have been to the world is worse than no feature.
 */
export function KindnessPage() {
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');
  const [note, setNote] = useState('');

  // The good vibe goes to *them*, not to you. `grantLifeEvent` credits the
  // member it is given and pays the sender separately, so passing your own id
  // as both would be sending yourself a present — the same shape FriendsPage
  // already uses for its button.
  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  const partner = (members ?? []).find((m) => m.id !== memberId);

  const todayForThem = actForDay(day, 'them');
  const todayForAnyone = actForDay(day, 'anyone');

  async function send(text: string) {
    if (!memberId || !coupleId) return;
    if (!partner) {
      setNote('Nobody to send to yet — pair the two phones first.');
      return;
    }
    const result = await grantLifeEvent(coupleId, partner.id, 'good-vibes', day, {
      fromMemberId: memberId,
      note: text,
    });
    setNote(result?.ok ? 'Sent. They will see it on their phone.' : result?.reason ?? 'Not today.');
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Act of kindness</h1>
        <p className="page-sub">One small thing. Today's, or pick your own.</p>
      </header>

      <Link className="goal-link" to="/activities">← Activities</Link>

      <section className="panel">
        <h2 className="section-title">For them, today</h2>
        <p className="kind-today">{todayForThem.text}</p>
        <button
          type="button"
          className="primary"
          disabled={!partner}
          onClick={() => void send(todayForThem.text)}
        >
          {partner ? 'I did it — send them a good vibe' : 'Pair a second phone to send'}
        </button>
        {note ? <p className="section-sub" role="status">{note}</p> : null}
      </section>

      <section className="panel">
        <h2 className="section-title">For anyone, today</h2>
        <p className="kind-today">{todayForAnyone.text}</p>
        <p className="section-sub">
          This one is not recorded anywhere, deliberately. Counting it would make
          it a score.
        </p>
      </section>

      <section className="panel">
        <h2 className="section-title">Others</h2>
        <ul className="kind-list">
          {actsFor('them').map((act) => (
            <li className="kind-row" key={act.id}>
              <span className="kind-text">{act.text}</span>
              <button
                type="button"
                className="kind-send"
                disabled={!partner}
                onClick={() => void send(act.text)}
                aria-label={`Send a good vibe for: ${act.text}`}
              >
                Send
              </button>
            </li>
          ))}
          {actsFor('anyone').map((act) => (
            <li className="kind-row" key={act.id}>
              <span className="kind-text">{act.text}</span>
              <span className="kind-quiet">for anyone</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
