import { pickForDay } from '../day';

/**
 * Acts of kindness: one small thing, for them or for anyone.
 *
 * Split in two on purpose. The ones aimed at your partner can be recorded,
 * because this app already has a way to do that honestly — the existing
 * `good-vibes` life event, with its own daily cap, rather than a second
 * mechanism that would need its own cap and its own abuse to think about. The
 * ones aimed at anybody else are not recorded at all, and that is the point:
 * counting a kindness to a stranger turns it into a score, and the version of
 * this feature that tracks how kind you have been to the world is worse than
 * no feature.
 */

export interface Act {
  id: string;
  text: string;
  /** `them` can be sent as a life event; `anyone` is never recorded. */
  who: 'them' | 'anyone';
}

export const ACTS: readonly Act[] = [
  { id: 'them-noticed', text: 'Tell them one thing you noticed them doing', who: 'them' },
  { id: 'them-chore', text: 'Do the chore they were dreading', who: 'them' },
  { id: 'them-drink', text: 'Make them a drink without being asked', who: 'them' },
  { id: 'them-listen', text: 'Ask about the thing they mentioned and forgot you heard', who: 'them' },
  { id: 'them-plan', text: 'Plan something small they would like', who: 'them' },
  { id: 'them-thanks', text: 'Thank them for something ordinary', who: 'them' },

  { id: 'any-message', text: 'Message someone who crossed your mind', who: 'anyone' },
  { id: 'any-praise', text: 'Tell someone they did a good job, specifically', who: 'anyone' },
  { id: 'any-space', text: 'Let someone in, in traffic or a queue', who: 'anyone' },
  { id: 'any-review', text: 'Leave a kind review for a small place', who: 'anyone' },
  { id: 'any-give', text: 'Give away something you have not used in a year', who: 'anyone' },
  { id: 'any-patience', text: 'Be patient with somebody who is new at their job', who: 'anyone' },
  { id: 'any-litter', text: 'Pick up one piece of litter that is not yours', who: 'anyone' },
  { id: 'any-checkin', text: 'Check on the person nobody has checked on', who: 'anyone' },
];

export function actsFor(who: Act['who']): Act[] {
  return ACTS.filter((a) => a.who === who);
}

export function actById(id: string | undefined): Act | undefined {
  return ACTS.find((a) => a.id === id);
}

/**
 * One suggestion per day per group, derived from the date.
 *
 * Arithmetic rather than random, like the starter-plan rotation and the
 * reflection prompt: both phones land on the same suggestion with nothing
 * synced, and reopening the screen does not reshuffle the thing you were about
 * to go and do.
 */
export function actForDay(day: string, who: Act['who']): Act {
  return pickForDay(day, actsFor(who))!;
}
