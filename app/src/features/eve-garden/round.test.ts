import { describe, expect, it, vi } from 'vitest';
import { settle, shouldRedriveMonster } from './round';

describe('shouldRedriveMonster', () => {
  const monsterTurn = { outcome: 'Fighting', turn: 'Monster' };

  it('plays the monster when a fight opens on its turn', () => {
    expect(shouldRedriveMonster(monsterTurn, 'idle')).toBe(true);
  });

  it('leaves the player\'s turn alone', () => {
    expect(shouldRedriveMonster({ outcome: 'Fighting', turn: 'Player' }, 'idle')).toBe(false);
  });

  it('never races a round that is still animating', () => {
    expect(shouldRedriveMonster(monsterTurn, 'acting')).toBe(false);
  });

  it('does nothing once the fight is over, or before it starts', () => {
    expect(shouldRedriveMonster({ outcome: 'Won', turn: 'Monster' }, 'idle')).toBe(false);
    expect(shouldRedriveMonster({ outcome: 'Down', turn: 'Monster' }, 'idle')).toBe(false);
    expect(shouldRedriveMonster(null, 'idle')).toBe(false);
  });
});

describe('settle', () => {
  it('returns as soon as the animation finishes', async () => {
    await expect(settle(Promise.resolve('done'), 1000)).resolves.toBeUndefined();
  });

  it('gives up on an animation that never resolves', async () => {
    vi.useFakeTimers();
    const hung = new Promise<void>(() => {});
    const done = settle(hung, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('swallows an animation that rejects, so the round still goes on', async () => {
    await expect(settle(Promise.reject(new Error('scene gone')), 1000)).resolves.toBeUndefined();
  });

  it('accepts no animation at all', async () => {
    await expect(settle(undefined)).resolves.toBeUndefined();
  });
});
