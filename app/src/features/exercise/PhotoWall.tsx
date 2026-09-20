import { useLiveQuery } from 'dexie-react-hooks';
import { photosInRange } from '../../db/repository';
import { weekOf } from '../../domain/day';
import { facingLabel } from './photo';
import { usePhotoBytes } from './usePhotoBytes';
import { EmptyState } from '../../ui/EmptyState';
import type { DayKey, WorkoutPhoto } from '../../domain/types';

/**
 * The week's proofs, both of yours.
 *
 * ## Why this needed almost no plumbing
 *
 * The partner's rows were already on this phone and nobody was looking at
 * them. `pwa/sync.ts` applies a pulled `photo` entry without consulting whose
 * it is, `functions/api/entries.ts` serves both members to either phone,
 * `/api/media` authorises on the couple segment of the key so this device's own
 * bearer can fetch a shot the other took, and `usePhotoBytes` was written for
 * "whoever took it" from the start. Everything under the surface assumed this
 * screen would exist; only the read and the grid were missing.
 *
 * ## A week, not an album
 *
 * Scoped to the week the page is showing, which the arrows and the strip above
 * already move. An album of everything is unbounded — two people, two cameras,
 * a year — and it would mount hundreds of cells each wanting bytes from R2.
 * A week is at most twenty-eight and reaching March is the same gesture as
 * reaching Tuesday, which is a gesture the screen already teaches.
 *
 * ## Keyed by who, when and which camera — never by id
 *
 * A pulled row's primary key is synthesised as `<entryId>-<index>`, and
 * `applyEntry` deletes the whole day and re-puts it on every winning sync. So
 * ids churn: keying on one would remount every cell, and drop every fetched
 * photograph, each time the other phone saved anything at all.
 */
export interface PhotoWallProps {
  /** This device's member, so a shot can be labelled theirs or yours. */
  memberId: string | null;
  /** Any day in the week to show. */
  day: DayKey;
}

export function PhotoWall({ memberId, day }: PhotoWallProps) {
  const week = weekOf(day);
  const photos = useLiveQuery(
    () => photosInRange(week[0]!, week[6]!),
    [week[0], week[6]],
  );

  // Undefined is a query that has not answered; an empty array is a week with
  // no proofs in it. Saying "nothing yet" during the first frame of a week that
  // has six photographs in it is worse than saying nothing.
  if (photos === undefined) return null;

  return (
    <section className="sheet">
      <h2 className="section-title">The week in pictures</h2>
      <p className="section-sub">Both of you, newest first.</p>

      {photos.length === 0 ? (
        <EmptyState glyph="▢">
          Photographs from this week will show up here, yours and theirs.
        </EmptyState>
      ) : (
        <ul className="wall">
          {photos.map((photo) => (
            <Shot
              key={`${photo.memberId}:${photo.day}:${photo.facing}`}
              photo={photo}
              mine={photo.memberId === memberId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One cell.
 *
 * Its own component because `usePhotoBytes` is a hook and a cell needs one
 * each — and because that is what lets the download gate inside it see a cell
 * that scrolled away and give its turn to one that did not.
 */
function Shot({ photo, mine }: { photo: WorkoutPhoto; mine: boolean }) {
  const shown = usePhotoBytes(photo);
  const whose = mine ? 'You' : 'Them';
  const what = facingLabel(photo.facing).toLowerCase();

  return (
    <li className="wall-cell">
      {shown ? (
        <img className="wall-shot" src={shown} alt={`${whose}, ${what}, ${photo.day}`} />
      ) : (
        // The row is here and the bytes are on their way. A placeholder rather
        // than an <img> with no src, which paints a broken-image icon — the
        // same reason `CameraCapture` has one.
        <div className="wall-slot" aria-busy="true">
          <span className="wall-slot-text">…</span>
        </div>
      )}
      {/* Whose it is, said out loud. Two people's proofs in one grid with no
          labels is a grid where you cannot tell whether you trained. */}
      <span className="wall-who" data-mine={mine ? 'true' : undefined}>{whose}</span>
      <span className="wall-when">{Number(photo.day.slice(8, 10))}</span>
    </li>
  );
}
