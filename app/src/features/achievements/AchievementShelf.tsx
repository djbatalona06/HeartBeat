import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { achievementState, claimAchievements } from '../../db/repository';
import { achievementByCode } from '../../domain/achievements/catalogue';
import { shelfRows } from '../../domain/achievements/unlock';

/**
 * The shelf.
 *
 * A thin renderer, on purpose: everything worth testing is in
 * `domain/achievements/`, which vitest can reach, and the single write is
 * `claimAchievements`. This file decides nothing.
 *
 * It shows one rung per track rather than all three, and only the tracks under
 * way plus a few suggestions — the next thing, not a wall of locked doors. The
 * list therefore grows as the couple do more, and a finished track stays on its
 * last rung reading as done rather than disappearing.
 */
export function AchievementShelf({ coupleId }: { coupleId: string }) {
  const earned = useLiveQuery(
    async () => db.achievements.where('coupleId').equals(coupleId).toArray(),
    [coupleId],
  );

  /**
   * The same reader the writer uses, rather than a second copy of it.
   *
   * These were two independent transcriptions of the same dozen queries, which
   * is two chances to drift: the bars would show one thing and the claim would
   * pay from another. Reading through `achievementState` also keeps the live
   * query subscribed to every table it touches, which is what makes the shelf
   * refresh when a workout is logged elsewhere.
   */
  const state = useLiveQuery(async () => achievementState(coupleId), [coupleId]);

  /**
   * Claiming is a side effect of looking, which is the calm version: nothing
   * asks to be collected and nothing is missed by not visiting. The write is
   * idempotent, so this re-running on its own writes — which it will, since the
   * live queries above watch the tables it touches — costs one read and
   * finds nothing.
   */
  useEffect(() => {
    if (!coupleId || !state) return;
    void claimAchievements(coupleId);
  }, [coupleId, state]);

  if (!state || !earned) return null;

  const rows = shelfRows(state);
  const unlockedCount = earned.length;

  return (
    <section className="panel">
      <h2 className="panel-title">Shelf</h2>
      <p className="panel-note">
        {unlockedCount === 0
          ? 'Nothing here yet. It fills up on its own.'
          : `${unlockedCount} earned, between the two of you.`}
      </p>

      <ul className="shelf">
        {rows.map(({ def, have: count, need, fraction, earned: done }) => (
          <li className={done ? 'shelf-row is-done' : 'shelf-row'} key={def.code}>
            <div className="shelf-head">
              <span className="shelf-name">{def.title}</span>
              <span className="shelf-count">
                {done ? 'done' : `${Math.min(count, need)}/${need}`}
              </span>
            </div>
            <p className="shelf-blurb">{def.blurb}</p>
            <div
              className="shelf-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={need}
              aria-valuenow={Math.min(count, need)}
              aria-label={def.title}
            >
              <span className="shelf-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>

      {unlockedCount > 0 ? (
        <details className="shelf-past">
          <summary>What you have already</summary>
          <ul className="shelf-list">
            {[...earned]
              .sort((a, b) => b.unlockedAt - a.unlockedAt)
              .map((row) => (
                <li className="shelf-past-row" key={row.id}>
                  <span className="shelf-past-name">
                    {achievementByCode(row.code)?.title ?? row.code}
                  </span>
                  <span className="shelf-past-xp">+{row.xp} XP</span>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
