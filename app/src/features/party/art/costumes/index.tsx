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

function Beanie() {
  return (
    <Svg>
      <path d="M30 30 Q30 8 50 8 Q70 8 70 30 Z" fill={main} {...edge} />
      <rect x="28" y="28" width="44" height="8" rx="3" fill={trim} {...edge} />
      <circle cx="50" cy="7" r="5" fill={trim} {...edge} />
    </Svg>
  );
}

function Bandana() {
  return (
    <Svg>
      <path d="M31 64 L69 64 L50 87 Z" fill={main} {...edge} />
      <path d="M31 64 L69 64" stroke={trim} strokeWidth="3" strokeLinecap="round" />
      <circle cx="43" cy="71" r="1.8" fill={trim} />
      <circle cx="57" cy="71" r="1.8" fill={trim} />
      <circle cx="50" cy="78" r="1.8" fill={trim} />
    </Svg>
  );
}

function StrawHat() {
  return (
    <Svg>
      <ellipse cx="50" cy="29" rx="31" ry="6" fill={main} {...edge} />
      <path d="M36 29 Q36 9 50 9 Q64 9 64 29 Z" fill={main} {...edge} />
      <rect x="36" y="22" width="28" height="6" fill={trim} {...edge} />
    </Svg>
  );
}

function Headphones() {
  return (
    <Svg>
      <path d="M26 46 Q26 14 50 14 Q74 14 74 46" fill="none" stroke={EDGE} strokeWidth="7.5" strokeLinecap="round" />
      <path d="M26 46 Q26 14 50 14 Q74 14 74 46" fill="none" stroke={main} strokeWidth="4.5" strokeLinecap="round" />
      <rect x="17" y="40" width="12" height="20" rx="5" fill={main} {...edge} />
      <rect x="71" y="40" width="12" height="20" rx="5" fill={main} {...edge} />
      <circle cx="23" cy="50" r="2.6" fill={trim} />
      <circle cx="77" cy="50" r="2.6" fill={trim} />
    </Svg>
  );
}

function TopHat() {
  return (
    <Svg>
      <rect x="36" y="6" width="28" height="22" fill={main} {...edge} />
      <ellipse cx="50" cy="6" rx="14" ry="3.5" fill={main} {...edge} />
      <rect x="36" y="20" width="28" height="5.5" fill={trim} {...edge} />
      <ellipse cx="50" cy="28" rx="23" ry="4.5" fill={main} {...edge} />
    </Svg>
  );
}

function StarlitCrown() {
  return (
    <Svg>
      <path d="M29 31 L29 21 L40 27 L50 13 L60 27 L71 21 L71 31 Z" fill={main} {...edge} />
      <rect x="29" y="28" width="42" height="4" fill={trim} {...edge} />
      <circle cx="29" cy="20" r="3" fill={trim} {...edge} />
      <circle cx="50" cy="12" r="3.4" fill={trim} {...edge} />
      <circle cx="71" cy="20" r="3" fill={trim} {...edge} />
    </Svg>
  );
}

function PhoenixPlume() {
  return (
    <Svg>
      <path d="M46 27 Q31 19 28 3 Q44 9 46 27 Z" fill={trim} {...edge} />
      <path d="M54 27 Q69 19 72 3 Q56 9 54 27 Z" fill={trim} {...edge} />
      <path d="M50 27 Q40 14 50 0 Q60 14 50 27 Z" fill={main} {...edge} />
      <path d="M50 24 Q46 15 50 8 Q54 15 50 24 Z" fill={trim} />
    </Svg>
  );
}

function EclipseCrown() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <Svg>
      <g stroke={trim} strokeWidth="2.4" strokeLinecap="round">
        {rays.map((deg) => (
          <line
            key={deg}
            x1={50 + 12 * Math.cos((deg * Math.PI) / 180)}
            y1={17 + 12 * Math.sin((deg * Math.PI) / 180)}
            x2={50 + 16 * Math.cos((deg * Math.PI) / 180)}
            y2={17 + 16 * Math.sin((deg * Math.PI) / 180)}
          />
        ))}
      </g>
      <circle cx="50" cy="17" r="9" fill={main} {...edge} />
      <path d="M41 18 A9 9 0 0 1 59 18" fill="none" stroke={trim} strokeWidth="1.6" />
    </Svg>
  );
}

function HeartboundWings() {
  const wing = (
    <g>
      <path d="M32 64 Q10 44 6 66 Q16 62 14 74 Q22 68 22 80 Q30 72 36 74 Z" fill={main} {...edge} />
      <path d="M30 68 Q19 62 13 67 M28 73 Q22 70 19 75" fill="none" stroke={trim} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
  return (
    <Svg>
      {wing}
      <g transform="translate(100 0) scale(-1 1)">{wing}</g>
      <path d="M50 85 C38 75 40 67 46 67 C48 67 50 69 50 71 C50 69 52 67 54 67 C60 67 62 75 50 85 Z" fill={trim} {...edge} />
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
  'costume-beanie': Beanie,
  'costume-bandana': Bandana,
  'costume-straw-hat': StrawHat,
  'costume-headphones': Headphones,
  'costume-top-hat': TopHat,
  'costume-starlit-crown': StarlitCrown,
  'costume-phoenix-plume': PhoenixPlume,
  'costume-eclipse-crown': EclipseCrown,
  'costume-heartbound-wings': HeartboundWings,
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
