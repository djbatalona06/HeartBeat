import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FLORA, floraById, floraTier, plotsAt, type Garden } from '../../domain/rpg/plots';
import { nextMilestone } from '../../domain/rpg/milestones';
import { TIER_NAMES } from '../../domain/rpg/tiers';
import { levelForXp } from '../../domain/xp';
import { buyFlora, ownedFlora as ownedFloraOf, plantFlora } from '../../db/repository';
import type { useToast } from '../../ui/Toast';

/**
 * The Birbhouse's yard: the garden's plots, under the room on the Birb page.
 *
 * They used to sit in a drawer under the fight, beside a second copy of the
 * chest alcove. The fight page is for the fight, so both left it: the alcove
 * was already on the Shop, and the plots came here, next to the room and the
 * colours — the other things you arrange for the pet. What is planted is still
 * *drawn* in the garden (`GardenFlora`), so the ground you fill here is the
 * ground you walk on there.
 */

export interface GardenPlotsProps {
  memberId: string;
  coupleId: string;
  garden: Garden;
  /** The shared pet's XP; the plots it has reached follow from its level. */
  petXp: number;
  coins: number;
  say: ReturnType<typeof useToast>['say'];
}

/**
 * The ground, and what could go in it.
 *
 * A plot nobody has reached is not listed at all, and the next one is named
 * instead — "the first opens at level 2" is a reason to come back, where six
 * greyed rows is a list of things you cannot have.
 */
export function GardenPlots({ memberId, coupleId, garden, petXp, coins, say }: GardenPlotsProps) {
  const petLevel = levelForXp(petXp);
  const ownedFlora = useLiveQuery(() => ownedFloraOf(memberId), [memberId]) ?? [];
  const onPlant = async (plotId: string, floraId: string | undefined) => {
    const result = await plantFlora(memberId, coupleId, plotId, floraId);
    if (!result.ok) say(result.reason ?? null, 'error');
  };
  // Choosing a plant you do not own yet buys it *and* plants it. It used to
  // only buy, and the plot closed bare, so you had to open it again and pick
  // the same plant a second time.
  const onBuyAndPlant = async (plotId: string, floraId: string) => {
    const bought = await buyFlora(memberId, coupleId, floraId);
    if (!bought.ok) {
      say(bought.reason ?? null, 'error');
      return;
    }
    await onPlant(plotId, floraId);
  };
  const [chosen, setChosen] = useState<string | null>(null);
  const reached = plotsAt(petLevel);
  const owned = new Set(ownedFlora);
  const next = nextMilestone(petLevel);

  return (
    <div className="garden-plots">
      <h3 className="section-title">The yard</h3>
      <p className="section-sub">
        Ground opens as the two of you level. Each plant goes in one plot, and
        counts towards the raid sheet.
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
                          onClick={() => { void onPlant(plot.id, undefined); setChosen(null); }}
                        >
                          <span className="plot-choice-name">Dig it up</span>
                          <span className="plot-choice-note">Yours to plant elsewhere</span>
                        </button>
                      </li>
                    )}
                    {FLORA.map((flora) => {
                      const have = owned.has(flora.id);
                      const here = planted?.id === flora.id;
                      const elsewhere = !here
                        && Object.values(garden).some((id) => id === flora.id);
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
                              if (have) void onPlant(plot.id, flora.id);
                              else void onBuyAndPlant(plot.id, flora.id);
                              setChosen(null);
                            }}
                          >
                            <span className="plot-choice-name">{flora.name}</span>
                            <span className="plot-choice-note">
                              {here
                                ? 'Already here'
                                : elsewhere
                                  ? 'Move here'
                                  : have
                                    ? `Plant · ${TIER_NAMES[floraTier(flora)]}`
                                    : `Buy & plant · ${flora.price}`}
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
