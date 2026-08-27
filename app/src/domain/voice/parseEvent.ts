import type { DayKey, MinuteOfDay } from '../types';
import { addDays } from '../day';

/**
 * "dentist next Tuesday at 2pm" → a calendar event draft.
 *
 * Days are resolved by shifting a DayKey with addDays, never by doing
 * arithmetic on a Date. docs/DESIGN.md is explicit that a day here is a
 * calendar date in a named zone rather than an instant; going through Date
 * would reintroduce exactly the DST and midnight-boundary bugs that rule
 * exists to prevent.
 *
 * Deterministic for the same reason parseTask is: an appointment invented by a
 * model is worse than one you had to type.
 */

export interface EventIntent {
  title: string;
  day: DayKey;
  /** Minutes past midnight, or undefined when no time was said. */
  startsAt?: MinuteOfDay;
  endsAt?: MinuteOfDay;
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const OPENERS = [
  'add an event to',
  'put in the calendar',
  'add to my calendar',
  'add to the calendar',
  'schedule a',
  'schedule an',
  'schedule',
  'add an event',
  'add an appointment',
  'remind me about',
  'i have a',
  'i have an',
  'i have',
  'add',
];

/** The day-of-week index of a DayKey, without going through a local Date. */
function weekdayOf(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*(?=,|$)/g, '')
    .replace(/\b(?:at|on|from|this)\s*$/i, '')
    .replace(/^[\s,;.\-—]+|[\s,;.\-—]+$/g, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .trim();
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Words for the hours, so "at seven" lands like "at 7". */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

interface TimeHit {
  minutes: MinuteOfDay;
  /** True when am/pm was actually said, so a bare "at 7" can be nudged later. */
  explicit: boolean;
}

/**
 * Pulls the first time out of `text`, returning it and the text without it.
 * Handles "2pm", "2:30 pm", "14:00", "half past nine", "quarter to six",
 * "noon", "midnight", and bare "at seven".
 */
function extractTime(text: string): { hit: TimeHit | null; rest: string } {
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => TimeHit | null) => {
    const m = text.match(re);
    if (!m) return false;
    const hit = fn(m);
    if (!hit) return false;
    found = hit;
    rest = text.replace(m[0], ' ');
    return true;
  };

  let found: TimeHit | null = null;
  let rest = text;

  const meridiem = (raw: string | undefined, hour: number): { hour: number; explicit: boolean } => {
    if (!raw) return { hour, explicit: false };
    const pm = /p/i.test(raw);
    if (pm) return { hour: hour === 12 ? 12 : hour + 12, explicit: true };
    return { hour: hour === 12 ? 0 : hour, explicit: true };
  };

  const ok =
    take(/\bnoon\b|\bmidday\b/i, () => ({ minutes: 12 * 60, explicit: true })) ||
    take(/\bmidnight\b/i, () => ({ minutes: 0, explicit: true })) ||
    // "half past nine", "quarter past six", "quarter to six"
    take(
      /\b(half|quarter)\s+(past|to)\s+(\d{1,2}|[a-z]+)\s*(a\.?m\.?|p\.?m\.?)?/i,
      (m) => {
        const base = /^\d+$/.test(m[3]) ? Number(m[3]) : NUMBER_WORDS[m[3].toLowerCase()];
        if (!base || base > 12) return null;
        const offset = m[1].toLowerCase() === 'half' ? 30 : 15;
        const { hour, explicit } = meridiem(m[4], base);
        const minutes =
          m[2].toLowerCase() === 'past'
            ? hour * 60 + offset
            : (hour * 60 - offset + 1440) % 1440;
        return { minutes, explicit };
      },
    ) ||
    // 24-hour "14:00" — unambiguous, so never nudged.
    take(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:a\.?m\.?|p\.?m\.?))/i, (m) => ({
      minutes: Number(m[1]) * 60 + Number(m[2]),
      explicit: true,
    })) ||
    // "2:30pm", "2.30 pm"
    take(/\b(\d{1,2})[:.]([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)/i, (m) => {
      const base = Number(m[1]);
      if (base > 12) return null;
      const { hour, explicit } = meridiem(m[3], base);
      return { minutes: hour * 60 + Number(m[2]), explicit };
    }) ||
    // "2pm", "2 pm"
    take(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)/i, (m) => {
      const base = Number(m[1]);
      if (base > 12) return null;
      const { hour, explicit } = meridiem(m[2], base);
      return { minutes: hour * 60, explicit };
    }) ||
    // Bare "at 7" or "at seven" — no am/pm, so it stays inexplicit.
    take(/\bat\s+(\d{1,2}|[a-z]+)\b/i, (m) => {
      const base = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
      if (!base || base > 23) return null;
      return { minutes: base * 60, explicit: false };
    });

  if (!ok) return { hit: null, rest: text };
  return { hit: found, rest };
}

