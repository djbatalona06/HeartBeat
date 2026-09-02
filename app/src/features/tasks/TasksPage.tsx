import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { QuestBoard } from '../quests/QuestBoard';
import { db, loadSettings } from '../../db/database';
import { VoiceInput } from '../../components/VoiceInput';
import { parseTask } from '../../domain/voice/parseTask';
import {
  archiveTask,
  completeTask,
  ensureIdentity,
  getOrCreateAvatar,
  logHabitDown,
  putTask,
  settleTasks,
  type CompletionReceipt,
} from '../../db/repository';
import { todayKey } from '../../domain/day';
import { isCompletedOn, isDue, toneFor, toneLine } from '../../domain/rpg/task';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import { gearBonus } from '../../domain/rpg/gear';
import { nextStageLevel } from '../../domain/rpg/stage';
import {
  DIFFICULTY_WEIGHT,
  type Avatar,
  type Task,
  type TaskDifficulty,
  type TaskType,
} from '../../domain/rpg/types';
import { DEFAULT_TIMEZONE } from '../../domain/types';

const DIFFICULTIES = Object.keys(DIFFICULTY_WEIGHT) as TaskDifficulty[];

const SECTIONS: Array<{ type: TaskType; title: string; sub: string }> = [
  { type: 'daily', title: 'Today', sub: 'Comes back tomorrow either way.' },
  { type: 'habit', title: 'Habits', sub: 'As often as it happens.' },
  { type: 'todo', title: 'To-do', sub: 'Once, and then it is done.' },
];

/**
 * The Tasks page. Habitica's three kinds of task, Finch's manner of talking
 * about them.
 *
 * Nothing on this screen can go down. A Daily left undone is not marked in red
 * and costs nothing — it simply moves up the list, because the value curve has
 * quietly made it worth more. That is the whole ruling, rendered.
 */
export function TasksPage() {
  const settings = useLiveQuery(loadSettings, []);
  const timeZone = settings?.timeZone ?? DEFAULT_TIMEZONE;
  const day = todayKey(timeZone);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const [receipt, setReceipt] = useState<CompletionReceipt | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // The sheet has to exist before the first completion, or a fresh install
  // shows a page with no character on it and no way to tell that is temporary.
  useEffect(() => {
    let live = true;
    ensureIdentity()
      .then(async (next) => {
        await getOrCreateAvatar(next.memberId, next.coupleId);
        if (live) setIdentity(next);
      });
    return () => { live = false; };
  }, []);

  // Walk every Daily forward to yesterday. Idempotent, so running it on every
  // mount and every day rollover is free.
  useEffect(() => {
    if (identity) void settleTasks(identity.memberId, day);
  }, [identity, day]);

  const tasks = useLiveQuery(
    async () => (identity
      ? db.tasks.where('memberId').equals(identity.memberId).toArray()
      : ([] as Task[])),
    [identity?.memberId],
  );

  const avatar = useLiveQuery(
    async () => (identity ? db.avatars.get(identity.memberId) : undefined),
    [identity?.memberId],
  );

  const live = useMemo(
    () => (tasks ?? []).filter((t) => !t.archivedAt),
    [tasks],
  );

  // A receipt is a moment, not a state. It clears itself.
  useEffect(() => {
    if (!receipt && !note) return;
    const timer = setTimeout(() => { setReceipt(null); setNote(null); }, 4200);
    return () => clearTimeout(timer);
  }, [receipt, note]);

  async function onComplete(task: Task) {
    const result = await completeTask(task.id, day);
    if (result) setReceipt(result);
    else setNote('Already ticked off today. It comes back tomorrow.');
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Tasks</h1>
        <p className="page-sub">
          {live.length ? 'Whatever has been waiting longest is at the top.' : 'Nothing here yet.'}
        </p>
      </header>

      {avatar ? <CharacterCard avatar={avatar} /> : null}

      {identity ? <QuestBoard coupleId={identity.coupleId} day={day} /> : null}

      {SECTIONS.map((section) => (
        <Section
          key={section.type}
          title={section.title}
          sub={section.sub}
          type={section.type}
          day={day}
          tasks={live.filter((t) => t.type === section.type)}
          onComplete={onComplete}
          onDown={(task) => logHabitDown(task.id)}
          onArchive={(task) => archiveTask(task.id)}
        />
      ))}

      {identity ? (
        <AddTask
          onAdd={(draft) => putTask({ ...identity, ...draft }, day)}
        />
      ) : null}

      <Receipt receipt={receipt} note={note} />
    </div>
  );
}

/** Level, stage, and the two pools you spend. Derived, every one of them. */
function CharacterCard({ avatar }: { avatar: Avatar }) {
  const level = levelOf(avatar);
  const sheet = sheetFor(avatar, gearBonus(avatar.gear, level));
  const next = nextStageLevel(level);

  return (
    <section className="sheet">
      <div className="sheet-head">
        <div>
          <div className="sheet-stage">{sheet.stage.name}</div>
          <div className="sheet-level">Level {sheet.level}</div>
        </div>
        <Link className="sheet-party" to="/party">Party →</Link>
      </div>

      <p className="sheet-blurb">{sheet.stage.blurb}</p>

      <Bar label="XP" value={sheet.progress.into} max={sheet.progress.needed} tint="accent" />
      <Bar label="Energy" value={sheet.energy} max={sheet.maxEnergy} tint="success" />
      <Bar label="MP" value={sheet.mp} max={sheet.maxMp} tint="accent" />

      <div className="sheet-foot">
        <span>{sheet.coins} coins</span>
        {next ? <span>{sheet.stage.name} until level {next}</span> : <span>Fully grown</span>}
      </div>
    </section>
  );
}

