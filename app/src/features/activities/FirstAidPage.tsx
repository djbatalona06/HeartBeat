import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTINES, SIGNPOST } from '../../domain/selfcare/firstAid';

/**
 * First aid, for somebody's worst hour.
 *
 * Three rules, each of which cost something — see the note at the top of
 * `domain/selfcare/firstAid.ts`. It stores nothing at all, it works before
 * pairing, and it is honest that it is not a crisis service.
 *
 * The screen opens with every routine collapsed and the signpost visible.
 * That ordering is deliberate: somebody arriving here is not in a state to
 * read five routines and choose well, so what they see first is one line about
 * when to reach for each, and the way to a real person.
 */
export function FirstAidPage() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">First aid</h1>
        <p className="page-sub">
          A few things to do with your hands. Nothing here is saved or shared.
        </p>
      </header>

      <Link className="goal-link" to="/activities">← Activities</Link>

      {/* Above the routines, not below them. Somebody who needs this most is
          least likely to scroll for it. */}
      <section className="panel first-aid-signpost">
        <h2 className="section-title">{SIGNPOST.title}</h2>
        <p className="section-sub">{SIGNPOST.body}</p>
      </section>

      {ROUTINES.map((routine) => {
        const isOpen = open === routine.id;
        return (
          <section className="panel" key={routine.id}>
            <button
              type="button"
              className="first-aid-head"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : routine.id)}
            >
              <span className="section-title">{routine.name}</span>
              <span className="section-sub">{routine.when}</span>
            </button>

            {isOpen ? (
              <ol className="first-aid-steps">
                {routine.steps.map((step) => (
                  <li className="first-aid-step" key={step.title}>
                    <span className="first-aid-step-title">{step.title}</span>
                    <span className="first-aid-step-body">{step.body}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
