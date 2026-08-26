import { describe, expect, it } from 'vitest';
import { resolveAllowedOrigin } from './cors';

const ALLOWED = 'https://heartbeat.pages.dev,https://*.heartbeat.pages.dev';

describe('resolveAllowedOrigin', () => {
  it('accepts an exact match', () => {
    expect(resolveAllowedOrigin('https://heartbeat.pages.dev', ALLOWED)).toBe('https://heartbeat.pages.dev');
  });

  it('accepts a single-label wildcard subdomain', () => {
    expect(resolveAllowedOrigin('https://abc123.heartbeat.pages.dev', ALLOWED))
      .toBe('https://abc123.heartbeat.pages.dev');
  });

  it('rejects a suffix-confusion attack', () => {
    // The whole reason this parses URLs instead of calling endsWith.
    expect(resolveAllowedOrigin('https://heartbeat.pages.dev.attacker.com', ALLOWED)).toBeNull();
  });

  it('rejects a deeper subdomain than the wildcard allows', () => {
    expect(resolveAllowedOrigin('https://a.b.heartbeat.pages.dev', ALLOWED)).toBeNull();
  });

  it('rejects a protocol downgrade', () => {
    expect(resolveAllowedOrigin('http://heartbeat.pages.dev', ALLOWED)).toBeNull();
  });

  it('rejects a missing or unparseable origin', () => {
    expect(resolveAllowedOrigin(null, ALLOWED)).toBeNull();
    expect(resolveAllowedOrigin('not a url', ALLOWED)).toBeNull();
  });

  it('rejects everything when the allow list is empty', () => {
    expect(resolveAllowedOrigin('https://heartbeat.pages.dev', '')).toBeNull();
  });
});
