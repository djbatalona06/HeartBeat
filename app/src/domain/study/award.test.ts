import { describe, expect, it } from 'vitest';
import {
  STUDY_DAILY_CAP,
  STUDY_KINDS,
  allowedGain,
  isStudyKind,
  isUsableSessionId,
  studyAwardId,
  studyDayKey,
  xpFor,
} from './award';

describe('study kinds', () => {
  it('values a whole session above a fragment of one', () => {
    expect(xpFor('quiz')).toBeGreaterThan(xpFor('match'));
    expect(xpFor('weekly')).toBeGreaterThan(xpFor('deck'));
  });

  it('keeps every kind under the daily cap, so one session never fills it', () => {
    for (const kind of STUDY_KINDS) expect(xpFor(kind)).toBeLessThan(STUDY_DAILY_CAP);
  });

  it('refuses a kind it does not know', () => {
    expect(isStudyKind('deck')).toBe(true);
    expect(isStudyKind('bribe')).toBe(false);
    expect(isStudyKind(7)).toBe(false);
  });
});

describe('studyAwardId', () => {
  it('is the same for the same session, so a retry cannot double-credit', () => {
    // The ledger deduplicates on this. A retry that produced a new id would be
    // a new gain, which is exactly what the offline queue would cause.
    expect(studyAwardId('abc123xy')).toBe(studyAwardId('abc123xy'));
  });

  it('differs between sessions', () => {
    expect(studyAwardId('abc123xy')).not.toBe(studyAwardId('abc123xz'));
  });

  it('cannot collide with a quest or achievement award', () => {
    expect(studyAwardId('x'.repeat(10)).startsWith('study-')).toBe(true);
  });
});

describe('isUsableSessionId', () => {
  it('accepts what the study app mints', () => {
    expect(isUsableSessionId('a1b2c3d4')).toBe(true);
    expect(isUsableSessionId('01H-_abcdefgh')).toBe(true);
  });

  it('refuses anything that would be unsafe or unbounded in a key', () => {
    for (const bad of ['', 'short', 'x'.repeat(65), 'has space', 'semi;colon', null, 12]) {
      expect(isUsableSessionId(bad)).toBe(false);
    }
  });
});

describe('studyDayKey', () => {
  it('uses the member timezone, not UTC', () => {
    // 03:00 UTC on the 7th is still the 6th in Los Angeles. The study app dates
    // its own streak in UTC, so this is exactly where the two disagree.
    const at = Date.parse('2026-09-07T03:00:00Z');
    expect(studyDayKey(at, 'UTC')).toBe('2026-09-07');
    expect(studyDayKey(at, 'America/Los_Angeles')).toBe('2026-09-06');
  });

  it('rolls the day over ahead of UTC too', () => {
    const at = Date.parse('2026-09-06T22:00:00Z');
    expect(studyDayKey(at, 'Asia/Tokyo')).toBe('2026-09-07');
  });

  it('falls back to UTC rather than throwing on a zone it does not know', () => {
    expect(studyDayKey(Date.parse('2026-09-06T12:00:00Z'), 'Mars/Olympus')).toBe('2026-09-06');
  });
});

describe('allowedGain', () => {
  it('gives the whole gain when there is room', () => {
    expect(allowedGain(0, 25)).toBe(25);
  });

  it('gives what is left rather than refusing at the boundary', () => {
    // A session landing on the cap should still count for the remainder.
    expect(allowedGain(STUDY_DAILY_CAP - 10, 25)).toBe(10);
  });

  it('gives nothing once the day is full', () => {
    expect(allowedGain(STUDY_DAILY_CAP, 25)).toBe(0);
    expect(allowedGain(STUDY_DAILY_CAP + 50, 25)).toBe(0);
  });
});
