import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, loadSettings } from '../../db/database';
import { addGoal, archiveTask, completeTask, ensureIdentity, groupByArea } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { AREAS, areaById } from '../../domain/rpg/selfCare';
import { AREA_IDS, DIFFICULTY_WEIGHT, type AreaId, type Task, type TaskDifficulty } from '../../domain/rpg/types';
import { Icon } from '../../components/icons';
import { TaskRow } from '../tasks/TasksPage';

const DIFFICULTIES = Object.keys(DIFFICULTY_WEIGHT) as TaskDifficulty[];

/**
 * The goals you chose, filed under the part of your life they belong to.
 *
 * A goal is a `Task` of type `goal` — mechanically a Daily, with an area on it.
 * That is why this screen borrows `TaskRow` from Tasks whole rather than
 * drawing its own: ticking a goal is the same act as ticking a daily, pays
 * through the same `completeTask`, and is refused the same way the second time
 * in a day. Only the grouping is this screen's own.
 */
export function GoalsPage() {
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);

  // Same reason as Tasks, Mood and Home: settings only carries an identity once
  // something has written one, and a fresh install can land here first.
  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  const goals = useLiveQuery(
    async (): Promise<Task[]> => (memberId
      ? db.tasks.where('[memberId+type]').equals([memberId, 'goal']).toArray()
      : []),
    [memberId],
  );

  const [note, setNote] = useState('');
  const grouped = groupByArea(goals ?? []);
  const live = goals?.filter((g) => !g.archivedAt) ?? [];

  async function onComplete(task: Task) {
    const result = await completeTask(task.id, day);
    setNote(result ? '' : 'Already ticked off today. It comes back tomorrow.');
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Goals</h1>
        <p className="page-sub">
          {live.length
            ? `${live.filter((g) => g.lastCompletedOn === day).length} of ${live.length} done today.`
            : 'Nothing set yet — the ideas list is a good place to start.'}
        </p>
      </header>

      <div className="goal-actions">
        <Link className="primary" to="/goals/ideas">Browse ideas</Link>
        <Link className="goal-link" to="/areas">See all areas →</Link>
      </div>

      {live.length === 0 ? (
        <section className="empty">
          <p>No goals yet.</p>
          <p className="empty-sub">
            A goal here is just a small thing you meant to keep doing, filed under
            the part of your life it belongs to. Pick one from the ideas list, or
            write your own below — one is a real start.
          </p>
        </section>
      ) : null}

      {/* Catalogue order, so the sections do not reshuffle as goals are added. */}
      {[...AREA_IDS, 'unfiled' as const].map((key) => {
        const inArea = grouped.get(key) ?? [];
        if (!inArea.length) return null;
        const area = key === 'unfiled' ? undefined : areaById(key);
        return (
          <section className="task-section" key={key}>
            <h2 className="section-title">
              {area ? <span className="goal-area-glyph"><Icon name={area.icon} /></span> : null}
              {area?.name ?? 'Unfiled'}
            </h2>
            <p className="section-sub">{area?.blurb ?? 'Goals without an area yet.'}</p>
            <ul className="task-list">
              {[...inArea].sort((a, b) => a.value - b.value).map((goal) => (
                <TaskRow
                  key={goal.id}
                  task={goal}
                  day={day}
                  showDown={false}
                  onComplete={onComplete}
                  onDown={() => {}}
                  onArchive={(t) => archiveTask(t.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {memberId && coupleId ? (
        <AddGoal
          onAdd={(draft) => addGoal({ memberId, coupleId, ...draft }, day)}
        />
      ) : null}

      {note ? <p className="section-sub" role="status">{note}</p> : null}
    </div>
  );
}

/** Your own words, and the one thing the catalogue cannot supply: the area. */
function AddGoal({ onAdd }: {
  onAdd: (draft: { title: string; area: AreaId; difficulty: TaskDifficulty }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<AreaId>('body');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('easy');

  if (!open) {
    return (
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        Write your own goal
      </button>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    await onAdd({ title: trimmed, area, difficulty });
    setTitle('');
    setOpen(false);
  }

  return (
    <form className="add-task" onSubmit={submit}>
      <input
        className="field"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Something small you meant to keep doing"
        aria-label="Goal name"
        autoFocus
      />

      <div className="chips" role="radiogroup" aria-label="Area">
        {AREAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={area === a.id}
            className={`chip ${area === a.id ? 'chip-on' : ''}`}
            onClick={() => setArea(a.id)}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div className="chips" role="radiogroup" aria-label="How big it feels">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={difficulty === d}
            className={`chip ${difficulty === d ? 'chip-on' : ''}`}
            onClick={() => setDifficulty(d)}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="row">
        <button type="submit" className="primary" disabled={!title.trim()}>Add it</button>
        <button type="button" className="chip" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
