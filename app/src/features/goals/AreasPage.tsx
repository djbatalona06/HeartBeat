import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, loadSettings } from '../../db/database';
import { todayKey } from '../../domain/day';
import { AREAS, areaProgress } from '../../domain/rpg/selfCare';
import { SCHEDULED_TYPES, type Task } from '../../domain/rpg/types';
import { Icon } from '../../components/icons';

/**
 * Six areas of a life, and how much of each one today has had.
 *
 * This screen is a map, not a list of work — the work is on Goals. What it is
 * for is the question Finch's own areas screen answers: not "what is left" but
 * "which part of this have I been ignoring", which you cannot see from a single
 * flat checklist where Body and People sit in the same column.
 *
 * Counted over every scheduled task rather than only goals, because the starter
 * plan seeds its eight as filed dailies. An areas screen that read goals alone
 * would show six empty rings to somebody whose list is already half Body.
 */
export function AreasPage() {
  const settings = useLiveQuery(loadSettings, []);
  const memberId = settings?.memberId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  const filed = useLiveQuery(
    async (): Promise<Task[]> => (memberId
      ? (await Promise.all(
          SCHEDULED_TYPES.map((type) =>
            db.tasks.where('[memberId+type]').equals([memberId, type]).toArray()),
        )).flat()
      : []),
    [memberId],
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Self-care areas</h1>
        <p className="page-sub">Where your goals are pointed, and where they are not.</p>
      </header>

      {/* Above the grid, not below it. Trailing prose on this screen ran
          underneath the floating chat pill, which is fixed over the foot of
          every page — and an instruction for tapping a tile reads better
          before the tiles than after them anyway. */}
      <p className="section-sub">
        Tapping an area shows what you could add to it. Nothing here is a score —
        an empty area is information, not a failure.
      </p>

      <div className="area-grid">
        {AREAS.map((area) => {
          const { done, total } = areaProgress(filed ?? [], area.id, day);
          const fraction = total ? done / total : 0;
          return (
            <Link
              key={area.id}
              className="area-tile"
              to={`/goals/ideas?area=${area.id}`}
              // The tint is one accent at varying strength rather than six
              // hardcoded colours, so the grid stays inside whichever theme
              // pack is on instead of fighting it.
              style={{ '--area-fill': `${Math.round(fraction * 100)}%` } as React.CSSProperties}
            >
              <span className="area-glyph"><Icon name={area.icon} /></span>
              <span className="area-name">{area.name}</span>
              <span className="area-count">
                {total ? `${done} of ${total} today` : 'Nothing here yet'}
              </span>
              <span className="area-blurb">{area.blurb}</span>
              <span className="area-bar" aria-hidden="true"><i style={{ width: `${fraction * 100}%` }} /></span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
