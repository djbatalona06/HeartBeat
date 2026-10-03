import type { ComponentType } from 'react';
import { COSTUMES, costumeStyle } from '../../../../domain/rpg/costumes';

/**
 * One drawing per costume, laid over a mascot in the same 100×100 space every
 * mascot is drawn in: heads sit at roughly (50, 46) and the neck near y 68, so
 * hats stand on y 24 and scarves wrap y 62 to 72. The five mascots differ a
 * little from that, and a costume is drawn to sit well on all of them rather
 * than perfectly on one.
 *
 * **Painted in `--costume-main` and `--costume-trim` only**, never in
 * `--color-text`, `--color-accent` or `--color-text-muted` — those are the three
 * a dye sets, and a costume that read them would be recoloured every time the
 * bird was. `art.test.ts` reads this file to hold that. Every shape carries a
 * dark edge so it stays legible on any of the five packs.
 */

const EDGE = '#2f2a33';
const main = 'var(--costume-main)';
const trim = 'var(--costume-trim)';
const edge = { stroke: EDGE, strokeWidth: 1.6, strokeLinejoin: 'round' as const };

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true">{children}</svg>
);

function BowTie() {
  return (
    <Svg>
      <path d="M50 70 L36 62 L36 78 Z" fill={main} {...edge} />
      <path d="M50 70 L64 62 L64 78 Z" fill={main} {...edge} />
      <circle cx="50" cy="70" r="4" fill={trim} {...edge} />
    </Svg>
  );
}

function PartyCone() {
  return (
    <Svg>
      <path d="M50 4 L37 27 L63 27 Z" fill={main} {...edge} />
      <path d="M44 15 L56 15 M41 21 L59 21" stroke={trim} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="50" cy="5" r="4.5" fill={trim} {...edge} />
    </Svg>
  );
}

function FlowerCrown() {
  const blooms: Array<[number, number]> = [[31, 28], [40, 22], [50, 20], [60, 22], [69, 28]];
  return (
    <Svg>
      <path d="M28 30 Q50 14 72 30" fill="none" stroke="#5e8c4a" strokeWidth="3" strokeLinecap="round" />
      {blooms.map(([x, y], i) => (
        <g key={x}>
          <circle cx={x} cy={y} r="5.2" fill={i % 2 === 0 ? main : trim} {...edge} />
          <circle cx={x} cy={y} r="1.6" fill={i % 2 === 0 ? trim : main} />
        </g>
      ))}
    </Svg>
  );
}

function Scarf() {
  return (
    <Svg>
      <path d="M27 63 Q50 76 73 63 L73 72 Q50 85 27 72 Z" fill={main} {...edge} />
      <path d="M58 76 L70 74 L72 94 L60 96 Z" fill={main} {...edge} />
      <path d="M59 88 L71 86 M59 93 L72 91" stroke={trim} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M33 67 L37 74 M43 70 L46 77 M53 71 L55 78" stroke={trim} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

function WizardHat() {
  return (
    <Svg>
      <path d="M52 1 L36 28 L66 28 Z" fill={main} {...edge} />
      <ellipse cx="50" cy="28" rx="23" ry="5" fill={main} {...edge} />
      <path d="M38 24 Q51 29 64 24" fill="none" stroke={trim} strokeWidth="3" strokeLinecap="round" />
      <path d="M52 11 L54 16 L59 16 L55 19 L57 24 L52 21 L47 24 L49 19 L45 16 L50 16 Z" fill={trim} />
    </Svg>
  );
}

function Cape() {
  return (
    <Svg>
      <path d="M32 68 L16 94 L38 90 Z" fill={main} {...edge} />
      <path d="M68 68 L84 94 L62 90 Z" fill={main} {...edge} />
      <path d="M32 68 Q50 76 68 68" fill="none" stroke={trim} strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="73" r="4" fill={trim} {...edge} />
    </Svg>
  );
}

const ART: Record<string, ComponentType> = {
  'costume-bow-tie': BowTie,
  'costume-party-cone': PartyCone,
  'costume-flower-crown': FlowerCrown,
  'costume-scarf': Scarf,
  'costume-wizard-hat': WizardHat,
  'costume-cape': Cape,
};

// Walked from the catalogue so a costume added without a drawing throws at
// import, in CI, rather than showing as a gap the first time somebody opens the
// shop — the same arrangement `art/gear/index.ts` makes.
for (const costume of COSTUMES) {
  if (!ART[costume.id]) throw new Error(`costume ${costume.id} has no drawing`);
}

export function costumeArt(id: string | undefined): ComponentType | undefined {
  return id ? ART[id] : undefined;
}

/** A costume laid over whatever box it is placed in. Nothing when no costume is worn. */
export function CostumeLayer({ id }: { id: string | undefined }) {
  const Art = costumeArt(id);
  if (!Art) return null;
  return (
    <span className="costume-layer" style={costumeStyle(id) as React.CSSProperties} aria-hidden="true">
      <Art />
    </span>
  );
}
