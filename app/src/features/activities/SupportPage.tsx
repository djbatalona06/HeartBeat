import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { LANE_NAMES, lanesFor } from '../../domain/support/lanes';
import { ideasForDay } from '../../domain/support/ideas';
import { quoteForDay } from '../../domain/support/quotes';

/**
 * What might help today, for whichever of you is reading it.
 *
 * The screen shows lanes rather than categories, and which lanes you get is
 * decided in one place — `domain/support/lanes.ts` — from what the two of you
 * have actually said: who logs a cycle, and how each of you answered the one
 * question in Settings. Nothing here branches on a gender itself, so this file
 * has no opinion about anybody.
 *
 * Everything is a suggestion and nothing is recorded. There is no tick, no
 * streak and no count, for the reason `selfcare/kindness.ts` gives: a feature
 * that scores how supportive somebody has been turns care into a chore with a
 * leaderboard, and that is worse than not having the screen.
 */
export function SupportPage() {
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

  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  const partner = useMemo(
    () => (members ?? []).find((m) => m.id !== memberId),
    [members, memberId],
  );

  // `Settings.tracksCycle` is the answer for this device; the partner's copy
  // lives on their member row, which is the only place it can be read from
  // here. See the note on Settings.tracksCycle for why the two differ.
  const lanes = lanesFor({
    gender: settings?.gender,
    tracksCycle: settings?.tracksCycle === true,
    partnerTracksCycle: partner?.tracksCycle === true,
  });

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Might help</h1>
        <p className="page-sub">Suggestions for today. Nothing here is counted.</p>
      </header>

      {lanes.map((lane) => {
        const ideas = ideasForDay(day, lane);
        const quote = quoteForDay(day, lane);
        return (
          <section className="panel support-lane" key={lane}>
            <h2 className="section-title">{LANE_NAMES[lane]}</h2>
            {quote ? (
              <p className="support-quote">
                {quote.text}
                {quote.attribution ? <span className="support-by"> — {quote.attribution}</span> : null}
              </p>
            ) : null}
            <ul className="support-list">
              {ideas.map((idea) => (
                <li className="support-row" key={idea.id}>
                  <span className="support-kind">{idea.kind === 'gift' ? 'Give' : 'Do'}</span>
                  <span className="support-text">{idea.text}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {settings && settings.gender === undefined ? (
        <p className="section-sub">
          There is one question in Settings that changes what shows up here.
          Answering it is optional.
        </p>
      ) : null}
    </div>
  );
}
