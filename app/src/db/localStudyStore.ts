import { levelForXp } from '../domain/xp';
import { payoutForSession } from '../domain/study/payout';
import { newProgress, review } from '../domain/study/srs';
import type { Card, CardProgress, Grade, StudySession } from '../domain/study/types';
import type { DayKey } from '../domain/types';
import type { FinishInput, StudyReceipt, StudyStore } from './studyStore';

/**
 * The standalone file's store. Same seam, no database, no couple, no pet.
 *
 * **Storage here is allowed to fail, and does.** Opened as a `file://` page —
 * which is the entire point of a single self-contained HTML file — Chrome
 * treats the origin as opaque and `localStorage` *throws* on the first touch
 * rather than returning null. So every read and write goes through a try/catch
 * and falls back to memory, exactly as `ThemeProvider` already does for the
 * theme, and the page keeps working for the length of the sitting.
 *
 * That is why export and import exist: on a file:// page they are the only way
 * progress survives a reload. Served over https, none of this comes up.
 */

const KEY = 'heartbeat.study';
const VERSION = 1;

export interface StudyState {
  version: number;
  progress: Record<string, CardProgress>;
  sessions: StudySession[];
  /**
   * The standalone build has no avatar to credit, so it keeps its own total.
   * The level shown is derived from it with the same curve the app uses, so the
   * two feel like one thing even though they never meet.
   */
  xp: number;
}

function empty(): StudyState {
  return { version: VERSION, progress: {}, sessions: [], xp: 0 };
}

/** True once a write has thrown, so the UI can say why nothing is being kept. */
let volatile = false;

export function isVolatile(): boolean {
  return volatile;
}

function read(): StudyState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<StudyState>;
    // A state from a future version is not merged or migrated — it is ignored,
    // because guessing at a shape written by a build this one has never seen is
    // how you lose the whole record rather than one session.
    if (parsed.version !== VERSION) return empty();
    return {
      version: VERSION,
      progress: parsed.progress ?? {},
      sessions: parsed.sessions ?? [],
      xp: parsed.xp ?? 0,
    };
  } catch {
    volatile = true;
    return empty();
  }
}

function write(state: StudyState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    volatile = true;
  }
}

/**
 * The in-memory copy is the source of truth for the session; localStorage is a
 * best-effort mirror of it. That ordering is what makes a page whose storage
 * throws still behave correctly until it is closed.
 */
let state: StudyState | null = null;

function current(): StudyState {
  if (!state) state = read();
  return state;
}

function commit(next: StudyState): void {
  state = next;
  write(next);
}

function now(): number {
  return Date.now();
}

function id(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // file:// in older browsers, and any context without a secure origin.
    return `s-${now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export const localStudyStore: StudyStore = {
  async progressFor(deckId) {
    const rows = Object.values(current().progress).filter((row) => row.deckId === deckId);
    return new Map(rows.map((row) => [row.cardId, row]));
  },

  async progressAll() {
    return new Map(Object.entries(current().progress));
  },

  async grade(card: Pick<Card, 'id' | 'deckId'>, grade: Grade, day: DayKey) {
    const state = current();
    const before = state.progress[card.id] ?? newProgress(card, day, now());
    const after = review(before, grade, day, now());
    commit({ ...state, progress: { ...state.progress, [card.id]: after } });
    return after;
  },

  async paidToday(day: DayKey) {
    return current().sessions
      .filter((session) => session.day === day)
      .reduce((sum, session) => sum + session.paid, 0);
  },

  async sessionsOn(day: DayKey) {
    return current().sessions
      .filter((session) => session.day === day)
      .sort((a, b) => a.finishedAt - b.finishedAt);
  },

  async finish(input: FinishInput): Promise<StudyReceipt> {
    const state = current();
    const already = state.sessions
      .filter((session) => session.day === input.day)
      .reduce((sum, session) => sum + session.paid, 0);

    const { payout, paid } = payoutForSession(input.reviewed, already);

    const session: StudySession = {
      id: id(),
      deckId: input.deckId,
      day: input.day,
      mode: input.mode,
      reviewed: input.reviewed.length,
      correct: input.correct,
      paid,
      elapsedMs: input.elapsedMs,
      finishedAt: now(),
    };

    const levelBefore = levelForXp(state.xp);
    const xp = state.xp + payout.xp;

    // Sessions are kept for the daily cap, so only the recent ones matter. A
    // page that runs for a year should not carry a year of them in one string.
    const sessions = [...state.sessions, session].slice(-200);
    commit({ ...state, sessions, xp });

    return { payout, paid, levelBefore, levelAfter: levelForXp(xp) };
  },
};

/* -- taking it with you ------------------------------------------------------ */

export function exportState(): string {
  return JSON.stringify(current(), null, 2);
}

/**
 * Replaces the whole record. Returns false rather than throwing on anything it
 * does not recognise, because the caller is a file picker and the honest answer
 * to a wrong file is "that was not one of these".
 */
export function importState(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as Partial<StudyState>;
    if (parsed.version !== VERSION || typeof parsed.progress !== 'object' || !parsed.progress) {
      return false;
    }
    commit({
      version: VERSION,
      progress: parsed.progress,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      xp: typeof parsed.xp === 'number' ? parsed.xp : 0,
    });
    return true;
  } catch {
    return false;
  }
}

/** Test seam. The module-level cache would otherwise leak between cases. */
export function resetForTests(): void {
  state = null;
  volatile = false;
}
