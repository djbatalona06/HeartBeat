import { describe, expect, it } from 'vitest';
import { addDays, dayKey, daysBetween } from './day';

const LA = 'America/Los_Angeles';

describe('dayKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-09-25T19:00:00Z'), LA)).toBe('2026-09-25');
  });

  it('uses the zone, not UTC, near midnight', () => {
    // 06:30 UTC is still the previous evening in Los Angeles.
    expect(dayKey(new Date('2026-09-26T06:30:00Z'), LA)).toBe('2026-09-25');
    expect(dayKey(new Date('2026-09-26T06:30:00Z'), 'UTC')).toBe('2026-09-26');
  });

  it('survives the spring-forward boundary', () => {
    // 2026-03-08 is when US Pacific loses an hour.
    expect(dayKey(new Date('2026-03-08T09:30:00Z'), LA)).toBe('2026-03-08');
    expect(dayKey(new Date('2026-03-08T11:30:00Z'), LA)).toBe('2026-03-08');
  });

  it('survives the autumn fall-back boundary', () => {
    expect(dayKey(new Date('2026-11-01T08:30:00Z'), LA)).toBe('2026-11-01');
  });
});

describe('addDays', () => {
  it('moves forward and back', () => {
    expect(addDays('2026-09-25', 1)).toBe('2026-09-26');
    expect(addDays('2026-09-25', -1)).toBe('2026-09-24');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('does not drift across a DST boundary', () => {
    // Arithmetic is in UTC on purpose; a local-time Date would land on the
    // same calendar day when the clocks shift.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('daysBetween', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-09-25', '2026-09-28')).toBe(3);
    expect(daysBetween('2026-09-28', '2026-09-25')).toBe(-3);
    expect(daysBetween('2026-09-25', '2026-09-25')).toBe(0);
  });

  it('counts correctly across a DST boundary', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});
