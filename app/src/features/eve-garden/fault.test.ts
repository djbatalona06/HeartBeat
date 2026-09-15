import { describe, expect, it } from 'vitest';
import {
  blocksPlay, faultCopy, faultFrom, needsTextMode, type GardenFault,
} from './fault';

/** Every fault, so a new one cannot be added without answering for it below. */
const ALL: GardenFault[] = ['gate', 'engine', 'stage', 'scene', 'round'];

/** The rejection `client.close()` produces on unmount. */
function closedError(): Error {
  const error = new Error('the game worker was closed');
  error.name = 'ClosedError';
  return error;
}

describe('faultFrom', () => {
  it('reports a real failure as the call that failed', () => {
    for (const source of ALL) {
      expect(faultFrom(source, new Error('boom')), source).toBe(source);
    }
  });

  it('stays quiet about our own teardown', () => {
    // `close()` rejects everything outstanding when the page unmounts. Somebody
    // who tapped another tab has not hit an error and must not be told they
    // have — this is why the page's catches can be loud now without shouting
    // at every navigation.
    for (const source of ALL) {
      expect(faultFrom(source, closedError()), source).toBeNull();
    }
  });

  it('treats a non-Error rejection as a real failure', () => {
    // A worker can reject with a string. That is not our teardown, so it is
    // news.
    expect(faultFrom('engine', 'something odd')).toBe('engine');
    expect(faultFrom('engine', undefined)).toBe('engine');
  });
});

describe('blocksPlay', () => {
  /**
   * This is the assertion that would have caught the original bug. A rejected
   * `stage()` is not a cosmetic problem — it is the one that left `sprite`
   * undefined, and with it the canvas unmounted and the screen indistinguishable
   * from loading. It has to be loud.
   */
  it('stops the garden when the rules never arrived', () => {
    expect(blocksPlay('engine')).toBe(true);
    expect(blocksPlay('stage')).toBe(true);
  });

  it('stops the garden when the gate never opened', () => {
    // The same shape one step earlier. A rejected `openRaidGate` used to leave
    // `gate` null with nothing watching, which now means a skeleton that never
    // resolves — a nicer-looking version of the identical bug.
    expect(blocksPlay('gate')).toBe(true);
  });

  it('leaves the garden standing when only the picture or one move failed', () => {
    expect(blocksPlay('scene')).toBe(false);
    expect(blocksPlay('round')).toBe(false);
  });

  it('is false when nothing is wrong', () => {
    expect(blocksPlay(null)).toBe(false);
  });
});

describe('needsTextMode', () => {
  it('is exactly the case where the fight survives its canvas', () => {
    expect(needsTextMode('scene')).toBe(true);
    for (const other of ALL.filter((f) => f !== 'scene')) {
      expect(needsTextMode(other), other).toBe(false);
    }
    expect(needsTextMode(null)).toBe(false);
  });

  it('never asks for text mode on a fault that already blocks play', () => {
    // The two are mutually exclusive by construction: a garden with no monster
    // has nothing to narrate either. If both were ever true the page would
    // render a battle log for a fight that does not exist.
    for (const fault of ALL) {
      expect(blocksPlay(fault) && needsTextMode(fault), fault).toBe(false);
    }
  });
});

describe('faultCopy', () => {
  it('answers for every fault', () => {
    for (const fault of ALL) {
      const copy = faultCopy(fault);
      expect(copy.title.length, fault).toBeGreaterThan(0);
      expect(copy.body.length, fault).toBeGreaterThan(20);
    }
  });

  it('offers a retry exactly where trying again could help', () => {
    // A failed round already put the turn back; tapping "try again" on it would
    // promise something the page cannot deliver.
    expect(faultCopy('gate').retry).toBe(true);
    expect(faultCopy('engine').retry).toBe(true);
    expect(faultCopy('stage').retry).toBe(true);
    expect(faultCopy('scene').retry).toBe(true);
    expect(faultCopy('round').retry).toBe(false);
  });

  /**
   * The product rule, as a test. "No guilt copy" is the first of the three
   * traps this overhaul is gated on, and an error screen is where that slips
   * first — it is the easiest place to write "you did something wrong".
   */
  it('never blames the person reading it', () => {
    const BLAMING = /you (?:missed|failed|forgot|broke|lost)|your fault|invalid|illegal|denied/i;
    for (const fault of ALL) {
      const { title, body } = faultCopy(fault);
      expect(`${title} ${body}`, fault).not.toMatch(BLAMING);
    }
  });

  it('says what is still true, not only what is missing', () => {
    // Every blocking fault reassures that logged data survived, because that is
    // the actual worry when a screen breaks in an app you keep your life in.
    for (const fault of ALL) {
      const { body } = faultCopy(fault);
      expect(body, fault).toMatch(/safe|still|affected|works/i);
    }
  });
});
