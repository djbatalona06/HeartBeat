import { describe, expect, it } from 'vitest';
import {
  contentTypeFor,
  extensionFor,
  keyBelongsToCouple,
  mediaKey,
  parseMediaKey,
} from './objectKey';

const HASH = 'a'.repeat(64);
const COUPLE = 'couple-1';
const MEMBER = 'member-2';
const KEY = `media/${COUPLE}/${MEMBER}/${HASH}.webp`;

describe('mediaKey', () => {
  it('puts the couple first, so access is a prefix check and not a parse', () => {
    expect(mediaKey({ coupleId: COUPLE, memberId: MEMBER, hash: HASH, ext: 'webp' })).toBe(KEY);
  });

  it('round-trips through parseMediaKey', () => {
    expect(parseMediaKey(KEY)).toEqual({
      coupleId: COUPLE,
      memberId: MEMBER,
      hash: HASH,
      ext: 'webp',
    });
  });

  it('is the same key for the same bytes, so a retake costs no second object', () => {
    const a = mediaKey({ coupleId: COUPLE, memberId: MEMBER, hash: HASH, ext: 'webp' });
    const b = mediaKey({ coupleId: COUPLE, memberId: MEMBER, hash: HASH, ext: 'webp' });
    expect(a).toBe(b);
  });

  it('refuses anything that could climb out of the prefix', () => {
    for (const bad of ['../other', 'a/b', '..', 'x'.repeat(65), '']) {
      expect(() => mediaKey({ coupleId: bad, memberId: MEMBER, hash: HASH, ext: 'webp' }))
        .toThrow();
      expect(() => mediaKey({ coupleId: COUPLE, memberId: bad, hash: HASH, ext: 'webp' }))
        .toThrow();
    }
  });

  it('insists the name really is a sha-256', () => {
    // A key that is not content-addressed would be guessable.
    for (const bad of ['short', HASH.toUpperCase(), `${HASH}a`, 'g'.repeat(64)]) {
      expect(() => mediaKey({ coupleId: COUPLE, memberId: MEMBER, hash: bad, ext: 'webp' }))
        .toThrow();
    }
  });

  it('refuses a type the app does not store', () => {
    expect(() => mediaKey({ coupleId: COUPLE, memberId: MEMBER, hash: HASH, ext: 'svg' }))
      .toThrow();
  });
});

describe('parseMediaKey', () => {
  it('returns null rather than throwing, because it parses the wire', () => {
    for (const bad of [
      '',
      'media/only/three/parts/too-many',
      `other/${COUPLE}/${MEMBER}/${HASH}.webp`,
      `media/${COUPLE}/${MEMBER}/${HASH}`,
      `media/${COUPLE}/${MEMBER}/.webp`,
      `media/../${MEMBER}/${HASH}.webp`,
      `media/${COUPLE}/${MEMBER}/${HASH}.svg`,
    ]) {
      expect(parseMediaKey(bad)).toBeNull();
    }
  });
});

describe('keyBelongsToCouple', () => {
  it('lets a couple read their own', () => {
    expect(keyBelongsToCouple(KEY, COUPLE)).toBe(true);
  });

  it('refuses another couple, even holding a valid token', () => {
    // This is the whole access check for /api/media.
    expect(keyBelongsToCouple(KEY, 'couple-9')).toBe(false);
  });

  it('refuses a key it cannot parse at all', () => {
    expect(keyBelongsToCouple('nonsense', COUPLE)).toBe(false);
  });

  it('is not fooled by a couple id that merely starts the same', () => {
    expect(keyBelongsToCouple(`media/couple-10/${MEMBER}/${HASH}.webp`, 'couple-1')).toBe(false);
  });
});

describe('content types', () => {
  it('maps what the camera produces', () => {
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('image/jpeg; charset=binary')).toBe('jpg');
    expect(extensionFor('IMAGE/PNG')).toBe('png');
  });

  it('refuses anything else, rather than storing it under a guess', () => {
    expect(extensionFor('image/svg+xml')).toBeNull();
    expect(extensionFor('text/html')).toBeNull();
  });

  it('maps back for the response header', () => {
    expect(contentTypeFor('webp')).toBe('image/webp');
    expect(contentTypeFor('jpg')).toBe('image/jpeg');
  });
});
