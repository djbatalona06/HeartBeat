import { describe, expect, it } from 'vitest';
import { HEAVY_CACHE, HEAVY_MAX_AGE_SECONDS, HEAVY_MAX_ENTRIES, isHeavyAsset } from './heavyAssets';

const ROOT = 'https://heartbeat-eop.pages.dev/';
const at = (path: string, origin = 'https://heartbeat-eop.pages.dev') => new URL(path, origin);

describe('isHeavyAsset', () => {
  it.each([
    '/assets/phaser-DT6cu8hy.js',
    '/assets/game.worker-9iSYOXJW.js',
    '/assets/mascot3d-yCawNFbJ.js',
    '/assets/dotnet.native.lg8t73zqup-IpqBezDv.wasm',
    '/assets/System.Private.CoreLib.xe8i5sx2oz-BqS6Mv4f.wasm',
    '/assets/HeartBeat.Game.Core.7yf5bvl9mx-B0_lON5J.wasm',
  ])('takes %s', (path) => {
    expect(isHeavyAsset(at(path), ROOT)).toBe(true);
  });

  it.each([
    '/',
    '/index.html',
    '/sw.js',
    '/api/entries',
    '/api/assets/phaser-x.js',
    // Precached: the service worker already serves these from its own cache.
    '/assets/index-Dft9kNk9.js',
    '/assets/index-u0VmF-Jd.css',
    '/assets/EveGardenPage-rH3faZcI.js',
    // Each of these has its own route in sw.ts; two routes answering one
    // request is an InvalidStateError on the second `respondWith`.
    '/assets/gear-art-DTnZJpWw.js',
    '/fonts/display/fraunces.woff2',
    // A name that merely contains a heavy prefix is not one.
    '/assets/notphaser-abc.js',
  ])('leaves %s alone', (path) => {
    expect(isHeavyAsset(at(path), ROOT)).toBe(false);
  });

  it('leaves another origin alone, even at the same path', () => {
    expect(isHeavyAsset(at('/assets/phaser-abc.js', 'https://cdn.example.com'), ROOT)).toBe(false);
  });

  it('follows a non-root APP_BASE, and only inside it', () => {
    const scope = 'https://example.github.io/heartbeat/';
    expect(isHeavyAsset(at('/heartbeat/assets/phaser-abc.js', 'https://example.github.io'), scope)).toBe(true);
    expect(isHeavyAsset(at('/heartbeat/assets/x.wasm', 'https://example.github.io'), scope)).toBe(true);
    expect(isHeavyAsset(at('/assets/phaser-abc.js', 'https://example.github.io'), scope)).toBe(false);
  });
});

describe('heavy cache settings', () => {
  it('names a versioned cache', () => {
    expect(HEAVY_CACHE).toBe('heavy-assets-v1');
  });

  it('keeps two deploys of the 15 heavy files with room to spare', () => {
    // 3 named chunks + 12 .wasm today. A deploy that renames all of them
    // leaves the old set beside the new until expiry evicts it.
    expect(HEAVY_MAX_ENTRIES).toBeGreaterThanOrEqual(2 * 15);
  });

  it('expires after 90 days', () => {
    expect(HEAVY_MAX_AGE_SECONDS).toBe(90 * 24 * 60 * 60);
  });
});
