import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { db, loadSettings } from '../../db/database';
import { adoptSuggestion, ensureIdentity } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { AREAS, areaById, tailoredFor } from '../../domain/rpg/selfCare';
import { SCHEDULED_TYPES, type AreaId, type Task } from '../../domain/rpg/types';
import { Icon } from '../../components/icons';

/** How many to show before the "more" button. A wall of sixty is a wall. */
const PAGE = 12;

/**
 * Ideas, tailored to the areas you picked and to what you already have.
 *
 * The tailoring is `tailoredFor` in `domain/rpg/selfCare.ts`, and it is
 * deliberately arithmetic rather than random: both phones derive this list from
 * the same synced tasks, and a shuffled list would look different on each
 * without either being more right. It round-robins the chosen areas so picking
 * three gives one of each before a second of any, and it never offers back
 * something already on your list — including the eight the starter plan
 * planted, which is why it reads every scheduled task and not just goals.
 */
export function GoalIdeasPage() {
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(PAGE);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  // The chosen areas live in the URL, so arriving from the areas grid with one
  // preselected and sharing or reloading the screen all mean the same thing.
  const chosen = params.getAll('area').filter((a): a is AreaId => AREAS.some((x) => x.id === a));

  const adopted = useLiveQuery(
    async (): Promise<Task[]> => (memberId
      ? (await Promise.all(
          SCHEDULED_TYPES.map((type) =>
            db.tasks.where('[memberId+type]').equals([memberId, type]).toArray()),
        )).flat()
      : []),
    [memberId],
  );

  const ideas = tailoredFor(chosen, adopted ?? []);

  function toggleArea(area: AreaId) {
    const next = chosen.includes(area) ? chosen.filter((a) => a !== area) : [...chosen, area];
    const params2 = new URLSearchParams();
    for (const a of next) params2.append('area', a);
    setParams(params2, { replace: true });
    setShown(PAGE);
  }

  async function adopt(suggestionId: string, title: string) {
    if (!memberId || !coupleId) return;
    const id = await adoptSuggestion(memberId, coupleId, suggestionId, day);
    setNote(id ? `Added “${title}” to your goals.` : 'That one could not be added.');
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Goal ideas</h1>
        <p className="page-sub">
          {chosen.length
            ? `${ideas.length} left in ${chosen.length === 1 ? areaById(chosen[0])?.name ?? 'that area' : `${chosen.length} areas`}.`
            : 'Small things, across all six areas. Pick an area to narrow it.'}
        </p>
      </header>

      {/* Both of these sit above the list rather than under it. The floating
          chat pill is fixed over the foot of every page, and the two things
          that must not end up beneath it are the confirmation of what you just
          tapped and the way back — the list itself can run under it the same
          way Tasks already does. */}
      <Link className="goal-link" to="/goals">← Back to your goals</Link>

      {note ? <p className="section-sub" role="status">{note}</p> : null}

      <div className="chips" role="group" aria-label="Filter by area">
        {AREAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`chip ${chosen.includes(a.id) ? 'chip-on' : ''}`}
            aria-pressed={chosen.includes(a.id)}
            onClick={() => toggleArea(a.id)}
          >
            {a.name}
          </button>
        ))}
      </div>

      {ideas.length === 0 ? (
        <section className="empty">
          <p>You have taken everything here.</p>
          <p className="empty-sub">
            Either widen the areas above, or write one in your own words on{' '}
            <Link to="/goals">Goals</Link> — the catalogue is a starting point, not
            the limit.
          </p>
        </section>
      ) : (
        <ul className="idea-list">
          {ideas.slice(0, shown).map((idea) => {
            const area = areaById(idea.area);
            return (
              <li className="idea" key={idea.id}>
                <div className="idea-body">
                  <div className="idea-title">{idea.title}</div>
                  <div className="idea-meta">
                    {area ? (
                      <span className="idea-area">
                        <Icon name={area.icon} /> {area.name}
                      </span>
                    ) : null}
                    <span className="idea-difficulty">{idea.difficulty}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="idea-add"
                  onClick={() => adopt(idea.id, idea.title)}
                  aria-label={`Add ${idea.title} to your goals`}
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {ideas.length > shown ? (
        <button type="button" className="chip" onClick={() => setShown(shown + PAGE)}>
          Show more ({ideas.length - shown} left)
        </button>
      ) : null}

    </div>
  );
}
