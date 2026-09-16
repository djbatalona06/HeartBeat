import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUR,
  HORIZON_HOURS,
  NIGHT_FROM,
  NIGHT_UNTIL,
  NUDGE_KINDS,
  QUIET_DAYS,
  isNightHour,
  horizonDays,
  instantAt,
  lastTogetherDay,
  loggedDaysFrom,
  planNudges,
  type NudgePlan,
} from './schedule';

const LONDON = 'Europe/London';
const NEW_YORK = 'America/New_York';
const KOLKATA = 'Asia/Kolkata';

/** What the zone says the wall clock is at an instant — the reader's view. */
const wallClock = (instant: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone, hour12: false, hour: '2-digit', minute: '2-digit',
  }).format(new Date(instant));

describe('instantAt', () => {
  it('lands on the hour asked for, in the zone asked for', () => {
    expect(wallClock(instantAt('2026-06-15', 20, LONDON), LONDON)).toBe('20:00');
    expect(wallClock(instantAt('2026-06-15', 20, NEW_YORK), NEW_YORK)).toBe('20:00');
  });

  it('handles a zone at a half-hour offset', () => {
    expect(wallClock(instantAt('2026-06-15', 20, KOLKATA), KOLKATA)).toBe('20:00');
  });

  it('is the same instant as UTC in a zone with no offset', () => {
    expect(instantAt('2026-01-15', 9, 'UTC')).toBe(Date.UTC(2026, 0, 15, 9));
  });

  /**
   * The two-pass part. A single pass reads the offset at the guessed instant,
   * which on a day the clocks move is the offset from the wrong side of the
   * move, and the reminder lands an hour out.
   */
  it('is right on the day the clocks go forward', () => {
    // London springs forward at 01:00 UTC on 29 March 2026.
    expect(wallClock(instantAt('2026-03-29', 20, LONDON), LONDON)).toBe('20:00');
    expect(wallClock(instantAt('2026-03-29', 9, LONDON), LONDON)).toBe('09:00');
  });

  it('is right on the day the clocks go back', () => {
    // London falls back at 02:00 local on 25 October 2026.
    expect(wallClock(instantAt('2026-10-25', 20, LONDON), LONDON)).toBe('20:00');
    expect(wallClock(instantAt('2026-10-25', 9, LONDON), LONDON)).toBe('09:00');
  });

  it('is right across a US change, which falls on a different date', () => {
    // The US springs forward on 8 March 2026, three weeks before the UK.
    expect(wallClock(instantAt('2026-03-08', 20, NEW_YORK), NEW_YORK)).toBe('20:00');
    expect(wallClock(instantAt('2026-03-15', 20, NEW_YORK), NEW_YORK)).toBe('20:00');
  });

  /**
   * The case that actually needs two passes, and the only one that does.
   *
   * London goes 00:59:59 GMT straight to 02:00:00 BST at 01:00 UTC, so local
   * 01:00 on this day never happens. The first pass reads the offset at the
   * guessed instant — 01:00 UTC, by which time the zone is already BST — and
   * lands on 00:00 UTC, which is midnight local: an hour *before* the time
   * asked for, and on the wrong side of the change. The second pass sees the
   * zone disagree with itself and takes the corrected offset, giving 01:00 UTC
   * — 02:00 local, the moment the clock jumps to and the nearest one that
   * exists.
   */
  it('gives the moment the clock jumps to for a local time that does not exist', () => {
    const at = instantAt('2026-03-29', 1, LONDON);
    expect(new Date(at).toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(wallClock(at, LONDON)).toBe('02:00');
    // Emphatically not midnight, which is what a single pass returns.
    expect(wallClock(at, LONDON)).not.toBe('00:00');
  });

  it('moves forward as the hour does', () => {
    const nine = instantAt('2026-06-15', 9, LONDON);
    const twenty = instantAt('2026-06-15', 20, LONDON);
    expect(twenty - nine).toBe(11 * 3_600_000);
  });
});

describe('horizonDays', () => {
  it('starts today and covers the horizon', () => {
    expect(horizonDays('2026-03-01')).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('crosses a month end', () => {
    expect(horizonDays('2026-01-31', 48)).toEqual(['2026-01-31', '2026-02-01']);
  });

  it('always covers at least today', () => {
    expect(horizonDays('2026-03-01', 0)).toEqual(['2026-03-01']);
  });

  it('is three days at the configured horizon', () => {
    expect(horizonDays('2026-03-01', HORIZON_HOURS)).toHaveLength(3);
  });
});

describe('lastTogetherDay', () => {
  it('takes the latest day, whatever order they arrive in', () => {
    expect(lastTogetherDay(['2026-02-01', '2026-03-09', '2026-03-02'])).toBe('2026-03-09');
  });

  it('has no answer when nothing has ever been logged', () => {
    expect(lastTogetherDay([])).toBeUndefined();
  });
});

describe('planNudges', () => {
  const base: NudgePlan = {
    memberId: 'm1',
    timeZone: LONDON,
    hour: DEFAULT_HOUR,
    today: '2026-06-15',
    now: Date.UTC(2026, 5, 15, 8),
    loggedDays: [],
    lastTogether: '2026-06-15',
  };

  it('plans one reminder a day across the horizon', () => {
    const plan = planNudges(base);
    expect(plan).toHaveLength(3);
    expect(new Set(plan.map((n) => n.key)).size).toBe(3);
  });

  it('aims each one at the chosen hour, locally', () => {
    for (const nudge of planNudges(base)) {
      expect(wallClock(nudge.fireAt, LONDON)).toBe('20:00');
    }
  });

  it('comes back in order', () => {
    const fires = planNudges(base).map((n) => n.fireAt);
    expect(fires).toEqual([...fires].sort((a, b) => a - b));
  });

  /** Nothing to remind them of on a day they have already dealt with. */
  it('skips a day that is already logged', () => {
    const plan = planNudges({ ...base, loggedDays: ['2026-06-16'] });
    expect(plan).toHaveLength(2);
    expect(plan.some((n) => n.key.endsWith('2026-06-16'))).toBe(false);
  });

  it('skips a time that has already gone', () => {
    // Nine in the evening: today's eight o'clock is behind us.
    const plan = planNudges({ ...base, now: Date.UTC(2026, 5, 15, 20, 30) });
    expect(plan).toHaveLength(2);
    expect(plan.some((n) => n.key.endsWith('2026-06-15'))).toBe(false);
  });

  it('plans nothing when every day is logged', () => {
    const plan = planNudges({
      ...base,
      loggedDays: ['2026-06-15', '2026-06-16', '2026-06-17'],
    });
    expect(plan).toEqual([]);
  });

  it('gives every nudge somewhere to go and something to say', () => {
    for (const n of planNudges(base)) {
      expect(n.title.trim().length).toBeGreaterThan(0);
      expect(n.body.trim().length).toBeGreaterThan(0);
      expect(n.path.startsWith('/#/')).toBe(true);
    }
  });

  /** Keys are what make a full replace idempotent. */
  it('produces the same keys for the same plan, twice', () => {
    expect(planNudges(base).map((n) => n.key)).toEqual(planNudges(base).map((n) => n.key));
  });

  it('scopes keys to the member, so two phones do not overwrite each other', () => {
    const mine = planNudges(base).map((n) => n.key);
    const theirs = planNudges({ ...base, memberId: 'm2' }).map((n) => n.key);
    expect(mine.some((k) => theirs.includes(k))).toBe(false);
  });

  describe('having been away', () => {
    it('says nothing about a normal gap', () => {
      const plan = planNudges({ ...base, lastTogether: '2026-06-14' });
      expect(plan.every((n) => n.key.includes(':daily:'))).toBe(true);
    });

    it('says nothing at exactly the quiet threshold', () => {
      const at = planNudges({ ...base, lastTogether: '2026-06-13' });
      expect(at.every((n) => n.key.includes(':daily:'))).toBe(true);
      expect(QUIET_DAYS).toBe(2);
    });

    it('says it once past the threshold, not every day', () => {
      const plan = planNudges({ ...base, lastTogether: '2026-06-01' });
      const away = plan.filter((n) => n.key.includes(':away:'));
      expect(away).toHaveLength(1);
      // And it does not add a fourth notification; it replaces the first.
      expect(plan).toHaveLength(3);
    });

    it('says it kindly, with nothing about a streak or a loss', () => {
      const plan = planNudges({ ...base, lastTogether: '2026-06-01' });
      const away = plan.find((n) => n.key.includes(':away:'))!;
      expect(away.body).toMatch(/nothing is lost/i);
      expect(`${away.title} ${away.body}`).not.toMatch(/streak|lost your|missed|broke/i);
    });

    it('says nothing at all to a couple who have never logged anything', () => {
      // No history is a new install, not an absence.
      const plan = planNudges({ ...base, lastTogether: undefined });
      expect(plan.every((n) => n.key.includes(':daily:'))).toBe(true);
    });
  });
});

describe('loggedDaysFrom', () => {
  const on = (...days: string[]) => days.map((day) => ({ day }));

  it('takes the union across every kind of log', () => {
    // Any of them counts: someone who logged a workout does not need reminding
    // to open the app, whatever the mood tab says.
    expect(loggedDaysFrom(on('2026-03-01'), on('2026-03-02'))).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('counts a day once however many logs land on it', () => {
    expect(loggedDaysFrom(on('2026-03-01'), on('2026-03-01'), on('2026-03-01')))
      .toEqual(['2026-03-01']);
  });

  it('comes back sorted, so a reader can scan it', () => {
    expect(loggedDaysFrom(on('2026-03-09', '2026-03-02', '2026-03-05')))
      .toEqual(['2026-03-02', '2026-03-05', '2026-03-09']);
  });

  it('is empty when nothing has been logged', () => {
    expect(loggedDaysFrom([], [])).toEqual([]);
    expect(loggedDaysFrom()).toEqual([]);
  });
});

describe('the night window', () => {
  it('covers the small hours and wraps midnight', () => {
    const quiet = Array.from({ length: 24 }, (_, h) => h).filter(isNightHour);
    expect(quiet).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 22, 23]);
  });

  it('opens at NIGHT_FROM and closes at NIGHT_UNTIL, inclusive of neither edge', () => {
    expect(isNightHour(NIGHT_FROM - 1)).toBe(false);
    expect(isNightHour(NIGHT_FROM)).toBe(true);
    expect(isNightHour(NIGHT_UNTIL - 1)).toBe(true);
    expect(isNightHour(NIGHT_UNTIL)).toBe(false);
  });

  it('leaves the default hour alone', () => {
    // If the default ever moves into the window, every reminder in the app
    // silently relocates to breakfast. Worth failing loudly for.
    expect(isNightHour(DEFAULT_HOUR)).toBe(false);
  });

  it('floors a fractional hour rather than falling through', () => {
    expect(isNightHour(NIGHT_FROM + 0.5)).toBe(true);
    expect(isNightHour(NIGHT_UNTIL - 0.5)).toBe(true);
  });
});

describe('planNudges and the night window', () => {
  const night: NudgePlan = {
    memberId: 'm1',
    timeZone: LONDON,
    hour: 3,
    today: '2026-06-15',
    now: Date.UTC(2026, 5, 15, 8),
    loggedDays: [],
    lastTogether: '2026-06-15',
  };

  /**
   * The gap this closes. The hour picker offers all twenty-four, so somebody
   * could pick 03:00 and the app would wake them every night — which is the
   * exact opposite of the posture the rest of this module is built on.
   */
  it('moves a small-hours reminder to the morning instead of firing at 3am', () => {
    for (const nudge of planNudges(night)) {
      expect(wallClock(nudge.fireAt, LONDON)).toBe(`${String(NIGHT_UNTIL).padStart(2, '0')}:00`);
    }
  });

  it('moves a late-evening one too, not only the ones after midnight', () => {
    const late = planNudges({ ...night, hour: 23 });
    expect(late.length).toBeGreaterThan(0);
    for (const nudge of late) {
      expect(wallClock(nudge.fireAt, LONDON)).toBe(`${String(NIGHT_UNTIL).padStart(2, '0')}:00`);
    }
  });

  /**
   * Moved, never dropped. Deleting the nudge would silently lose the only
   * reminder for that day, and a setting that quietly does nothing is the kind
   * people report as a bug years later.
   */
  it('keeps as many reminders as it would have made at a waking hour', () => {
    const waking = planNudges({ ...night, hour: 9 });
    expect(planNudges(night)).toHaveLength(waking.length);
  });

  it('leaves a waking hour exactly where it was asked for', () => {
    for (const nudge of planNudges({ ...night, hour: 9 })) {
      expect(wallClock(nudge.fireAt, LONDON)).toBe('09:00');
    }
  });
});

describe('planNudges and the per-kind switches', () => {
  const base: NudgePlan = {
    memberId: 'm1',
    timeZone: LONDON,
    hour: DEFAULT_HOUR,
    today: '2026-06-15',
    now: Date.UTC(2026, 5, 15, 8),
    loggedDays: [],
    // Long enough ago to earn the away line.
    lastTogether: '2026-06-01',
  };

  it('tags every nudge with a kind from the published list', () => {
    for (const nudge of planNudges(base)) {
      expect(NUDGE_KINDS, nudge.key).toContain(nudge.kind);
    }
  });

  it('says nothing about the absence when that kind is off', () => {
    const plan = planNudges({ ...base, kinds: { away: false } });
    expect(plan.some((n) => n.kind === 'away')).toBe(false);
    // And the daily reminders are untouched — turning one off is not turning
    // reminders off.
    expect(plan.length).toBe(planNudges(base).length);
  });

  it('plans nothing at all when the daily kind is off', () => {
    // The away line rides on the first daily nudge, so there is nothing for it
    // to attach to. Silence is the honest outcome, not a stray away push.
    expect(planNudges({ ...base, kinds: { daily: false } })).toEqual([]);
  });

  it('treats an absent switch list as everything on, for older callers', () => {
    expect(planNudges({ ...base, kinds: undefined })).toEqual(planNudges(base));
  });

  it('treats an explicit true the same as absent', () => {
    expect(planNudges({ ...base, kinds: { daily: true, away: true } }))
      .toEqual(planNudges(base));
  });
});
