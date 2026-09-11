import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../../db/database';
import { ensureIdentity } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { QuestBoard } from './QuestBoard';
import { AchievementShelf } from '../achievements/AchievementShelf';

/**
 * The two things that pay for showing up over time, on one screen.
 *
 * Both halves already existed and both were already self-querying components
 * taking props, so this page is the composition and nothing else — it owns no
 * state a section could not own, and adds no third way to read a quest.
 *
 * They are together because they answer the same question at two speeds. A
 * quest is this week; a tier on the shelf is the year. Splitting them would
 * mean two tabs that each look half-empty on a quiet week.
 */
export function QuestsPage() {
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);

  // Settings only carries an identity once something else has written one, so
  // a fresh install that lands here first still needs to mint one — the same
  // reason Tasks, Mood and the dashboard each do. See db/repository/identity.ts.
  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const timeZone = settings?.timeZone ?? 'America/Los_Angeles';
  const coupleId = settings?.coupleId ?? identity?.coupleId;

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Quests</h1>
        <p className="page-sub">Extra ways to earn, and what they added up to.</p>
      </header>

      {coupleId ? (
        <>
          <QuestBoard coupleId={coupleId} day={todayKey(timeZone)} timeZone={timeZone} />
          <AchievementShelf coupleId={coupleId} />
        </>
      ) : null}
    </div>
  );
}
