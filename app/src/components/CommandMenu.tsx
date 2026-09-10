import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../db/database';
import { askAbout } from '../pwa/api';

/**
 * Everything in the app, one search away — and a question when nothing matches.
 *
 * This is the *Command Menu 5* block from React Bits Pro, built here for the
 * same reason `DeadlinePicker` was: the registry is a paid namespace this repo
 * has no key for, and installing it would have meant grafting Tailwind and
 * Radix onto a hand-written stylesheet driven by a runtime theme engine.
 *
 * The fallback is the interesting half. A palette that finds nothing usually
 * says "no results", which is the least useful thing it could say. This one
 * offers to ask instead — and the answer comes from the couple's own record,
 * through /api/ask, so "when did we last do legs?" is answerable.
 *
 * It is opened by a button as well as by ⌘K, because this is a phone app first
 * and a phone has no ⌘K. The button sits beside the message pill, which is
 * where a persistent control already lives on every screen.
 */

interface Command {
  id: string;
  label: string;
  hint: string;
  to: string;
}

/** Every place the app can go, including the two that are not tabs. */
const COMMANDS: Command[] = [
  { id: 'home', label: 'Home', hint: 'The dashboard', to: '/' },
  { id: 'tasks', label: 'Tasks', hint: 'Dailies, habits and to-dos', to: '/tasks' },
  { id: 'mood', label: 'Mood', hint: 'Three meters, the cycle log, something sweet', to: '/mood' },
  { id: 'move', label: 'Move', hint: 'Workouts and proof', to: '/exercise' },
  { id: 'work', label: 'Work', hint: 'The shared calendar', to: '/work' },
  { id: 'party', label: 'Party', hint: 'The pet, gear and boss fights', to: '/party' },
  // Still here by name, because that is what someone types. It leads to the
  // section of Mood the log became rather than to a page of its own.
  { id: 'cycle', label: 'Cycle', hint: 'The log, at the foot of Mood', to: '/mood' },
  { id: 'settings', label: 'Settings', hint: 'Pairing, theme, notifications', to: '/settings' },
];

/** Sub-sequence matching, so "wk" finds Work and "st" finds Settings. */
export function fuzzyScore(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let score = 0;
  let at = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, at);
    if (found === -1) return null;
    // A run of adjacent characters beats the same letters scattered about.
    score += found === at ? 2 : 1;
    at = found + 1;
  }
  // A shorter target matching the same query is the better match.
  return score - t.length * 0.01;
}

export function rank(query: string, commands: Command[]): Command[] {
  if (!query.trim()) return commands;
  return commands
    .map((c) => ({ c, s: Math.max(fuzzyScore(query, c.label) ?? -Infinity, (fuzzyScore(query, c.hint) ?? -Infinity) - 1) }))
    .filter((x) => x.s > -Infinity)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

export function CommandMenu() {
  // `loadSettings` as the whole callback, never called from inside a larger
  // one: doing that re-fires the query up to 20x per foreground cycle, which
  // for this component would be a re-render per frame. See CLAUDE.md.
  const token = useLiveQuery(loadSettings, [])?.workerSecret;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const matches = useMemo(() => rank(query, COMMANDS), [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setAnswer(null);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
      }
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function go(to: string) {
    close();
    navigate(to);
  }

  async function ask() {
    if (!token || !query.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      setAnswer(await askAbout(query.trim(), token));
    } catch {
      setAnswer('That did not come back. Try again in a moment.');
    } finally {
      setAsking(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="cmd-pill"
        onClick={() => setOpen(true)}
        aria-label="Search and ask"
      >
        <span aria-hidden="true">⌕</span>
      </button>
    );
  }

  return (
    <div className="cmd-scrim" role="dialog" aria-modal="true" aria-label="Search and ask" onClick={close}>
      <div className="cmd" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="cmd-input"
          value={query}
          placeholder="Go somewhere, or ask a question"
          aria-label="Search or ask"
          onChange={(e) => {
            setQuery(e.target.value);
            setAnswer(null);
          }}
          onKeyDown={(e) => {
            // Enter takes the top match, or asks when there is none — which is
            // the whole point of the fallback.
            if (e.key !== 'Enter') return;
            if (matches.length > 0) go(matches[0].to);
            else void ask();
          }}
        />

        {matches.length > 0 ? (
          <ul className="cmd-list">
            {matches.map((command) => (
              <li key={command.id}>
                <button type="button" className="cmd-item" onClick={() => go(command.to)}>
                  <span className="cmd-item-label">{command.label}</span>
                  <span className="cmd-item-hint">{command.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="cmd-ask">
            {/* Nothing matched. "No results" is the least useful thing a
                palette can say, so it offers the question instead. */}
            <p className="cmd-ask-lead">Nothing goes by that name.</p>
            <button type="button" className="cmd-ask-button" onClick={ask} disabled={asking || !token}>
              {asking ? 'Looking…' : `Ask about “${query.trim()}”`}
            </button>
            {answer ? <p className="cmd-answer">{answer}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
