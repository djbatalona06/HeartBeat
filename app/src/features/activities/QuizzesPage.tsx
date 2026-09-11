import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { loadSettings } from '../../db/database';
import { addReflection, ensureIdentity } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { QUIZZES, answeredCount, summarise, type Quiz } from '../../domain/selfcare/quizzes';

/**
 * Short reflective sets that end up in the journal.
 *
 * Nothing is scored. A quiz that hands back a wellbeing number is doing
 * assessment this app is not qualified to do, and it turns a bad week into a
 * bad grade. What these produce is prose — the answers written out as a draft
 * entry you can edit before saving — so the artefact is the same kind of thing
 * as a reflection typed by hand, and lives in the same place.
 */
export function QuizzesPage() {
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

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState('');

  function start(next: Quiz) {
    setQuiz(next);
    setAnswers({});
    setDraft(null);
    setNote('');
  }

  function finish() {
    if (!quiz) return;
    setDraft(summarise(quiz, answers));
  }

  async function save() {
    if (!quiz || !memberId || !coupleId || !draft?.trim()) return;
    const id = await addReflection({
      memberId, coupleId, day, body: draft, promptId: `quiz-${quiz.id}`, prompt: quiz.name,
    });
    setNote(id ? 'Saved to your reflections.' : 'Nothing to save.');
    if (id) { setQuiz(null); setDraft(null); setAnswers({}); }
  }

  if (!quiz) {
    return (
      <div className="page">
        <header className="page-head">
          <h1 className="page-title">Quizzes</h1>
          <p className="page-sub">A few questions. Nothing is scored.</p>
        </header>

        <Link className="goal-link" to="/activities">← Activities</Link>

        <section className="panel">
          <ul className="quiz-list">
            {QUIZZES.map((q) => (
              <li key={q.id}>
                <button type="button" className="quiz-pick" onClick={() => start(q)}>
                  <span className="quiz-name">{q.name}</span>
                  <span className="quiz-blurb">{q.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
          {note ? <p className="section-sub" role="status">{note}</p> : null}
        </section>
      </div>
    );
  }

  const answered = answeredCount(quiz, answers);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">{quiz.name}</h1>
        <p className="page-sub">{answered} of {quiz.questions.length} answered</p>
      </header>

      <button type="button" className="goal-link" onClick={() => setQuiz(null)}>← All quizzes</button>

      {draft === null ? (
        <>
          {quiz.questions.map((question) => (
            <section className="panel" key={question.id}>
              <h2 className="section-title">{question.text}</h2>
              <div className="chips" role="radiogroup" aria-label={question.text}>
                {question.options.map((option, i) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={answers[question.id] === i}
                    className={`chip quiz-option ${answers[question.id] === i ? 'chip-on' : ''}`}
                    onClick={() => setAnswers({ ...answers, [question.id]: i })}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </section>
          ))}

          <button type="button" className="primary" disabled={answered === 0} onClick={finish}>
            {answered < quiz.questions.length ? `Finish with ${answered}` : 'Finish'}
          </button>
        </>
      ) : (
        <section className="panel">
          <h2 className="section-title">Before it is saved</h2>
          <p className="section-sub">
            This goes into your reflections, private like the rest. Edit anything.
          </p>
          <textarea
            className="field reflect-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            aria-label="Your answers"
          />
          <div className="row">
            <button type="button" className="primary" disabled={!draft.trim()} onClick={save}>
              Save it
            </button>
            <button type="button" className="chip" onClick={() => setDraft(null)}>
              Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
