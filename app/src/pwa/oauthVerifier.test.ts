import { beforeEach, describe, expect, it } from 'vitest';
import {
  newVerifier, rememberVerifier, sha256Hex, takeVerifier, type VerifierStore,
} from './oauthVerifier';

function memoryStore(): VerifierStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('oauthVerifier', () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => { store = memoryStore(); });

  it('makes a long random hex secret, different every time', () => {
    const a = newVerifier();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(newVerifier()).not.toBe(a);
  });

  /** The server compares against its own `hashToken`, so this must match it. */
  it('hashes to SHA-256 in lowercase hex', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('gives the secret back once, then forgets it', () => {
    rememberVerifier('google', 'secret', 1000, store);
    expect(takeVerifier('google', 2000, store)).toBe('secret');
    expect(takeVerifier('google', 2000, store)).toBeUndefined();
  });

  it('keeps each provider\'s secret apart', () => {
    rememberVerifier('google', 'g', 1000, store);
    rememberVerifier('github', 'h', 1000, store);
    expect(takeVerifier('github', 1500, store)).toBe('h');
    expect(takeVerifier('google', 1500, store)).toBe('g');
  });

  it('does not hand back a secret that has gone stale', () => {
    rememberVerifier('github', 'old', 1000, store);
    expect(takeVerifier('github', 1000 + 16 * 60 * 1000, store)).toBeUndefined();
  });

  it('survives garbage in storage', () => {
    store.setItem('heartbeat.oauth.verifier.github', '{not json');
    expect(takeVerifier('github', Date.now(), store)).toBeUndefined();
  });
});
