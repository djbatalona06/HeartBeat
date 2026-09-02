import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import {
  measureQuest,
  reconcileQuests,
  retireQuest,
  startQuest,
  suggestQuests,
} from '../../db/repository';
import { daysLeft, shapeOf } from '../../domain/quests/engine';
import {
  QUEST_DIFFICULTIES,
  shapeFor,
  templateById,
  type QuestShape,
} from '../../domain/quests/templates';
import type { Quest, QuestDifficulty } from '../../domain/types';

/**
 * The week's quest.
 *
 * A thin renderer: `domain/quests/` decides everything and `reconcileQuests` is
 * the only write. One quest at a time, so this is a card rather than a list —
 * a list of quests is a backlog, and the point of a quest is that it is the
 * thing you are doing this week.
 */
export function QuestBoard({ coupleId, day }: { coupleId: string; day: string }) {
  const quests = useLiveQuery(
    async () => db.quests.where('coupleId').equals(coupleId).toArray(),
    [coupleId],
  );

  /**
   * Reads the tables the running quest counts, which is the point: Dexie
   * re-fires a live query when anything it read changes, so logging a workout
   * lands here and the effect below reconciles. Watching only `quests` would
   * mean the quest sat still until something else wrote to it — which, since
   * the reconcile is the only thing that does, is never.
   */
  const reading = useLiveQuery(async () => measureQuest(coupleId), [coupleId]);

  const running = quests?.find((q) => !q.completedAt && !q.retiredAt);
  const done = (quests ?? []).filter((q) => q.completedAt || q.retiredAt);

  /**
   * Progress is measured, not incremented, so it is brought up to date on
   * arrival and whenever the count changes. The write is idempotent and does
   * nothing when nothing moved, so re-running on its own writes costs a read.
   */
  useEffect(() => {
    if (!coupleId || !reading) return;
    void reconcileQuests(coupleId, day);
  }, [coupleId, day, reading?.measured, reading?.quest?.id]);

  if (!quests) return null;

  return (
    <section className="quest">
      <h2 className="quest-title">This week</h2>
      {running
        ? <Running quest={running} day={day} onRetire={() => void retireQuest(running.id)} />
        : <Picker coupleId={coupleId} day={day} />}
      {done.length ? <Past quests={done} /> : null}
    </section>
  );
}

function Running({ quest, day, onRetire }: { quest: Quest; day: string; onRetire: () => void }) {
  const shape = shapeOf(quest);
  const fraction = quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 1;
  const left = daysLeft(quest, day);

  return (
    <div className="quest-card">
      <div className="quest-head">
        <span className="quest-name">{quest.title}</span>
        <span className="quest-count">{quest.progress}/{quest.target}</span>
      </div>
      {shape ? <p className="quest-blurb">{shape.blurb}</p> : null}
      <div
        className="quest-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quest.target}
        aria-valuenow={quest.progress}
        aria-label={quest.title}
      >
        <span className="quest-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
      <div className="quest-foot">
        <span className="quest-left">
          {left === null ? '' : left > 1 ? `${left} days left` : left === 1 ? 'last day' : 'over'}
        </span>
        <span className="quest-worth">+{quest.xp} XP</span>
      </div>
      {/* Letting one go takes nothing. Said out loud, because in most apps it
          would, and a person cannot be expected to guess that this one is kind. */}
      <button className="quest-drop" type="button" onClick={onRetire}>
        Let this one go — nothing is lost
      </button>
    </div>
  );
}

function Picker({ coupleId, day }: { coupleId: string; day: string }) {
  const [offer, setOffer] = useState<{ difficulty: QuestDifficulty; shapes: QuestShape[] } | null>(null);
  const [difficulty, setDifficulty] = useState<QuestDifficulty | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void suggestQuests(day).then((next) => {
      if (!live) return;
      setOffer(next);
      setDifficulty((current) => current ?? next.difficulty);
    });
    return () => { live = false; };
  }, [day]);

  if (!offer || !difficulty) return null;

  return (
    <div className="quest-pick">
      <p className="quest-lead">Pick one for the week. Nothing happens if it does not finish.</p>

      <div className="quest-dial" role="group" aria-label="How hard">
        {QUEST_DIFFICULTIES.map((level) => (
          <button
            key={level}
            type="button"
            className={level === difficulty ? 'quest-level is-on' : 'quest-level'}
            aria-pressed={level === difficulty}
            onClick={() => setDifficulty(level)}
          >
            {level}
          </button>
        ))}
      </div>

      <ul className="quest-offers">
        {offer.shapes.map((shape) => {
          // The offers were ordered at the suggested difficulty; re-shaping
          // them here is what lets the dial change the numbers without another
          // round trip, and keeps the order the seeding chose.
          const template = templateById(shape.templateId);
          if (!template) return null;
          const target = shapeFor(template, difficulty);
          return (
            <li key={shape.templateId}>
              <button
                className="quest-offer"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await startQuest(coupleId, shape.templateId, difficulty, day);
                  setBusy(false);
                }}
              >
                <span className="quest-offer-name">{target.title}</span>
                <span className="quest-offer-worth">+{target.xp} XP</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Past({ quests }: { quests: Quest[] }) {
  const ordered = [...quests].sort(
    (a, b) => (b.completedAt ?? b.retiredAt ?? 0) - (a.completedAt ?? a.retiredAt ?? 0),
  );
  return (
    <details className="quest-past">
      <summary>Weeks before this one</summary>
      <ul className="quest-past-list">
        {ordered.map((q) => (
          <li className="quest-past-row" key={q.id}>
            <span className="quest-past-name">{q.title}</span>
            <span className={q.completedAt ? 'quest-past-mark is-done' : 'quest-past-mark'}>
              {q.completedAt ? `+${q.xp} XP` : 'let go'}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
