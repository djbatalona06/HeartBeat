/**
 * Costumes for the birb: things it wears, as opposed to the colour it is.
 *
 * A **dye** (`dyes.ts`) recolours the animal through three custom properties the
 * five mascots paint in. A **costume** is a drawing laid over it, and it paints
 * in two colours of its own — `--costume-main` and `--costume-trim` — that no dye
 * touches. That separation is the point: wearing a wizard hat never changes
 * what colour your bird is, and dyeing your bird never repaints the hat. The
 * art tests read the drawings to hold the second half of that.
 *
 * Purely cosmetic. A costume has no stat and stays out of the loadout, so
 * nothing here is ever the reason a fight is won.
 *
 * Bought with coins like a dye, one row each in the shared inventory table under
 * its own prefix, and worn through `Avatar.costume`.
 */

export const COSTUME_PREFIX = 'costume-';

export interface Costume {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** The garment's body colour. A mid-tone: the packs run near-black to near-white. */
  main: string;
  /** Its edging and small details. */
  trim: string;
}

export const COSTUMES: readonly Costume[] = [
  { id: 'costume-bow-tie', name: 'Bow tie', blurb: 'For no occasion in particular.', price: 60, main: '#2a7f9e', trim: '#f2cc6b' },
  { id: 'costume-party-cone', name: 'Party cone', blurb: 'Somebody, somewhere, is having a birthday.', price: 60, main: '#e76f51', trim: '#f4d35e' },
  { id: 'costume-flower-crown', name: 'Flower crown', blurb: 'Picked this morning. Probably.', price: 90, main: '#e8749a', trim: '#ffd95a' },
  { id: 'costume-scarf', name: 'Long scarf', blurb: 'Knitted slowly, by someone who cared.', price: 90, main: '#d64550', trim: '#f6efe0' },
  { id: 'costume-wizard-hat', name: 'Wizard hat', blurb: 'Wisdom not included.', price: 150, main: '#6c5ce7', trim: '#ffd166' },
  { id: 'costume-cape', name: 'Little cape', blurb: 'Fastened with something shiny.', price: 150, main: '#8e44ad', trim: '#f4a261' },
];

export function costumeById(id: string | undefined): Costume | undefined {
  return id ? COSTUMES.find((costume) => costume.id === id) : undefined;
}

export function isCostumeItem(itemId: string): boolean {
  return itemId.startsWith(COSTUME_PREFIX);
}

/** The two custom properties a costume's drawing reads, as a style object. */
export function costumeStyle(id: string | undefined): Record<string, string> {
  const costume = costumeById(id);
  return costume ? { '--costume-main': costume.main, '--costume-trim': costume.trim } : {};
}
