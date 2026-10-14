import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, loadSettings } from '../database';
import { setBoardKit } from './index';

/**
 * Picking the battle board's look is one field on this phone's settings, and the
 * only way in is `setBoardKit`. What matters is what can be read back, and that
 * nothing the app cannot draw is ever left in there.
 */

beforeEach(async () => {
  await db.settings.clear();
});

describe('setBoardKit', () => {
  it('starts as nothing stored, which is the classic board', async () => {
    expect((await loadSettings()).boardKit).toBeUndefined();
  });

  it('stores a known kit and reads it back', async () => {
    await setBoardKit('quilt');
    expect((await loadSettings()).boardKit).toBe('quilt');
  });

  it('stores the classic board for something it does not know, instead of leaving junk', async () => {
    await setBoardKit('quilt');
    await setBoardKit('sparkle');
    expect((await loadSettings()).boardKit).toBe('checker');
  });

  it('changes only the kit and leaves the rest of the settings alone', async () => {
    await db.settings.put({ ...(await loadSettings()), timeZone: 'Pacific/Auckland' });
    await setBoardKit('weave');
    const settings = await loadSettings();
    expect(settings.timeZone).toBe('Pacific/Auckland');
    expect(settings.boardKit).toBe('weave');
  });
});
