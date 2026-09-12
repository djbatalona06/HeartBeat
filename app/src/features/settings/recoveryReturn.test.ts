import { describe, expect, it } from 'vitest';
import { readRecoveryReturn, shouldClaim } from './recoveryReturn';

const at = (query: string) => readRecoveryReturn(new URLSearchParams(query));

/**
 * The mapping between what the callback sends and what a person reads.
 *
 * Worth pinning because the two ends are in different languages — one is a
 * Pages Function writing a URL parameter, the other is a sentence on a phone —
 * and the failure mode is silent: an outcome the callback added and this never
 * learned about renders as nothing at all, on the one screen somebody has
 * landed on specifically to find out what happened.
 */
describe('readRecoveryReturn', () => {
  it('says nothing at all on an ordinary visit to Settings', () => {
    expect(at('')).toBeNull();
    expect(at('other=1')).toBeNull();
  });

  it('reads every outcome the callback can send', () => {
    for (const outcome of ['linked', 'recovered', 'cancelled', 'unlinked', 'taken',
                           'unconfigured', 'failed']) {
      const result = at(`github=${outcome}`);
      expect(result?.outcome, outcome).toBe(outcome);
      expect(result?.message.length, outcome).toBeGreaterThan(0);
    }
  });

  it('treats a value it does not recognise as a failure rather than as nothing', () => {
    // A callback from a newer build. From the reader's side that is a failure
    // however it looked from the writer's, and silence would be worse.
    const result = at('github=something-new');
    expect(result?.outcome).toBe('failed');
    expect(result?.problem).toBe(true);
  });

  it('calls the good outcomes good and the bad ones bad', () => {
    for (const good of ['linked', 'recovered', 'cancelled']) {
      expect(at(`github=${good}`)?.problem, good).toBe(false);
    }
    for (const bad of ['unlinked', 'taken', 'unconfigured', 'failed']) {
      expect(at(`github=${bad}`)?.problem, bad).toBe(true);
    }
  });

  /** Pressing Cancel on GitHub's consent screen is a decision, not a bug. */
  it('does not report a cancellation as a problem', () => {
    expect(at('github=cancelled')?.problem).toBe(false);
  });

  it('carries the claim code when there is one', () => {
    expect(at('github=recovered&claim=abc')?.claim).toBe('abc');
    expect(at('github=recovered')?.claim).toBeUndefined();
  });
});

describe('shouldClaim', () => {
  it('exchanges the two outcomes that carry a code', () => {
    expect(shouldClaim(at('github=recovered&claim=abc'))).toBe(true);
    expect(shouldClaim(at('github=linked&claim=abc'))).toBe(true);
  });

  it('never exchanges a failure, even one that somehow carries a code', () => {
    for (const bad of ['failed', 'taken', 'unlinked', 'cancelled', 'unconfigured']) {
      expect(shouldClaim(at(`github=${bad}&claim=abc`)), bad).toBe(false);
    }
  });

  it('is false when there is nothing to exchange', () => {
    expect(shouldClaim(at('github=recovered'))).toBe(false);
    expect(shouldClaim(null)).toBe(false);
  });
});

/**
 * The second provider. One table serves both, so the thing worth pinning is
 * that the provider is carried through and named in the copy — a Google
 * failure that says "GitHub" is how somebody ends up looking for the wrong
 * account.
 */
describe('two providers, one table', () => {
  it('reads a Google return as Google', () => {
    const back = at('google=linked&claim=abc');
    expect(back?.provider).toBe('google');
    expect(back?.message).toContain('Google');
    expect(back?.message).not.toContain('GitHub');
  });

  it('still reads a GitHub return as GitHub', () => {
    const back = at('github=unlinked');
    expect(back?.provider).toBe('github');
    expect(back?.message).toContain('GitHub');
    expect(back?.message).not.toContain('Google');
  });

  it('exchanges a Google claim the same way', () => {
    expect(shouldClaim(at('google=recovered&claim=abc'))).toBe(true);
    expect(shouldClaim(at('google=failed&claim=abc'))).toBe(false);
  });

  it('says nothing when neither provider sent anything', () => {
    expect(at('theme=kitty')).toBeNull();
  });
});
