import type { ComponentType } from 'react';
import { FURNITURE } from '../../../../domain/rpg/furniture';

/**
 * One drawing per furniture piece, and the registry that refuses to ship
 * without them — the same guarantee as `art/gear/index.ts` and for the same
 * reason: an id in the catalogue with no art here throws at import rather than
 * quietly leaving a gap in the room.
 *
 * Unlike gear these live in one file rather than one file each. A gear drawing
 * is a standalone 100×100 character piece; these are six-line fragments that
 * only make sense positioned inside the one shared scene, and eight files of
 * six lines would be harder to read as the set they are.
 *
 * They paint in `--color-text`, `--color-accent` and `--color-text-muted`,
 * like everything else drawn in this app, so the room re-themes with the pack
 * and never fights the bird standing in it. Coordinates are in the scene's own
 * 100×100 space — see `Birbhouse` in PartyPage.
 */

const WALL = 'var(--color-text-muted)';
const WARM = 'var(--color-accent)';

function RainyWindow() {
  return (
    <>
      <rect x="58" y="18" width="28" height="30" rx="3" fill="none" stroke={WALL} strokeWidth="2" />
      <path d="M72 18v30M58 33h28" stroke={WALL} strokeWidth="1.4" />
      <path d="M63 24l-2 6M70 22l-2 6M78 25l-2 6M66 37l-2 6M75 38l-2 6"
        stroke={WARM} strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </>
  );
}

function MoonWindow() {
  return (
    <>
      <rect x="58" y="18" width="28" height="30" rx="3" fill="none" stroke={WALL} strokeWidth="2" />
      <path d="M77 28a7 7 0 1 1-7-7 5.5 5.5 0 0 0 7 7Z" fill={WARM} opacity="0.85" />
      <circle cx="64" cy="40" r="1.1" fill={WARM} opacity="0.7" />
      <circle cx="80" cy="41" r="0.9" fill={WARM} opacity="0.55" />
    </>
  );
}

function PaperGarland() {
  return (
    <>
      <path d="M10 20q22 12 44 0" fill="none" stroke={WALL} strokeWidth="1.3" />
      {[
        [17, 24], [26, 27], [36, 27.5], [45, 25], [52, 21.5],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x - 3} ${y} L${x + 3} ${y} L${x} ${y + 6} Z`}
          fill={WARM}
          opacity={i % 2 ? 0.55 : 0.8}
        />
      ))}
    </>
  );
}

function LittleShelf() {
  return (
    <>
      <rect x="12" y="30" width="34" height="2.6" rx="1.3" fill={WALL} />
      <rect x="16" y="22" width="5" height="8" rx="1" fill={WARM} opacity="0.8" />
      <rect x="24" y="24" width="4" height="6" rx="1" fill={WALL} />
      <circle cx="37" cy="26.5" r="3.5" fill={WARM} opacity="0.6" />
    </>
  );
}

function RoundRug() {
  return (
    <>
      <ellipse cx="50" cy="84" rx="30" ry="8" fill={WARM} opacity="0.35" />
      <ellipse cx="50" cy="84" rx="20" ry="5" fill="none" stroke={WARM} strokeWidth="1.2" opacity="0.55" />
    </>
  );
}

function Houseplant() {
  return (
    <>
      <path d="M17 86h12l-1.6 -9h-8.8Z" fill={WALL} />
      <path d="M23 77c0-7-4-10-7-11 1 6 3 9 7 11Z" fill={WARM} opacity="0.8" />
      <path d="M23 77c0-8 4-11 8-12-1 7-4 10-8 12Z" fill={WARM} opacity="0.6" />
      <path d="M23 77V70" stroke={WALL} strokeWidth="1.1" />
    </>
  );
}

function Swing() {
  return (
    <>
      <path d="M38 12v40M62 12v40" stroke={WALL} strokeWidth="1.3" />
      <rect x="34" y="52" width="32" height="3.4" rx="1.7" fill={WARM} opacity="0.9" />
    </>
  );
}

function BirchBranch() {
  return (
    <>
      <path d="M14 46q20 10 44 4t28 -6" fill="none" stroke={WALL} strokeWidth="3" strokeLinecap="round" />
      <path d="M30 50l-4 7M46 52l3 7M64 49l4 6" stroke={WALL} strokeWidth="1.1" strokeLinecap="round" />
      <ellipse cx="26" cy="58" rx="3" ry="1.8" fill={WARM} opacity="0.75" transform="rotate(-25 26 58)" />
      <ellipse cx="49.5" cy="60" rx="3" ry="1.8" fill={WARM} opacity="0.6" transform="rotate(20 49.5 60)" />
      <ellipse cx="68.5" cy="56" rx="3" ry="1.8" fill={WARM} opacity="0.7" transform="rotate(18 68.5 56)" />
    </>
  );
}

const ART: Record<string, ComponentType> = {
  'decor-window-rain': RainyWindow,
  'decor-window-moon': MoonWindow,
  'decor-wall-garland': PaperGarland,
  'decor-wall-shelf': LittleShelf,
  'decor-floor-rug': RoundRug,
  'decor-floor-plant': Houseplant,
  'decor-perch-swing': Swing,
  'decor-perch-branch': BirchBranch,
};

for (const item of FURNITURE) {
  if (!ART[item.id]) throw new Error(`furniture "${item.id}" has no drawing in art/house`);
}

export function houseArt(itemId: string | undefined): ComponentType | undefined {
  return itemId ? ART[itemId] : undefined;
}
