import { Link } from 'react-router-dom';

/**
 * The garden's other four places.
 *
 * The rebuild gave the garden zones — a habitat the companion idles in, plots
 * for furniture, the fountain that is the tether, the gate back to the arch,
 * and the alcove the chests are in. Four of those are *drawn* in
 * `GardenBackdrop`, and a place you can see but cannot walk to is scenery.
 *
 * This is the walking. It is a row of links rather than hotspots painted on the
 * SVG, and that is deliberate: a tappable region of a background image is
 * invisible to a screen reader, has no focus ring, and moves whenever the art
 * does.
 *
 * **The plots and the alcove are not here.** They used to be, pointing at other
 * tabs, and that was the version the plan explicitly asked against — a chest
 * alcove that is a link to the Shop is a separate screen wearing the garden's
 * name. Both are now in `GardenDrawer`, ten pixels above this row, in the
 * garden. What is left are the two places that genuinely *are* elsewhere and
 * the one that is a mode rather than a place.
 *
 * The fountain is absent on purpose. It is the tether, it is already on screen,
 * and there is nowhere to go and look at it more closely.
 */

export interface GardenPlacesProps {
  /** Whoever came through the gate, for the label on the way back to it. */
  companion: string;
  onChangeCompanion(): void;
}

export function GardenPlaces({ companion, onChangeCompanion }: GardenPlacesProps) {
  return (
    <nav className="garden-places" aria-label="Places in the garden">
      <Link className="garden-place" to="/birb">
        <span className="garden-place-name">Habitat</span>
        <span className="garden-place-hint">Where the companions live</span>
      </Link>

      <Link className="garden-place" to="/assets">
        <span className="garden-place-name">The wardrobe</span>
        <span className="garden-place-hint">Worn gear, and the raid sheet</span>
      </Link>

      <button type="button" className="garden-place" onClick={onChangeCompanion}>
        <span className="garden-place-name">The gate</span>
        <span className="garden-place-hint">{companion} came in with you</span>
      </button>
    </nav>
  );
}
