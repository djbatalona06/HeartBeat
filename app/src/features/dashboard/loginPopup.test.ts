import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPEN_WHILE_UNPAIRED } from '../../nav';

/**
 * The popup once sat over the pairing form on Settings and every `pair:live`
 * scenario timed out clicking through it. Components are not unit-tested by
 * design, so this reads the source, as `art.test.ts` does.
 */
describe('LoginPopup routes', () => {
  const source = readFileSync(resolve(__dirname, 'LoginPopup.tsx'), 'utf8');

  it('stays off every route an unpaired phone can use', () => {
    expect(source).toContain('OPEN_WHILE_UNPAIRED.includes(pathname)');
  });

  it('covers the pairing form, the first run and first aid', () => {
    for (const route of ['/settings', '/welcome', '/onboarding', '/activities/first-aid']) {
      expect(OPEN_WHILE_UNPAIRED, route).toContain(route);
    }
  });
});
