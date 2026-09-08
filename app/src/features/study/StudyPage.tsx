import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DECKS } from '../../content/study';
import { todayKey } from '../../domain/day';
import { buildQueue, dueCount, newCount, requeue } from '../../domain/study/queue';
import { QUIZ_LENGTH, TIME_LIMIT_MS, choicesFor, hash, scoreRun } from '../../domain/study/quiz';
import { GRADES } from '../../domain/study/types';
import type {
  Card, CardProgress, Deck, Grade, StudyMode,
} from '../../domain/study/types';
import type { QuizAnswer, QuizResult } from '../../domain/study/quiz';
import type { StudyReceipt, StudyStore } from '../../db/studyStore';
import { DAILY_CARD_CAP } from '../../domain/study/payout';

/**
 * The study screen, and the only component in the app that is mounted twice:
 * once inside the PWA against Dexie, and once inside the standalone HTML file
 * against localStorage. That is why the store and the time zone arrive as props
 * rather than being read from settings — this file must not know that Dexie
 * exists, or the single-file build pulls the whole database in with it.
 */

interface StudyPageProps {
  store: StudyStore;
  timeZone?: string;
  /** Shown under the title in the standalone build, where there is no nav. */
  subtitle?: string;
}

type Stage =
  | { kind: 'picker' }
  | {
    kind: 'review';
    deck: Deck;
    queue: Card[];
    index: number;
    revealed: boolean;
    seen: Card[];
    correct: number;
    /** One second chance per card, so a sitting cannot loop forever. */
    requeued: Set<string>;
    startedAt: number;
  }
  | {
    kind: 'quiz';
    deck: Deck;
    queue: Card[];
    index: number;
    answers: QuizAnswer[];
    chosen: string | null;
    askedAt: number;
  }
  | {
    kind: 'done';
    deck: Deck;
    mode: StudyMode;
    receipt: StudyReceipt;
    reviewed: number;
    result?: QuizResult;
  };

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function StudyPage({ store, timeZone, subtitle }: StudyPageProps) {
  const zone = timeZone ?? browserZone();
  const day = todayKey(zone);

  const [progress, setProgress] = useState<Map<string, CardProgress>>(new Map());
  const [paid, setPaid] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: 'picker' });

  const refresh = useCallback(async () => {
    const [all, today] = await Promise.all([store.progressAll(), store.paidToday(day)]);
    setProgress(all);
    setPaid(today);
  }, [store, day]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (stage.kind === 'picker') {
    return (
      <div className="page">
        <header className="page-head">
          <h1 className="page-title">Study</h1>
          <p className="page-sub">{subtitle ?? capLine(paid)}</p>
        </header>
        <DeckPicker
          progress={progress}
          day={day}
          onStart={(deck, mode) => setStage(begin(deck, mode, progress, day))}
        />
      </div>
    );
  }

  if (stage.kind === 'done') {
    return (
      <div className="page">
        <header className="page-head">
          <h1 className="page-title">{stage.deck.title}</h1>
          <p className="page-sub">That is the sitting done.</p>
        </header>
        <Summary
          stage={stage}
          onAgain={() => { void refresh(); setStage({ kind: 'picker' }); }}
        />
      </div>
    );
  }

  /**
   * Stopping early still pays for what was actually done.
   *
   * The alternative — pay only a completed sitting — makes the honest choice to
   * stop at eight cards worth less than grinding through forty, which is the
   * one incentive this whole layer is built to avoid. Every card seen was seen.
   */
  async function quit(active: Extract<Stage, { kind: 'review' | 'quiz' }>) {
    const seen = active.kind === 'review'
      ? active.seen
      : active.queue.slice(0, active.answers.length);
    const correct = active.kind === 'review'
      ? active.correct
      : active.answers.filter((a) => a.correct).length;

    if (seen.length > 0) {
      await store.finish({
        deckId: active.deck.id,
        day,
        mode: active.kind,
        reviewed: seen,
        correct,
        elapsedMs: Date.now() - (active.kind === 'review' ? active.startedAt : active.askedAt),
      });
    }
    await refresh();
    setStage({ kind: 'picker' });
  }

  return (
    <div className="page">
      <SessionHead
        deck={stage.deck}
        index={stage.index}
        total={stage.queue.length}
        onQuit={() => void quit(stage)}
      />
      {stage.kind === 'review' ? (
        <ReviewRun
          stage={stage}
          store={store}
          day={day}
          onStage={setStage}
          onDone={(next) => { void refresh(); setStage(next); }}
        />
      ) : (
        <QuizRun
          stage={stage}
          store={store}
          day={day}
          onStage={setStage}
          onDone={(next) => { void refresh(); setStage(next); }}
        />
      )}
    </div>
  );
}

