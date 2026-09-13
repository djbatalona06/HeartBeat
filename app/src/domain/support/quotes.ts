import { pickForDay } from '../day';
import type { DayKey } from '../types';
import type { SupportLane } from './lanes';

/**
 * One line to read, chosen by the day.
 *
 * The rule that kept this table short: nothing here tells anybody how to feel.
 * A quote that arrives on a hard day and says the hard day is secretly a gift
 * is worse than an empty screen, so the ones about difficulty are about
 * *company* and *permission* rather than silver linings — and the couple lines
 * are about the ordinary business of two people rather than romance.
 *
 * Unattributed lines are this app's own. Nothing here is presented as a
 * quotation from someone who did not say it.
 */

export interface Quote {
  id: string;
  text: string;
  attribution?: string;
  lane: SupportLane;
}

export const QUOTES: readonly Quote[] = [
  { id: 'q-cs-ask', text: 'Needing less of yourself today is not a smaller day.', lane: 'cycle-self' },
  { id: 'q-cs-rest', text: 'Rest is the task. Everything else can be tomorrow’s argument.', lane: 'cycle-self' },
  { id: 'q-cs-body', text: 'Your body is not being difficult. It is being a body.', lane: 'cycle-self' },
  { id: 'q-cs-half', text: 'Half of what you planned, done kindly, is the whole of today.', lane: 'cycle-self' },

  { id: 'q-cp-near', text: 'Most of helping is being nearby and not making it a project.', lane: 'cycle-partner' },
  { id: 'q-cp-fix', text: 'They are not asking you to fix it. They are letting you know.', lane: 'cycle-partner' },
  { id: 'q-cp-small', text: 'The small unasked-for thing lands harder than the grand one.', lane: 'cycle-partner' },
  { id: 'q-cp-again', text: 'It will come round again, and you will know what to do.', lane: 'cycle-partner' },

  { id: 'q-mh-late', text: 'The appointment you are putting off is smaller now than later.', lane: 'mens-health' },
  { id: 'q-mh-say', text: 'Managing it alone is not the same as handling it.', lane: 'mens-health' },
  { id: 'q-mh-check', text: 'Getting it checked is the cheap version of finding out.', lane: 'mens-health' },

  { id: 'q-gen-ordinary', text: 'Most of a good life is ordinary days nobody wrote down.', lane: 'general' },
  { id: 'q-gen-turn', text: 'Turning toward each other is a habit, not a feeling.', lane: 'general' },
  { id: 'q-gen-notice', text: 'Being noticed is most of what anybody is after.', lane: 'general' },
  { id: 'q-gen-repair', text: 'Every couple gets it wrong. The good ones come back.', lane: 'general' },
  { id: 'q-gen-today', text: 'You do not have to have a good week to have a good evening.', lane: 'general' },
];

const BY_ID = new Map(QUOTES.map((quote) => [quote.id, quote]));

export function quoteById(id: string | undefined): Quote | undefined {
  return id === undefined ? undefined : BY_ID.get(id);
}

export function quotesFor(lane: SupportLane): Quote[] {
  return QUOTES.filter((quote) => quote.lane === lane);
}

export function quoteForDay(day: DayKey, lane: SupportLane): Quote | undefined {
  return pickForDay(day, quotesFor(lane));
}
