import type { CoupleId, DayKey, MemberId } from '../types';

/**
 * Reflections: the written half of self-care, and the only table the whole
 * layer needed.
 *
 * Goals went onto `tasks` and the three cosmetic catalogues onto `inventory`,
 * because a row already existed shaped like each of them. A written entry is
 * the one thing with nothing to reuse.
 *
 * **Private by default, and that is a design decision rather than a default.**
 * Everything else in this app is built so two people can read each other's
 * day. A journal is the one thing that stops being usable the moment it is
 * read by somebody else — so an entry is yours unless you say otherwise, and
 * `shared` is the explicit act that changes it. The couple id is still on the
 * row, because the row has to survive a re-key like every other; carrying an
 * id is not the same as being visible.
 */

export interface Reflection {
  id: string;
  coupleId: CoupleId;
  memberId: MemberId;
  /** Member timezone, never UTC — see the day-key rule in CLAUDE.md. */
  day: DayKey;
  /** The question this was written against, when it came from one. */
  promptId?: string;
  /** The question as it read, stored with the answer so a reworded prompt
   *  cannot change what an old entry appears to be answering. */
  prompt?: string;
  body: string;
  /** Off unless deliberately turned on. See the note above. */
  shared?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Prompt {
  id: string;
  /** The question itself. */
  text: string;
  /** A short label for the group it belongs to, shown as a chip. */
  kind: 'day' | 'kind' | 'hard' | 'ahead' | 'us';
}

export const PROMPT_KINDS: Record<Prompt['kind'], string> = {
  day: 'Today',
  kind: 'Kindness',
  hard: 'Hard things',
  ahead: 'Looking ahead',
  us: 'The two of you',
};

/**
 * The questions.
 *
 * Written to be answerable in one sentence on a bad day. A prompt that needs a
 * paragraph is a prompt that gets skipped, and a journal that gets skipped
 * three times stops being opened at all.
 */
export const PROMPTS: readonly Prompt[] = [
  { id: 'day-one-good', text: 'What was one good minute today?', kind: 'day' },
  { id: 'day-energy', text: 'Where did your energy actually go today?', kind: 'day' },
  { id: 'day-body', text: 'What has your body been asking for?', kind: 'day' },
  { id: 'day-noticed', text: 'What did you notice today that you would have missed last year?', kind: 'day' },

  { id: 'kind-self', text: 'What would you say to a friend in your exact situation?', kind: 'kind' },
  { id: 'kind-done', text: 'What did you do for somebody else, however small?', kind: 'kind' },
  { id: 'kind-forgive', text: 'What are you still holding against yourself that you could put down?', kind: 'kind' },

  { id: 'hard-name', text: 'What is the hard thing, in one plain sentence?', kind: 'hard' },
  { id: 'hard-smallest', text: 'What is the smallest possible next step?', kind: 'hard' },
  { id: 'hard-before', text: 'When did you last get through something like this?', kind: 'hard' },
  { id: 'hard-help', text: 'Who could you ask, if asking were easy?', kind: 'hard' },

  { id: 'ahead-tomorrow', text: 'What is tomorrow for?', kind: 'ahead' },
  { id: 'ahead-looking', text: 'What are you looking forward to, even slightly?', kind: 'ahead' },
  { id: 'ahead-year', text: 'What do you want to be true in a year?', kind: 'ahead' },

  { id: 'us-noticed', text: 'What did they do this week that you noticed?', kind: 'us' },
  { id: 'us-unsaid', text: 'What have you been meaning to say to them?', kind: 'us' },
  { id: 'us-good', text: 'What is working between you right now?', kind: 'us' },
];

const BY_ID = new Map(PROMPTS.map((p) => [p.id, p]));

export function promptById(id: string | undefined): Prompt | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function promptsOfKind(kind: Prompt['kind']): Prompt[] {
  return PROMPTS.filter((p) => p.kind === kind);
}

/**
 * The prompt offered on a given day.
 *
 * Derived from the day key rather than stored or randomised, for the same
 * reason the starter plan's rotation is: both phones land on the same question
 * with nothing synced, and coming back to the screen twice in an evening does
 * not silently swap the question out from under a half-written answer.
 */
export function promptForDay(day: DayKey): Prompt {
  const digits = day.replace(/\D/g, '');
  let hash = 0;
  for (const ch of digits) hash = (hash * 10 + Number(ch)) % 100000;
  return PROMPTS[hash % PROMPTS.length];
}

/** Newest first, which is the only order a journal is ever read in. */
export function byNewest(entries: readonly Reflection[]): Reflection[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * A one-line preview for the list.
 *
 * Collapses whitespace before truncating, so an entry that starts with three
 * blank lines does not preview as nothing at all.
 */
export function preview(body: string, max = 90): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Whether there is anything worth saving. Whitespace is not an entry. */
export function isWritten(body: string): boolean {
  return body.trim().length > 0;
}

/** How many days in a row end with something written. */
export function streakOf(entries: readonly Reflection[], today: DayKey): number {
  const days = new Set(entries.map((e) => e.day));
  let streak = 0;
  let cursor = today;
  // Walks back one calendar day at a time. Today not being written yet is not
  // a broken streak — it is a day that has not finished.
  if (!days.has(cursor)) cursor = shiftDay(cursor, -1);
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Local calendar arithmetic on a `YYYY-MM-DD` key, with no timezone involved. */
function shiftDay(day: DayKey, by: number): DayKey {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(at.getUTCDate() + by);
  return at.toISOString().slice(0, 10);
}
