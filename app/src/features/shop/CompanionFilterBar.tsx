import { useState } from 'react';
import { Chip } from '../../ui/Chip';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { SPECIES_NAMES } from '../../domain/rpg/pets';
import { RAID_STAT_NAMES, RAID_STATS, type RaidStatKey } from '../../domain/rpg/raidStats';
import { TIER_NAMES, type Tier } from '../../domain/rpg/tiers';
import {
  activeFilterCount,
  type CompanionFacets, type CompanionFilter, type CompanionSort, type SkillKind,
} from '../../domain/rpg/companionStats';

/**
 * The filter and sort controls for the "All companions" sheet.
 *
 * Every chip is offered only if something you own could match it
 * (`companionFacets`), so there are no dead buttons — a collector with three
 * commons sees three tier chips fewer than one with a mythic.
 *
 * Built from `Chip`, never a bare button: a set where one option wins is a
 * `role="radiogroup"` and a free toggle is a `role="group"` of `aria-pressed`
 * chips, which is what a screen reader needs to say "2 of 6" instead of
 * announcing a row of unrelated words. All the actual filtering is in
 * `domain/rpg/companionStats.ts`; this only edits a `CompanionFilter`.
 */

const SKILL_NAMES: Record<SkillKind, string> = {
  damage: 'Hits',
  shield: 'Shields',
  heal: 'Heals',
  energy: 'Gives energy',
};

const SORTS: { value: CompanionSort; label: string }[] = [
  { value: 'rank', label: 'Rank' },
  { value: 'tier', label: 'Tier' },
  { value: 'bond', label: 'Bond' },
  { value: 'total', label: 'Total stats' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name' },
];

export interface CompanionFilterBarProps {
  facets: CompanionFacets;
  filter: CompanionFilter;
  onChange: (next: CompanionFilter) => void;
  shown: number;
  total: number;
}

export function CompanionFilterBar({
  facets, filter, onChange, shown, total,
}: CompanionFilterBarProps) {
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(filter);
  const tiers = filter.tiers ?? [];
  const toggleTier = (tier: Tier) =>
    onChange({
      ...filter,
      tiers: tiers.includes(tier) ? tiers.filter((t) => t !== tier) : [...tiers, tier],
    });

  // Sorting by a stat is offered for the stats something gives, after the
  // general sorts, so "Resilience" can be picked without leaving the bar. The
  // sort and the Filters toggle are always visible; the five filter groups sit
  // behind the toggle so the list is not pushed a screen down the page.
  const statSorts = RAID_STATS.filter((key) => facets.stats.includes(key));
  const sort = filter.sort ?? 'rank';

  return (
    <div className="pet-filter">
      <div className="pet-filter-group">
        <span className="pet-filter-label" id="pet-filter-sort">Sort by</span>
        <div className="pet-filter-row" role="radiogroup" aria-labelledby="pet-filter-sort">
          {[...SORTS, ...statSorts.map((value) => ({ value, label: RAID_STAT_NAMES[value] }))].map((option) => (
            <Chip
              key={option.value}
              asRadio
              on={sort === option.value}
              onClick={() => onChange({ ...filter, sort: option.value })}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pet-filter-foot">
        <Chip on={open} onClick={() => setOpen((was) => !was)}>
          {active > 0 ? `Filters (${active})` : 'Filters'}
        </Chip>
        <span className="pet-filter-count" role="status">
          Showing {shown} of {total}
        </span>
        {active > 0 ? (
          <SecondaryAction onClick={() => onChange({ sort: filter.sort })}>Clear</SecondaryAction>
        ) : null}
      </div>

      {open ? (<>
      <div className="pet-filter-group">
        <span className="pet-filter-label" id="pet-filter-tier">Tier</span>
        <div className="pet-filter-row" role="group" aria-labelledby="pet-filter-tier">
          {facets.tiers.map((tier) => (
            <Chip key={tier} on={tiers.includes(tier)} onClick={() => toggleTier(tier)}>
              {TIER_NAMES[tier]}
            </Chip>
          ))}
        </div>
      </div>

      {facets.species.length > 1 ? (
        <div className="pet-filter-group">
          <span className="pet-filter-label" id="pet-filter-species">Kind</span>
          <div className="pet-filter-row" role="radiogroup" aria-labelledby="pet-filter-species">
            <Chip asRadio on={filter.species === undefined} onClick={() => onChange({ ...filter, species: undefined })}>
              Any
            </Chip>
            {facets.species.map((species) => (
              <Chip
                key={species}
                asRadio
                on={filter.species === species}
                onClick={() => onChange({ ...filter, species })}
              >
                {SPECIES_NAMES[species]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pet-filter-group">
        <span className="pet-filter-label" id="pet-filter-stat">Boosts</span>
        <div className="pet-filter-row" role="radiogroup" aria-labelledby="pet-filter-stat">
          <Chip asRadio on={filter.stat === undefined} onClick={() => onChange({ ...filter, stat: undefined })}>
            Any
          </Chip>
          {facets.stats.map((stat: RaidStatKey) => (
            <Chip
              key={stat}
              asRadio
              on={filter.stat === stat}
              onClick={() => onChange({ ...filter, stat })}
            >
              {RAID_STAT_NAMES[stat]}
            </Chip>
          ))}
        </div>
      </div>

      {facets.skills.length > 1 ? (
        <div className="pet-filter-group">
          <span className="pet-filter-label" id="pet-filter-skill">Skill</span>
          <div className="pet-filter-row" role="radiogroup" aria-labelledby="pet-filter-skill">
            <Chip asRadio on={filter.skill === undefined} onClick={() => onChange({ ...filter, skill: undefined })}>
              Any
            </Chip>
            {facets.skills.map((skill) => (
              <Chip
                key={skill}
                asRadio
                on={filter.skill === skill}
                onClick={() => onChange({ ...filter, skill })}
              >
                {SKILL_NAMES[skill]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pet-filter-group">
        <span className="pet-filter-label" id="pet-filter-only">Only</span>
        <div className="pet-filter-row" role="group" aria-labelledby="pet-filter-only">
          <Chip on={filter.walkingOnly === true} onClick={() => onChange({ ...filter, walkingOnly: !filter.walkingOnly })}>
            Walking
          </Chip>
          <Chip on={filter.maxedOnly === true} onClick={() => onChange({ ...filter, maxedOnly: !filter.maxedOnly })}>
            Max rank
          </Chip>
        </div>
      </div>

      </>) : null}
    </div>
  );
}
