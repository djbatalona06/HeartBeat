/**
 * The pairing screen's arithmetic and its error voice.
 *
 * The mapping tests are the point: each one pins one of the five answers
 * /api/pair/join can give to a sentence a person can act on, so a refactor
 * that collapses them back into one "that did not work" fails here.
 */
import { describe, expect, it } from 'vitest';
import {
  INVITE_LENGTH,
  INVITE_TTL_MS,
  formatCountdown,
  inviteStatus,
  isCompleteInvite,
  normalizeInvite,
  pairFailure,
} from './pairing';

const NOW = 1_700_000_000_000;

/** What the client throws: a message from the body, plus the status. */
class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

describe('normalizeInvite', () => {
  it('uppercases what was typed in lower case', () => {
    expect(normalizeInvite('k3m9pq')).toBe('K3M9PQ');
  });

  it('drops the spaces and hyphens a code read aloud arrives with', () => {
    expect(normalizeInvite('K3M - 9PQ')).toBe('K3M9PQ');
  });

  it('drops characters the alphabet never mints, rather than rejecting them', () => {
    expect(normalizeInvite('KO3I9P1Q0')).toBe('K39PQ');
  });

  it('stops at six, so a stuck key cannot send a longer code', () => {
    expect(normalizeInvite('K3M9PQRSTU')).toHaveLength(INVITE_LENGTH);
  });
});

describe('isCompleteInvite', () => {
  it('is true only once six usable characters are there', () => {
    expect(isCompleteInvite('K3M9P')).toBe(false);
    expect(isCompleteInvite('K3M9PQ')).toBe(true);
    expect(isCompleteInvite('k3m-9pq')).toBe(true);
  });
});

describe('inviteStatus', () => {
  it('reports none when no invite has been issued', () => {
    expect(inviteStatus(undefined, NOW)).toBe('none');
  });

  it('reports live inside the fifteen-minute window', () => {
    expect(inviteStatus(NOW + INVITE_TTL_MS, NOW)).toBe('live');
  });

  it('reports expired on the far side of it, including the exact instant', () => {
    expect(inviteStatus(NOW, NOW)).toBe('expired');
    expect(inviteStatus(NOW - 1, NOW)).toBe('expired');
  });
});

describe('formatCountdown', () => {
  it('pads the seconds', () => {
    expect(formatCountdown(9 * 1000)).toBe('0:09');
    expect(formatCountdown(15 * 60 * 1000)).toBe('15:00');
  });

  it('floors, so it never claims a second that has gone', () => {
    expect(formatCountdown(59_600)).toBe('0:59');
  });

  it('never runs backwards past zero', () => {
    expect(formatCountdown(-5000)).toBe('0:00');
  });
});

describe('pairFailure', () => {
  it('tells an empty box from a wrong code', () => {
    expect(pairFailure(new ApiError('invite required', 400)).title).toBe('No code yet');
  });

  it('answers a code that matches nothing by suggesting the look-alike letters', () => {
    const failure = pairFailure(new ApiError('no such invite', 404));
    expect(failure.title).toBe('No pairing with that code');
    expect(failure.message).toContain('O, I, zero or one');
  });

  it('separates a used code from a full couple, though both are 409', () => {
    expect(pairFailure(new ApiError('invite already used', 409)).title).toBe(
      'That code has already been used',
    );
    expect(pairFailure(new ApiError('this couple is full', 409)).title).toBe(
      'That pairing already has two phones',
    );
  });

  it('says an expired code is expired, and how long they last', () => {
    const failure = pairFailure(new ApiError('invite expired', 410));
    expect(failure.title).toBe('That code has expired');
    expect(failure.message).toContain('fifteen minutes');
  });

  it('blames the network, not the person, when there was no status at all', () => {
    const failure = pairFailure(new Error('Failed to fetch'));
    expect(failure.title).toBe('The server did not answer');
    expect(failure.message).toContain('nothing on this phone was changed');
  });

  it('carries an unrecognised server message through rather than swallowing it', () => {
    expect(pairFailure(new ApiError('database is on fire', 500)).message).toBe(
      'database is on fire',
    );
  });

  it('survives being handed something that is not an error at all', () => {
    expect(pairFailure(null).title).toBe('The server did not answer');
  });
});
