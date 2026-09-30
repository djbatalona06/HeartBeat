import { describe, expect, it } from 'vitest';
import { elapsed, pause, resume, start } from './clock';

describe('question clock', () => {
  it('runs from the moment it starts', () => {
    expect(elapsed(start(1000), 4000)).toBe(3000);
  });

  it('stands still while paused', () => {
    const paused = pause(start(0), 2000);
    expect(elapsed(paused, 2000)).toBe(2000);
    expect(elapsed(paused, 60_000)).toBe(2000);
  });

  it('picks up where it was put down, rather than starting over', () => {
    const back = resume(pause(start(0), 2000), 32_000);
    expect(elapsed(back, 32_000)).toBe(2000);
    expect(elapsed(back, 33_000)).toBe(3000);
  });

  it('adds up more than one pause', () => {
    let clock = start(0);
    clock = resume(pause(clock, 1000), 5000);
    clock = resume(pause(clock, 6000), 10_000);
    expect(elapsed(clock, 11_000)).toBe(3000);
  });

  it('ignores a second pause, so it keeps the first moment it was put down', () => {
    const once = pause(start(0), 2000);
    expect(pause(once, 9000)).toBe(once);
    expect(elapsed(resume(pause(once, 9000), 10_000), 10_000)).toBe(2000);
  });

  it('ignores a resume while running', () => {
    const clock = start(0);
    expect(resume(clock, 5000)).toBe(clock);
  });

  it('never goes backwards across any run of events', () => {
    const events = ['pause', 'pause', 'resume', 'resume', 'pause', 'resume', 'pause'] as const;
    let clock = start(0);
    let last = 0;
    for (const [index, event] of events.entries()) {
      const now = (index + 1) * 700;
      clock = event === 'pause' ? pause(clock, now) : resume(clock, now);
      const seen = elapsed(clock, now);
      expect(seen).toBeGreaterThanOrEqual(last);
      last = seen;
    }
  });

  it('never reads negative, even if the wall clock steps back', () => {
    expect(elapsed(start(5000), 1000)).toBe(0);
    const back = resume(pause(start(0), 5000), 3000);
    expect(elapsed(back, 6000)).toBe(6000);
  });
});
