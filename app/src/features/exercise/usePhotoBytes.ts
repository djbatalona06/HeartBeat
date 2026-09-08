import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../../db/database';
import { cachePhotoBytes } from '../../db/repository';
import { fetchMedia } from '../../pwa/api';
import type { WorkoutPhoto } from '../../domain/types';

/**
 * The bytes for one shot, whoever took it.
 *
 * A photograph taken on this phone already has its bytes and renders instantly.
 * One pulled from the partner arrives as a key and nothing else, because sync
 * must not block on downloading photographs — a pull that waited for two of
 * them per day would be as slow as the worst connection either phone has had.
 *
 * So the fetch happens here, when something actually looks at the shot, and the
 * result is written back to the row so it only ever happens once.
 */
export function usePhotoBytes(photo: WorkoutPhoto | undefined): string | undefined {
  const [fetched, setFetched] = useState<string | undefined>(undefined);

  // Read outside the effect and outside any live query on the photo itself:
  // loadSettings() inside a useLiveQuery callback re-fires it up to 20x per
  // foreground cycle, which for this hook would be 20 downloads.
  const token = useLiveQuery(async () => (await loadSettings()).workerSecret, [], undefined);

  const key = photo?.key;
  const id = photo?.id;
  const haveBytes = Boolean(photo?.dataUri);

  useEffect(() => {
    if (haveBytes || !key || !id || !token) return;
    let cancelled = false;
    void (async () => {
      const uri = await fetchMedia(key, token);
      if (cancelled || !uri) return;
      setFetched(uri);
      // Guarded inside: by now the row may have been replaced by a sync
      // carrying a different shot for that day.
      await cachePhotoBytes(id, key, uri);
    })();
    return () => {
      // The day changed, or the screen closed. A late response must not paint
      // the previous day's photograph over this one.
      cancelled = true;
    };
  }, [haveBytes, key, id, token]);

  return photo?.dataUri ?? fetched;
}
