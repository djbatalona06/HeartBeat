import { pickForDay } from '../day';
import type { DayKey } from '../types';
import type { SupportLane } from './lanes';

/**
 * Small things you could do, and small things you could give.
 *
 * Deliberately not advice, and deliberately not a plan. Every line here is one
 * concrete thing that fits in an evening, because the failure mode of a
 * "support your partner" feature is a list of admirable generalities nobody
 * has ever acted on. "Ask what would help" is a sentence; "fill a hot water
 * bottle before they ask" is a thing you can be doing in a minute.
 *
 * Nothing here is recorded, scored, or checked off. The moment the app counts
 * how supportive somebody has been, the suggestion becomes a chore with a
 * scoreboard attached — the same argument `selfcare/kindness.ts` makes about
 * kindnesses to strangers, and it applies at least as strongly inside a couple.
 *
 * Tips and gifts share a table because they share a shape and a screen: both
 * answer "what could I do today". The discriminator is there so a screen can
 * offer one of each rather than two of the same kind.
 */

export interface SupportIdea {
  id: string;
  text: string;
  lane: SupportLane;
  kind: 'tip' | 'gift';
}

export const SUPPORT_IDEAS: readonly SupportIdea[] = [
  // Helping them through a rough cycle day. Concrete, low-ceremony, and none
  // of it requires them to ask — asking is the part that costs, on a bad day.
  { id: 'cp-heat', text: 'Fill a hot water bottle and leave it where they sit', lane: 'cycle-partner', kind: 'tip' },
  { id: 'cp-dinner', text: 'Take dinner off their plate entirely tonight', lane: 'cycle-partner', kind: 'tip' },
  { id: 'cp-quiet', text: 'Handle the noise — dishes, calls, the dog — for an hour', lane: 'cycle-partner', kind: 'tip' },
  { id: 'cp-ask', text: 'Ask "company or space?" and take the answer at face value', lane: 'cycle-partner', kind: 'tip' },
  { id: 'cp-errand', text: 'Do the errand they have been putting off', lane: 'cycle-partner', kind: 'tip' },
  { id: 'cp-nolog', text: 'Do not ask them to log anything today', lane: 'cycle-partner', kind: 'tip' },
  { id: 'cp-supplies', text: 'Restock what is running low before it runs out', lane: 'cycle-partner', kind: 'gift' },
  { id: 'cp-choc', text: 'The specific snack, not a thoughtful substitute', lane: 'cycle-partner', kind: 'gift' },
  { id: 'cp-bath', text: 'Run a bath, or buy the good bath thing', lane: 'cycle-partner', kind: 'gift' },
  { id: 'cp-socks', text: 'Thick socks. Unglamorous, and they work', lane: 'cycle-partner', kind: 'gift' },

  // Your own rough day. All permission, no instruction: the point of the app
  // knowing is that it asks less of you, not more.
  { id: 'cs-less', text: 'Cut today’s list in half and do not renegotiate it', lane: 'cycle-self', kind: 'tip' },
  { id: 'cs-warm', text: 'Heat, early, before it is bad enough to warrant it', lane: 'cycle-self', kind: 'tip' },
  { id: 'cs-water', text: 'Water and something salty; it helps more than it should', lane: 'cycle-self', kind: 'tip' },
  { id: 'cs-move', text: 'A slow walk, if it appeals. Nothing if it does not', lane: 'cycle-self', kind: 'tip' },
  { id: 'cs-say', text: 'Tell them what would actually help, in one sentence', lane: 'cycle-self', kind: 'tip' },
  { id: 'cs-cancel', text: 'Cancel the thing. It will survive being moved', lane: 'cycle-self', kind: 'tip' },
  { id: 'cs-bed', text: 'An early night counts as having done something', lane: 'cycle-self', kind: 'tip' },

  // The screenings and habits men reliably skip. Prompts to book a thing, not
  // diagnoses — nothing here tells anyone what is wrong with them.
  { id: 'mh-gp', text: 'Book the appointment you have been meaning to book', lane: 'mens-health', kind: 'tip' },
  { id: 'mh-bp', text: 'Get your blood pressure checked — it is free and quick', lane: 'mens-health', kind: 'tip' },
  { id: 'mh-dentist', text: 'The dentist, if it has been more than a year', lane: 'mens-health', kind: 'tip' },
  { id: 'mh-skin', text: 'Have someone look at the mole you keep noticing', lane: 'mens-health', kind: 'tip' },
  { id: 'mh-sleep', text: 'If you snore and wake up tired, mention it to a doctor', lane: 'mens-health', kind: 'tip' },
  { id: 'mh-talk', text: 'Say the thing you have been managing on your own', lane: 'mens-health', kind: 'tip' },
  { id: 'mh-strength', text: 'Two sessions a week keeps more than it costs', lane: 'mens-health', kind: 'tip' },
  { id: 'mh-booze', text: 'Count this week’s drinks honestly, once, without judgement', lane: 'mens-health', kind: 'tip' },

  // For anybody, whatever they answered or did not.
  { id: 'gen-walk', text: 'Go for a walk together with no destination', lane: 'general', kind: 'tip' },
  { id: 'gen-phone', text: 'An hour each with the phones in another room', lane: 'general', kind: 'tip' },
  { id: 'gen-ask', text: 'Ask about the thing they mentioned last week', lane: 'general', kind: 'tip' },
  { id: 'gen-early', text: 'Both go to bed an hour early, on purpose', lane: 'general', kind: 'tip' },
  { id: 'gen-chore', text: 'Do the chore they hate most, without mentioning it', lane: 'general', kind: 'tip' },
  { id: 'gen-note', text: 'Leave a note somewhere they will find it tomorrow', lane: 'general', kind: 'gift' },
  { id: 'gen-coffee', text: 'Their order, brought to them, unannounced', lane: 'general', kind: 'gift' },
  { id: 'gen-plan', text: 'Book the small thing you both keep saying you should do', lane: 'general', kind: 'gift' },
];

const BY_ID = new Map(SUPPORT_IDEAS.map((idea) => [idea.id, idea]));

export function ideaById(id: string | undefined): SupportIdea | undefined {
  return id === undefined ? undefined : BY_ID.get(id);
}

export function ideasFor(lane: SupportLane): SupportIdea[] {
  return SUPPORT_IDEAS.filter((idea) => idea.lane === lane);
}

/**
 * One tip and one gift for a lane, chosen by the day.
 *
 * Two picks rather than one, because a gift and a thing to do are different
 * kinds of answer to "what could I do today" and offering only whichever the
 * hash landed on would make the screen feel arbitrary.
 */
export function ideasForDay(day: DayKey, lane: SupportLane): SupportIdea[] {
  const pool = ideasFor(lane);
  const tip = pickForDay(day, pool.filter((i) => i.kind === 'tip'));
  const gift = pickForDay(day, pool.filter((i) => i.kind === 'gift'));
  return [tip, gift].filter((i): i is SupportIdea => i !== undefined);
}
