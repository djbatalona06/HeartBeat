import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { loadSettings } from '../../db/database';
import { clearPin, hasPin, hashPin, isValidPin, newSalt, sameHash, setPin, verifyPin } from './lock';

beforeEach(async () => {
  await db.settings.clear();
});

describe('hashPin', () => {
  it('is stable for the same PIN and salt', async () => {
    const salt = newSalt();
    expect(await hashPin('123456', salt)).toBe(await hashPin('123456', salt));
  });

  it('differs under a different salt, so two people with the same PIN do not match', async () => {
    expect(await hashPin('123456', newSalt())).not.toBe(await hashPin('123456', newSalt()));
  });

  it('differs for a different PIN', async () => {
    const salt = newSalt();
    expect(await hashPin('123456', salt)).not.toBe(await hashPin('123457', salt));
  });
});

describe('sameHash', () => {
  it('matches equal hashes and rejects unequal ones', () => {
    expect(sameHash('abc', 'abc')).toBe(true);
    expect(sameHash('abc', 'abd')).toBe(false);
    expect(sameHash('abc', 'ab')).toBe(false);
  });
});

describe('isValidPin', () => {
  it('takes four to eight digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
  });

  it('rejects anything shorter, longer, or not digits', () => {
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('')).toBe(false);
  });
});

describe('setPin and verifyPin', () => {
  it('accepts the PIN that was set', async () => {
    await setPin('246810');
    expect(await verifyPin('246810')).toBe(true);
  });

  it('rejects any other PIN', async () => {
    await setPin('246810');
    expect(await verifyPin('246811')).toBe(false);
  });

  it('never stores the PIN itself', async () => {
    await setPin('246810');
    const settings = await loadSettings();
    expect(settings.cyclePinHash).toBeTruthy();
    expect(JSON.stringify(settings)).not.toContain('246810');
  });

  it('verifies nothing before a PIN is set', async () => {
    expect(await hasPin()).toBe(false);
    expect(await verifyPin('1234')).toBe(false);
  });

  it('refuses a PIN that is too short to be worth stretching', async () => {
    await expect(setPin('12')).rejects.toThrow();
  });
});

describe('clearPin', () => {
  it('needs the PIN to remove the lock', async () => {
    await setPin('246810');
    expect(await clearPin('000000')).toBe(false);
    expect(await hasPin()).toBe(true);
  });

  it('removes it when the PIN is right', async () => {
    await setPin('246810');
    expect(await clearPin('246810')).toBe(true);
    expect(await hasPin()).toBe(false);
  });
});