function Bar({ label, value, max, tint }: {
  label: string; value: number; max: number; tint: 'accent' | 'success';
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`bar-fill bar-fill-${tint}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-value">{value}/{max}</span>
    </div>
  );
}

function Section({ title, sub, type, tasks, day, onComplete, onDown, onArchive }: {
  title: string;
  sub: string;
  type: TaskType;
  tasks: Task[];
  day: string;
  onComplete: (task: Task) => void;
  onDown: (task: Task) => void;
  onArchive: (task: Task) => void;
}) {
  // Whatever has been waiting longest first: the list itself is the nudge.
  const ordered = [...tasks].sort((a, b) => a.value - b.value);
  if (!ordered.length) return null;

  return (
    <section className="task-section">
      <h2 className="section-title">{title}</h2>
      <p className="section-sub">{sub}</p>
      <ul className="task-list">
        {ordered.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            day={day}
            showDown={type === 'habit'}
            onComplete={onComplete}
            onDown={onDown}
            onArchive={onArchive}
          />
        ))}
      </ul>
    </section>
  );
}

function TaskRow({ task, day, showDown, onComplete, onDown, onArchive }: {
  task: Task;
  day: string;
  showDown: boolean;
  onComplete: (task: Task) => void;
  onDown: (task: Task) => void;
  onArchive: (task: Task) => void;
}) {
  const done = task.type !== 'habit' && isCompletedOn(task, day);
  const dueToday = task.type !== 'daily' || isDue(task, day);

  return (
    <li className={`task ${done ? 'task-done' : ''}`} data-tone={toneFor(task.value)}>
      <button
        type="button"
        className="task-tick"
        onClick={() => onComplete(task)}
        aria-label={done ? `${task.title}, done today` : `Complete ${task.title}`}
        disabled={done}
      >
        {done ? '✓' : '+'}
      </button>

      <div className="task-body">
        <div className="task-title">{task.title}</div>
        <div className="task-line">
          {done ? 'Done today.' : dueToday ? toneLine(task.value) : 'Not due today.'}
        </div>
        {task.streak > 1 && !done ? (
          <div className="task-streak">{task.streak} in a row</div>
        ) : null}
      </div>

      {showDown ? (
        <button
          type="button"
          className="task-down"
          onClick={() => onDown(task)}
          aria-label={`Log a slip on ${task.title}`}
          title="Records the slip. Costs nothing."
        >
          −
        </button>
      ) : (
        <button
          type="button"
          className="task-down"
          onClick={() => onArchive(task)}
          aria-label={`Put ${task.title} away`}
          title="Put it away"
        >
          ×
        </button>
      )}
    </li>
  );
}

/** One primary action, and it is not visible until you ask for it. */
function AddTask({ onAdd }: {
  onAdd: (draft: { type: TaskType; title: string; difficulty: TaskDifficulty }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('daily');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('easy');
  const [heard, setHeard] = useState<string | null>(null);

  // Speech fills the form rather than submitting it. The parser is good but it
  // is guessing, and a task that saves itself from a misheard sentence is
  // worse than one you glance at first.
  const applyTranscript = (text: string) => {
    if (!text.trim()) return;
    const intent = parseTask(text);
    setTitle(intent.title);
    setType(intent.type);
    setDifficulty(intent.difficulty);
    setHeard(text.trim());
    setOpen(true);
  };

  if (!open) {
    return (
      <>
        <button type="button" className="primary" onClick={() => setOpen(true)}>
          Add something
        </button>
        <VoiceInput
          onTranscript={applyTranscript}
          label="Say it instead"
          hint="“a daily habit, drink water, easy”"
        />
      </>
    );
  }

  return (
    <form
      className="add-task"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        await onAdd({ type, title: trimmed, difficulty });
        setTitle('');
        setHeard(null);
        setOpen(false);
      }}
    >
      <input
        className="field"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What is it?"
        aria-label="Task name"
        autoFocus
      />

      {heard ? (
        <p className="heard">
          Heard: <q>{heard}</q>
        </p>
      ) : null}

      <div className="chips" role="radiogroup" aria-label="Kind">
        {SECTIONS.map((section) => (
          <button
            key={section.type}
            type="button"
            role="radio"
            aria-checked={type === section.type}
            className={`chip ${type === section.type ? 'chip-on' : ''}`}
            onClick={() => setType(section.type)}
          >
            {section.title}
          </button>
        ))}
      </div>

      <div className="chips" role="radiogroup" aria-label="How hard">
        {DIFFICULTIES.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={difficulty === level}
            className={`chip ${difficulty === level ? 'chip-on' : ''}`}
            onClick={() => setDifficulty(level)}
          >
            {level}
          </button>
        ))}
      </div>

      <VoiceInput
        onTranscript={applyTranscript}
        label={heard ? 'Say it again' : 'Say it instead'}
      />

      <div className="row">
        <button type="submit" className="primary">Add it</button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setOpen(false);
            setHeard(null);
          }}
        >
          Not now
        </button>
      </div>
    </form>
  );
}

function Receipt({ receipt, note }: { receipt: CompletionReceipt | null; note: string | null }) {
  if (!receipt && !note) return null;
  return (
    <div className="receipt" role="status">
      {note ? <span>{note}</span> : null}
      {receipt ? (
        <>
          <span className="receipt-payout">
            +{receipt.payout.xp} XP · +{receipt.payout.energy} energy · +{receipt.payout.coins} coins
          </span>
          {receipt.levelAfter > receipt.levelBefore ? (
            <span className="receipt-level">Level {receipt.levelAfter}.</span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
