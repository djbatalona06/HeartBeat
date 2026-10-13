import { useState } from 'react';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { Sheet } from '../../ui/Sheet';
import { VERDICT_LABELS, forecastFits, forecastLine } from '../../domain/rpg/forecast';
import type { ForecastDto, MonsterDto } from './engine/types';

/**
 * The pre-fight forecast: one line above the board while you walk, and a
 * "Why?" sheet behind it.
 *
 * It never stands in the way. Walking in starts the fight exactly as before;
 * this only says, in words and never as a percentage, how this build tends to
 * do against the monster on the stage, and the sheet names the game reasons.
 * It is worked out from the fight's own inputs (`Forecast.cs`) and nothing
 * about the person, and the sheet says so, because a forecast that might be
 * reading your week is one nobody should trust.
 *
 * Hidden during a fight: the battle strip is the live region then, and a
 * prediction under a fight already in progress is noise.
 */
export interface FightForecastProps {
  forecast: ForecastDto | null;
  monster: MonsterDto | null;
}

export function FightForecast({ forecast, monster }: FightForecastProps) {
  const [open, setOpen] = useState(false);
  if (!forecast || !monster || !forecastFits(forecast, monster.id)) return null;

  return (
    <>
      <div className="garden-forecast">
        <p className="garden-forecast-line">{forecastLine(monster.name, forecast.verdict)}</p>
        <SecondaryAction aria-haspopup="dialog" onClick={() => setOpen(true)}>Why?</SecondaryAction>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label="Why this forecast"
        scrimClassName="menu-scrim"
        panelClassName="menu-panel garden-forecast-sheet"
        draggable
      >
        <h2 className="section-title">{VERDICT_LABELS[forecast.verdict]}</h2>
        <ul className="garden-forecast-reasons">
          {forecast.why.map((reason) => <li key={reason.code}>{reason.text}</li>)}
        </ul>
        <p className="section-sub">
          Worked out from this fight alone: your level, your moves, your gear,
          today&apos;s charges and {monster.name}. Nothing else about you.
        </p>
        <SecondaryAction onClick={() => setOpen(false)}>Close</SecondaryAction>
      </Sheet>
    </>
  );
}
