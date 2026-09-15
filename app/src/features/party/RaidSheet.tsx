import { loadoutSheet } from '../../domain/rpg/loadout';
import {
  RAID_STATS, RAID_STAT_BLURBS, RAID_STAT_NAMES, type RaidStatKey,
} from '../../domain/rpg/raidStats';
import { TIER_NAMES } from '../../domain/rpg/tiers';
import { levelOf } from '../../domain/rpg/avatar';
import { refineByItemId, type InventoryItem } from '../../domain/rpg/inventory';
import { levelForXp } from '../../domain/xp';
import type { Avatar } from '../../domain/rpg/types';
import type { House } from '../../domain/rpg/furniture';
import type { PetInstance } from '../../domain/rpg/pets';

/**
 * What the two of you are actually worth in a raid, and where every point of
 * it came from.
 *
 * ## Why the provenance is the point
 *
 * Every item, cushion, colourway and companion in this app now carries a number
 * — that is the rule `raidStats.ts` exists to enforce — and a rule nobody can
 * see is a rule nobody believes. A bare seven-number sheet would be worse than
 * none: it would be seven figures a couple has to take on trust, with no way to
 * answer "would the other boots be better".
 *
 * So the sheet lists its sources. `StatSource.label` is carried through the
 * whole calculation for exactly this screen, and the reason it is carried
 * rather than re-derived is that a total with no provenance is a number to be
 * argued with and no way to argue.
 *
 * ## The passive line
 *
 * Shown as a separate figure rather than folded silently into the total,
 * because it is the half that does not behave linearly: a second source of the
 * same buff is worth 70% of the first and the fifth is worth chasing less than
 * something else entirely. A couple who cannot see the falloff cannot make that
 * trade, and the trade is the whole reason the falloff exists.
 */

export interface RaidSheetProps {
  avatar: Avatar;
  owned: InventoryItem[];
  /** The couple's shared pet XP. The headline number's source. */
  petXp: number;
  house: House;
  companion?: PetInstance;
}

export function RaidSheet({ avatar, owned, petXp, house, companion }: RaidSheetProps) {
  const sheet = loadoutSheet({
    petLevel: levelForXp(petXp),
    memberLevel: levelOf(avatar),
    equipped: avatar.gear,
    refineByItemId: refineByItemId(owned),
    house,
    dyeId: avatar.dye,
    companion,
  });

  // Biggest first: the sheet should open on the thing the two of you are best
  // at, not on whichever stat happens to be first in the type.
  const ordered = [...RAID_STATS].sort((a, b) => sheet.total[b] - sheet.total[a]);
  const ceiling = Math.max(1, ...RAID_STATS.map((key) => sheet.total[key]));

  return (
    <section className="panel raid-sheet">
      <h2 className="section-title">Raid sheet</h2>
      <p className="section-sub">
        What the two of you bring through the gate. Everything you own is in
        here — the rug included.
      </p>

      <ul className="raid-stats">
        {ordered.map((key) => (
          <RaidStatRow
            key={key}
            stat={key}
            base={sheet.base[key]}
            total={sheet.total[key]}
            passive={sheet.passives[key]}
            ceiling={ceiling}
          />
        ))}
      </ul>

      <h3 className="raid-sources-title">Where it comes from</h3>
      <ul className="raid-sources">
        {sheet.sources.map((source) => (
          <li key={source.id} className="raid-source" data-tier={source.tier}>
            <span className="raid-source-name">{source.label}</span>
            <span className="raid-source-tier">{TIER_NAMES[source.tier]}</span>
            <span className="raid-source-level">
              {source.statLevel} into {RAID_STAT_NAMES[source.order[0]]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RaidStatRow({ stat, base, total, passive, ceiling }: {
  stat: RaidStatKey;
  base: number;
  total: number;
  passive: number;
  ceiling: number;
}) {
  const percent = Math.round(passive * 1000) / 10;
  return (
    <li className="raid-stat" title={RAID_STAT_BLURBS[stat]}>
      <span className="raid-stat-name">{RAID_STAT_NAMES[stat]}</span>
      <span className="raid-stat-bar" aria-hidden="true">
        <span className="raid-stat-fill" style={{ width: `${(total / ceiling) * 100}%` }} />
      </span>
      <span className="raid-stat-value">
        {total}
        {percent > 0 && <span className="raid-stat-passive"> +{percent}%</span>}
      </span>
      {/* The base is only worth saying when a passive has moved it; otherwise
          it is the same number twice. */}
      {percent > 0 && <span className="raid-stat-base">from {base}</span>}
    </li>
  );
}
