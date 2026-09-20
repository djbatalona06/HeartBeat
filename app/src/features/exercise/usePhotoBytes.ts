import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../../db/database';
import { cachePhotoBytes } from '../../db/repository';
import { fetchMedia } from '../../pwa/api';
import type { WorkoutPhoto } from '../../domain/types';

/**
 * How many photographs may be downloading at once, across every caller.
 *
 * This hook is per-component and fires on mount, which was fine while the only
 * thing using it showed two shots. A wall showing a week of both members'
 * proofs mounts up to twenty-eight at once, and twenty-eight parallel requests
 * at roughly 180 KiB each is a worse experience than four at a time on every
 * connection that is not a desk — the first picture arrives later, not sooner.
 *
 * Three, because the shots are small enough that the round trip dominates and
 * deep queues only delay the ones somebody is actually looking at.
 */
const MAX_IN_FLIGHT = 3;

let inFlight = 0;
const waiting: Array<() => void> = [];

/**
 * Run `job` once a slot is free.
 *
 * Module-level rather than per-component on purpose: the limit that matters is
 * how many requests this phone has open, and a gate inside the hook would be a
 * limit of one per cell, which is no limit at all.
 */
async function withSlot<T>(job: () => Promise<T | undefined>): Promise<T | undefined> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((release) => { waiting.push(release); });
  inFlight += 1;
  try {
    return await job();
  } finally {
    inFlight -= 1;
    // Hand the slot straight to whoever has been waiting longest, rather than
    // letting it sit idle until the next render.
    waiting.shift()?.();
  }
}

/**
 * The bytes for one shot, whoever took it.
 *
 * A photograph taken on this phone already has its bytes and renders instantly.
 * One pulled from the partner arrives as a key and nothing else, because sync
 * must not block on downloading photographs — a pull that waited for two of
 * them per day would be as slow as the worst connection either phone has had.
 *
 * So the fetch happens here, when something actually looks at the shot, and the
 * result is written back to the row so it only ever happens once. Downloads are
 * capped at `MAX_IN_FLIGHT` across the whole app; a cell that unmounts while
 * queued gives its turn up rather than spending it.
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
      const uri = await withSlot(async () => {
        // Scrolled away, or the day changed, while this was queued behind
        // three others. Give the slot back without spending it.
        if (cancelled) return undefined;
        return fetchMedia(key, token);
      });
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
