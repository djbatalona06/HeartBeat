import { useState } from 'react';
import { FLORA, emptyPlots, floraById, plotsAt, type Garden } from '../../domain/rpg/plots';
import { nextMilestone } from '../../domain/rpg/milestones';
import { TIER_NAMES } from '../../domain/rpg/tiers';
import { floraTier } from '../../domain/rpg/plots';
import { ChestAlcove } from '../party/ChestAlcove';

/**
 * The garden's two workbenches, in the garden.
 *
 * The plan asked for the chest alcove to be "integrated into the garden
 * architecture, not a separate screen", and the first pass linked to `/shop`,
 * which is exactly the thing it asked not to be. So the alcove is here, and it
 * is the *same component* the Shop tab renders — not a copy. Two chest grids
 * with two sets of odds would be two chances to publish a number that is not
 * the number, which is the one thing the odds are not allowed to be.
 *
 * Planting lives beside it for the same reason: the plots are drawn ten pixels
 * above this drawer, and being sent to another tab to fill one in is how a
 * garden stops feeling like somewhere you are standing.
 *
 * Both are collapsed behind a two-tab strip. The garden is the fight and the
 * scene; these are errands, and an errand that is always open is clutter.
 */

export interface GardenDrawerProps {
  garden: Garden;
  petLevel: number;
  coins: number;
  luck: number;
  chestPity: Readonly<Record<string, number>>;
  /** Flora ids this member owns and could put in the ground. */
  ownedFlora: readonly string[];
  busy: boolean;
  onPlant(plotId: string, floraId: string | undefined): void;
  onBuyFlora(floraId: string): void;
  onOpenChest(chestId: string): void;
}

type Bench = 'plots' | 'alcove' | null;

export function GardenDrawer(props: GardenDrawerProps) {
  const [open, setOpen] = useState<Bench>(null);
  const bare = emptyPlots(props.garden, props.petLevel).length;

  return (
    <section className="garden-drawer">
      <div className="garden-benches" role="tablist" aria-label="Things to do in the garden">
        <button
          type="button"
          role="tab"
          className="garden-bench"
          aria-selected={open === 'plots'}
          onClick={() => setOpen(open === 'plots' ? null : 'plots')}
        >
          <span className="garden-bench-name">The plots</span>
          <span className="garden-bench-hint">
            {plotsAt(props.petLevel).length === 0
              ? 'The first opens at level 2'
              : bare === 0
                ? 'All planted'
                : `${bare} still bare`}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          className="garden-bench"
          aria-selected={open === 'alcove'}
          onClick={() => setOpen(open === 'alcove' ? null : 'alcove')}
        >
          <span className="garden-bench-name">The alcove</span>
          <span className="garden-bench-hint">Three chests, {props.coins} coins</span>
        </button>
      </div>

      {open === 'plots' && <Plots {...props} />}

      {open === 'alcove' && (
        <ChestAlcove
          coins={props.coins}
          luck={props.luck}
          pity={props.chestPity}
          busy={props.busy}
          onOpen={props.onOpenChest}
        />
      )}
    </section>
  );
}

/**
 * The ground, and what could go in it.
 *
 * A plot nobody has reached is not listed at all, and the next one is named
 * instead — "the first opens at level 2" is a reason to come back, where six
 * greyed rows is a list of things you cannot have.
 */
function Plots({ garden, petLevel, coins, ownedFlora, onPlant, onBuyFlora }: GardenDrawerProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const reached = plotsAt(petLevel);
  const owned = new Set(ownedFlora);
  const next = nextMilestone(petLevel);

  return (
    <div className="panel garden-plots">
      <h2 className="section-title">The plots</h2>
      <p className="section-sub">
        Ground opens as the two of you level. Everything planted counts towards
        the raid sheet.
      </p>

      {reached.length === 0 ? (
        <p className="section-sub">
          Nothing is open yet. {next ? `${next.name} arrives at level ${next.level}.` : ''}
        </p>
      ) : (
        <ul className="plot-list">
          {reached.map((plot) => {
            const planted = floraById(garden[plot.id]);
            const picking = chosen === plot.id;
            return (
              <li key={plot.id} className="plot" data-planted={planted !== undefined || undefined}>
                <button
                  type="button"
                  className="plot-head"
                  aria-expanded={picking}
                  onClick={() => setChosen(picking ? null : plot.id)}
                >
                  <span className="plot-name">{plot.name}</span>
                  <span className="plot-state">{planted ? planted.name : 'Bare'}</span>
                  <span className="plot-blurb">{plot.blurb}</span>
                </button>

                {picking && (
                  <ul className="plot-choices">
                    {planted && (
                      <li>
                        <button
                          type="button"
                          className="plot-choice"
                          onClick={() => { onPlant(plot.id, undefined); setChosen(null); }}
                        >
                          <span className="plot-choice-name">Dig it up</span>
                          <span className="plot-choice-note">Back in the bag, not lost</span>
                        </button>
                      </li>
                    )}
                    {FLORA.map((flora) => {
                      const have = owned.has(flora.id);
                      const here = planted?.id === flora.id;
                      const afford = coins >= flora.price;
                      return (
                        <li key={flora.id}>
                          <button
                            type="button"
                            className="plot-choice"
                            data-owned={have || undefined}
                            disabled={here || (!have && !afford)}
                            title={flora.blurb}
                            onClick={() => {
                              if (have) onPlant(plot.id, flora.id);
                              else onBuyFlora(flora.id);
                              setChosen(null);
                            }}
                          >
                            <span className="plot-choice-name">{flora.name}</span>
                            <span className="plot-choice-note">
                              {here
                                ? 'Already here'
                                : have
                                  ? `Plant · ${TIER_NAMES[floraTier(flora)]}`
                                  : `${flora.price} coins`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {next && (
        <p className="section-sub plot-next">
          Next at level {next.level}: {next.name}. {next.blurb}
        </p>
      )}
    </div>
  );
}
