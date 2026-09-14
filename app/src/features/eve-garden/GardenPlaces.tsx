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
 * does. Three of these lead to screens that already exist and are already
 * whole — the habitat and the plots are the Birb tab, the alcove is the Shop —
 * so the honest version of "integrated into the garden architecture" is that
 * the garden knows how to get to them, not that they were rebuilt here.
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

      <Link className="garden-place" to="/birb">
        <span className="garden-place-name">Plots</span>
        <span className="garden-place-hint">Furniture, and what it is worth</span>
      </Link>

      <Link className="garden-place" to="/shop">
        <span className="garden-place-name">Alcove</span>
        <span className="garden-place-hint">Three chests, and the odds on them</span>
      </Link>

      <button type="button" className="garden-place" onClick={onChangeCompanion}>
        <span className="garden-place-name">The gate</span>
        <span className="garden-place-hint">{companion} came in with you</span>
      </button>
    </nav>
  );
}