function capLine(paid: number): string {
  const left = Math.max(0, DAILY_CARD_CAP - paid);
  if (paid === 0) return 'Pick a deck. Whatever is due comes first.';
  if (left === 0) return `${paid} cards today. Past the cap, so the rest is for its own sake.`;
  return `${paid} cards today. ${left} still count toward the pet.`;
}

/** Which cards a sitting opens with, and in which mode. */
function begin(deck: Deck, mode: StudyMode, progress: Map<string, CardProgress>, day: string): Stage {
  const queue = buildQueue(deck, progress, day);

  if (mode === 'review') {
    return {
      kind: 'review',
      deck,
      queue,
      index: 0,
      revealed: false,
      seen: [],
      correct: 0,
      requeued: new Set(),
      startedAt: Date.now(),
    };
  }

  // A quiz is practice, so it runs even when nothing is due. Falling back to a
  // window of the deck offset by the date means two quizzes on two days are not
  // the same ten questions.
  const source = queue.length > 0 ? queue : rotate(deck.cards, hash(day) % deck.cards.length);
  return {
    kind: 'quiz',
    deck,
    queue: source.slice(0, QUIZ_LENGTH),
    index: 0,
    answers: [],
    chosen: null,
    askedAt: Date.now(),
  };
}

function rotate<T>(items: T[], by: number): T[] {
  if (items.length === 0) return items;
  const at = by % items.length;
  return [...items.slice(at), ...items.slice(0, at)];
}