/** Pulls a day reference out of `text`, relative to `today`. */
function extractDay(text: string, today: DayKey): { day: DayKey | null; rest: string } {
  let rest = text;
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = text.match(re);
    if (m) rest = text.replace(m[0], ' ');
    return m;
  };

  if (take(/\bthe day after tomorrow\b/i)) return { day: addDays(today, 2), rest };
  if (take(/\btomorrow\b/i)) return { day: addDays(today, 1), rest };
  if (take(/\btoday\b/i)) return { day: today, rest };
  if (take(/\btonight\b/i)) return { day: today, rest };

  const named = take(
    new RegExp(`\\b(next|this|on)?\\s*(${WEEKDAYS.join('|')})\\b`, 'i'),
  );
  if (named) {
    const target = WEEKDAYS.indexOf(named[2].toLowerCase());
    const current = weekdayOf(today);
    let delta = (target - current + 7) % 7;
    // "Tuesday" said on a Tuesday means the next one, not this morning.
    if (delta === 0) delta = 7;
    // "next Tuesday" means the week after the coming one, unless the coming
    // one is already a full week out.
    if (/^next$/i.test(named[1] ?? '') && delta < 7) delta += 7;
    return { day: addDays(today, delta), rest };
  }

  // "on the 14th" — this month if it is still ahead, otherwise next month.
  const nth = take(/\bon the (\d{1,2})(?:st|nd|rd|th)\b/i);
  if (nth) {
    const dom = Number(nth[1]);
    if (dom >= 1 && dom <= 31) {
      const [y, m] = today.split('-').map(Number);
      const todayDom = Number(today.slice(8, 10));
      const monthOffset = dom < todayDom ? 1 : 0;
      const year = y + Math.floor((m - 1 + monthOffset) / 12);
      const month = ((m - 1 + monthOffset) % 12) + 1;
      const pad = (n: number) => String(n).padStart(2, '0');
      return { day: `${year}-${pad(month)}-${pad(dom)}`, rest };
    }
  }

  return { day: null, rest };
}

export function parseEvent(transcript: string, today: DayKey): EventIntent {
  let text = ` ${transcript.trim()} `;

  const head = text.trimStart().toLowerCase();
  for (const opener of OPENERS) {
    if (head.startsWith(`${opener} `)) {
      text = ` ${text.trimStart().slice(opener.length)} `;
      break;
    }
  }

  // Day before time: "on the 14th at 2" must not have its "14" eaten as an hour.
  const dayHit = extractDay(text, today);
  text = dayHit.rest;

  const timeHit = extractTime(text);
  text = timeHit.rest;

  let startsAt = timeHit.hit?.minutes;
  // No am/pm was said. An hour of 1–7 almost always means the afternoon or
  // evening when someone is putting it in a calendar; 8–11 is left alone,
  // because "at 9" is far more often the morning.
  //
  // The shift is +12 hours rather than a recomputed hour, so "quarter past
  // six" lands on 18:15 and not on 18:00 with the minutes quietly dropped.
  if (timeHit.hit && !timeHit.hit.explicit) {
    const hour = Math.floor(timeHit.hit.minutes / 60);
    if (hour >= 1 && hour <= 7) startsAt = timeHit.hit.minutes + 12 * 60;
  }

  const title = capitalise(tidy(text));

  return {
    title: title || transcript.trim(),
    day: dayHit.day ?? today,
    ...(startsAt === undefined ? {} : { startsAt }),
  };
}
