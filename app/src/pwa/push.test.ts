import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  // A real VAPID public key: 65 bytes, uncompressed P-256 point, leading 0x04.
  const KEY =
    'BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxaZa2Xfx1nBqfZjEnWyjqTPzc4pu-uMoRhLQFdF2ILhBmXaWCUY';

  it('decodes a base64url key to bytes starting with the uncompressed-point marker', () => {
    const bytes = urlBase64ToUint8Array(KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('is unaffected by whitespace a copy-paste or `wrangler secret put` can add', () => {
    const clean = urlBase64ToUint8Array(KEY);
    const withNewline = urlBase64ToUint8Array(`${KEY}\n`);
    const withSurroundingSpace = urlBase64ToUint8Array(`  ${KEY}  `);
    expect([...withNewline]).toEqual([...clean]);
    expect([...withSurroundingSpace]).toEqual([...clean]);
  });
});