function DeckPicker({ progress, day, onStart }: {
  progress: Map<string, CardProgress>;
  day: string;
  onStart: (deck: Deck, mode: StudyMode) => void;
}) {
  return (
    <div className="deck-list">
      {DECKS.map((deck) => {
        const due = dueCount(deck, progress, day);
        const fresh = newCount(deck, progress);
        return (
          <section className="deck" key={deck.id}>
            <div className="deck-head">
              <h2 className="deck-title">{deck.title}</h2>
              <span className="deck-count">{deck.cards.length}</span>
            </div>
            <p className="deck-blurb">{deck.blurb}</p>
            <p className="deck-state">{stateLine(due, fresh, deck.cards.length)}</p>
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => onStart(deck, 'review')}
                disabled={due === 0 && fresh === 0}
              >
                {due > 0 ? 'Review' : 'Start'}
              </button>
              <button type="button" className="quiet" onClick={() => onStart(deck, 'quiz')}>
                Quiz
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function stateLine(due: number, fresh: number, total: number): string {
  if (due === 0 && fresh === 0) return `All ${total} learnt and none due. Come back when they are.`;
  if (due === 0) return `${fresh} not met yet.`;
  if (fresh === 0) return `${due} due.`;
  return `${due} due, ${fresh} not met yet.`;
}

function SessionHead({ deck, index, total, onQuit }: {
  deck: Deck; index: number; total: number; onQuit: () => void;
}) {
  const pct = total === 0 ? 0 : (index / total) * 100;
  return (
    <header className="page-head">
      <div className="session-head">
        <h1 className="page-title">{deck.title}</h1>
        <button type="button" className="session-quit" onClick={onQuit}>Stop</button>
      </div>
      <div
        className="bar"
        role="meter"
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Cards done"
      >
        <div className="bar-fill bar-fill-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="page-sub">{index} of {total}</p>
    </header>
  );
}

function ReviewRun({ stage, store, day, onStage, onDone }: {
  stage: Extract<Stage, { kind: 'review' }>;
  store: StudyStore;
  day: string;
  onStage: (stage: Stage) => void;
  onDone: (stage: Stage) => void;
}) {
  const card = stage.queue[stage.index];
  const busy = useRef(false);

  const finish = useCallback(async (seen: Card[], correct: number) => {
    const receipt = await store.finish({
      deckId: stage.deck.id,
      day,
      mode: 'review',
      reviewed: seen,
      correct,
      elapsedMs: Date.now() - stage.startedAt,
    });
    onDone({ kind: 'done', deck: stage.deck, mode: 'review', receipt, reviewed: seen.length });
  }, [store, day, stage.deck, stage.startedAt, onDone]);

  useEffect(() => {
    // An empty queue is a finished sitting, not a broken screen — it happens
    // when the last card of a deck was graded and nothing else came due.
    if (!card && stage.seen.length === 0) onStage({ kind: 'picker' });
  }, [card, stage.seen.length, onStage]);

  if (!card) return null;

  async function onGrade(grade: Grade) {
    if (busy.current) return;
    busy.current = true;
    try {
      await store.grade(card, grade, day);

      const seen = [...stage.seen, card];
      const correct = stage.correct + (grade === 'good' || grade === 'easy' ? 1 : 0);

      // One second chance per card. Without the guard, `again` on a card you
      // genuinely cannot recall keeps it in front of you forever.
      const retry = grade === 'again' && !stage.requeued.has(card.id);
      if (retry) {
        onStage({
          ...stage,
          queue: requeue(stage.queue, stage.index),
          revealed: false,
          seen,
          correct,
          requeued: new Set(stage.requeued).add(card.id),
        });
        return;
      }

      const next = stage.index + 1;
      if (next >= stage.queue.length) {
        await finish(seen, correct);
        return;
      }
      onStage({ ...stage, index: next, revealed: false, seen, correct });
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      <section className="card-face">
        <p className="card-question">{card.question}</p>
        {stage.revealed ? (
          <>
            <hr className="card-rule" />
            <p className="card-answer">{card.answer}</p>
            <p className="card-why">{card.why}</p>
          </>
        ) : null}
      </section>

      {stage.revealed ? (
        <div className="grades" role="group" aria-label="How did that go">
          {GRADES.map((grade) => (
            <button
              key={grade}
              type="button"
              className={`grade grade-${grade}`}
              // Spelt out rather than left to be assembled from the two spans:
              // read aloud, "Again later today" is ambiguous about which half
              // is the verdict and which is the consequence.
              aria-label={`${GRADE_LABEL[grade]} — show it ${GRADE_HINT[grade]}`}
              onClick={() => void onGrade(grade)}
            >
              <span className="grade-label">{GRADE_LABEL[grade]}</span>
              <span className="grade-hint">{GRADE_HINT[grade]}</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="primary"
          onClick={() => onStage({ ...stage, revealed: true })}
        >
          Show the answer
        </button>
      )}
    </>
  );
}

const GRADE_LABEL: Record<Grade, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Got it',
  easy: 'Easy',
};

/**
 * The hints matter more than they look. The four buttons are a self-assessment,
 * and people press the wrong one when the labels imply a verdict rather than a
 * schedule — so each says what it will do, not how well you did.
 */
const GRADE_HINT: Record<Grade, string> = {
  again: 'later today',
  hard: 'soon',
  good: 'on schedule',
  easy: 'much later',
};

function QuizRun({ stage, store, day, onStage, onDone }: {
  stage: Extract<Stage, { kind: 'quiz' }>;
  store: StudyStore;
  day: string;
  onStage: (stage: Stage) => void;
  onDone: (stage: Stage) => void;
}) {
  const card = stage.queue[stage.index];
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);

  const options = useMemo(
    () => (card ? choicesFor(card, stage.deck) : []),
    [card, stage.deck],
  );

  const answer = useCallback(async (chosen: string | null) => {
    if (busy.current || !card) return;
    busy.current = true;
    try {
      const elapsedMs = Date.now() - stage.askedAt;
      const correct = chosen === card.answer;

      // A quiz answer is still a review — it schedules the card. Getting it
      // right quickly is `good`; wrong is `again`, which is the same signal a
      // blank would have given.
      await store.grade(card, correct ? 'good' : 'again', day);

      const answers = [...stage.answers, { cardId: card.id, correct, elapsedMs }];
      onStage({ ...stage, chosen: chosen ?? '', answers });
    } finally {
      busy.current = false;
    }
  }, [card, stage, store, day, onStage]);

  // The clock. Ticking in state rather than in the DOM keeps the countdown and
  // the auto-miss reading from the same value.
  useEffect(() => {
    if (stage.chosen !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [stage.chosen, stage.index]);

  const elapsed = now - stage.askedAt;
  const outOfTime = elapsed >= TIME_LIMIT_MS;

  useEffect(() => {
    if (stage.chosen === null && outOfTime) void answer(null);
  }, [outOfTime, stage.chosen, answer]);

  if (!card) return null;

  async function next() {
    const done = stage.index + 1 >= stage.queue.length;
    if (!done) {
      onStage({ ...stage, index: stage.index + 1, chosen: null, askedAt: Date.now() });
      setNow(Date.now());
      return;
    }
    const result = scoreRun(stage.answers);
    const receipt = await store.finish({
      deckId: stage.deck.id,
      day,
      mode: 'quiz',
      reviewed: stage.queue.slice(0, stage.answers.length),
      correct: result.correct,
      elapsedMs: result.elapsedMs,
    });
    onDone({
      kind: 'done',
      deck: stage.deck,
      mode: 'quiz',
      receipt,
      reviewed: stage.answers.length,
      result,
    });
  }

  const answered = stage.chosen !== null;
  const left = Math.max(0, Math.ceil((TIME_LIMIT_MS - elapsed) / 1000));

  return (
    <>
      <section className="card-face">
        <div className="quiz-clock" aria-label={`${left} seconds left`}>
          {answered ? '—' : `${left}s`}
        </div>
        <p className="card-question">{card.question}</p>
      </section>

      <div className="choices" role="group" aria-label="Answers">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`choice ${choiceClass(option, card.answer, stage.chosen)}`}
            onClick={() => void answer(option)}
            disabled={answered}
          >
            {option}
          </button>
        ))}
      </div>

      {answered ? (
        <>
          <p className="card-why">{card.why}</p>
          <button type="button" className="primary" onClick={() => void next()}>
            {stage.index + 1 >= stage.queue.length ? 'Finish' : 'Next'}
          </button>
        </>
      ) : null}
    </>
  );
}

function choiceClass(option: string, answer: string, chosen: string | null): string {
  if (chosen === null) return '';
  if (option === answer) return 'choice-right';
  return option === chosen ? 'choice-wrong' : 'choice-past';
}

function Summary({ stage, onAgain }: {
  stage: Extract<Stage, { kind: 'done' }>;
  onAgain: () => void;
}) {
  const { receipt, result } = stage;
  return (
    <>
      <section className="sheet">
        <div className="sheet-stage">{stage.reviewed} cards</div>
        {result ? (
          <p className="sheet-blurb">
            {result.correct} of {result.asked} right
            {result.bestStreak > 1 ? `, ${result.bestStreak} in a row` : ''} · {result.points} points
          </p>
        ) : (
          <p className="sheet-blurb">Everything you saw has been scheduled.</p>
        )}

        <div className="receipt" role="status">
          {receipt.paid > 0 ? (
            <>
              <span className="receipt-payout">
                +{receipt.payout.xp} XP · +{receipt.payout.energy} energy · +{receipt.payout.coins} coins
              </span>
              {receipt.levelAfter > receipt.levelBefore ? (
                <span className="receipt-level">Level {receipt.levelAfter}.</span>
              ) : null}
            </>
          ) : (
            <span>Past today&rsquo;s cap, so this one was for its own sake.</span>
          )}
        </div>
      </section>

      <button type="button" className="primary" onClick={onAgain}>Back to the decks</button>
    </>
  );
}
