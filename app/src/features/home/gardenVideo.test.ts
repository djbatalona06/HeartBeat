import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../themes';
import { GARDEN_VIDEO_FILES, gardenVideoSrc } from './gardenVideo';

const PUBLIC = resolve(__dirname, '../../../public/media/heartbeat-gardens');

describe('garden videos', () => {
  it('give every theme a film and every film a theme', () => {
    expect(Object.keys(GARDEN_VIDEO_FILES).sort()).toEqual(THEMES.map((t) => t.id).sort());
  });

  it('point at files that are actually in public/', () => {
    for (const file of Object.values(GARDEN_VIDEO_FILES)) {
      expect(existsSync(resolve(PUBLIC, file)), file).toBe(true);
    }
  });

  it('play with motion allowed', () => {
    expect(gardenVideoSrc('kitty', false, '/')).toBe(
      '/media/heartbeat-gardens/01-kitty-garden.mp4',
    );
  });

  it('keep the drawn garden for calm and reduced motion', () => {
    expect(gardenVideoSrc('kitty', true, '/')).toBeNull();
  });

  it('keep the drawn garden for a theme it has never heard of', () => {
    expect(gardenVideoSrc('nope', false, '/')).toBeNull();
  });

  it('respect a sub-path base', () => {
    expect(gardenVideoSrc('pony', false, '/heartbeat/')).toBe(
      '/heartbeat/media/heartbeat-gardens/05-pony-garden.mp4',
    );
  });
});
