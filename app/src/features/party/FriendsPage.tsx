import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, grantLifeEvent } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import { petKindById } from '../../domain/rpg/pets';
import { getMascot } from '../pet/mascots';
import { useTheme } from '../../themes/ThemeProvider';
import { petArt } from './art/pets';

/**
 * Tree Town, with one other house in it.
 *
 * Finch's Friends tab is a town of everyone you have added. This app is for
 * two people, so the honest version of that screen is the other one of you:
 * their bird, how long you have both been at it, and the one thing you can
 * send them. A list UI with a single row in it, or an invite flow with nobody
 * to invite, would both be a bigger screen saying less.
 *
 * Friendship is counted, not stored. It is the days the two of you have both
 * been on the record — derived here from the same `lifeEvents` rows the grant
 * writes, so there is no second number that can disagree with the first.
 */
export function FriendsPage() {
  const { theme } = useTheme();
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4200);
    return () => clearTimeout(timer);
  }, [message]);

  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  const partner = useMemo(
    () => (members ?? []).find((m) => m.id !== memberId),
    [members, memberId],
  );

  const partnerAvatar = useLiveQuery(
    async () => (partner ? db.avatars.get(partner.id) : undefined),
    [partner?.id],
  );
  const partnerPets = useLiveQuery(
    async () => (partner ? db.pets.where('memberId').equals(partner.id).toArray() : []),
    [partner?.id],
  );
  const events = useLiveQuery(
    async () => (coupleId ? db.lifeEvents.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );

  // Distinct days with something on them, either side. A count of days rather
  // than of events, for the reason every quest measure is: a busy Tuesday is
  // still one Tuesday.
  const friendship = new Set((events ?? []).map((e) => e.day)).size;
  const sentToday = (events ?? []).some(
    (e) => e.kind === 'good-vibes' && e.day === day && e.fromMemberId === memberId,
  );

  const mascot = getMascot(theme.id);
  const companion = partnerAvatar?.companionId
    ? (partnerPets ?? []).find((p) => p.id === partnerAvatar.companionId)
    : undefined;
  const companionKind = companion ? petKindById(companion.kindId) : undefined;
  const CompanionArt = companion ? petArt(companion.kindId) : undefined;

  async function sendVibes() {
    if (!partner || !coupleId || !memberId) return;
    const result = await grantLifeEvent(coupleId, partner.id, 'good-vibes', day, {
      fromMemberId: memberId,
      note: note.trim() || undefined,
    });
    if (!result.ok) { setMessage(result.reason ?? null); return; }
    setNote('');
    setMessage('Sent. They will find it waiting.');
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Friends</h1>
        <p className="page-sub">Tree Town has two houses.</p>
      </header>

      {!partner ? (
        <section className="panel">
          <h2 className="section-title">Nobody here yet</h2>
          <p className="section-sub">
            This town fills up when the second phone joins. Pairing lives in{' '}
            <Link to="/settings">Settings</Link>.
          </p>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2 className="section-title">{partner.displayName || 'Them'}</h2>
            <div className="friend-house">
              <div className="friend-birb" role="img" aria-label={`${partner.displayName || 'Their'} birb`}>
                <mascot.Art mood="content" />
              </div>
              <dl className="friend-facts">
                <div>
                  <dt>Friendship</dt>
                  <dd>{friendship} {friendship === 1 ? 'day' : 'days'}</dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{partnerAvatar ? levelOf(partnerAvatar) : '—'}</dd>
                </div>
                <div>
                  <dt>Coins</dt>
                  <dd>{partnerAvatar ? sheetFor(partnerAvatar).coins : '—'}</dd>
                </div>
              </dl>
            </div>
            {companionKind && CompanionArt ? (
              <p className="section-sub friend-companion">
                <span className="friend-companion-art" aria-hidden="true"><CompanionArt /></span>
                Walking with {companionKind.name}.
              </p>
            ) : null}
          </section>

          <section className="panel">
            <h2 className="section-title">Good vibes</h2>
            <p className="section-sub">
              One a day, and it grants them energy rather than costing you any.
              A note is optional — the energy arrives either way.
            </p>
            <input
              className="field"
              value={note}
              maxLength={140}
              placeholder="Say something, or don't"
              aria-label="A note to send with it"
              onChange={(event) => setNote(event.target.value)}
            />
            <button
              type="button"
              className="primary"
              disabled={sentToday}
              onClick={sendVibes}
            >
              {sentToday ? 'Already sent today' : 'Send good vibes'}
            </button>
          </section>
        </>
      )}

      {message ? <div className="receipt" role="status">{message}</div> : null}
    </div>
  );
}
