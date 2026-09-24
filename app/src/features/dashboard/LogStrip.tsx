import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { todaysCharges } from '../../db/repository';
import { Icon } from '../../components/icons';
import type { IconName } from '../../nav';
import type { DayKey } from '../../domain/types';
import type { Charge } from '../eve-garden/engine/types';

/**
 * The three logs that each light a charge on their own, one tap from Home.
 *
 * Links rather than forms: each page already has its own form, validation and
 * receipt, and a second copy here is two places to keep in step. Rest,
 * Gratitude and Nourish are flags on the mood check-in, so Mood covers them.
 */
const LOGS: readonly { charge: Charge; to: string; label: string; icon: IconName }[] = [
  { charge: 'Mood', to: '/mood', label: 'Mood', icon: 'mood' },
  { charge: 'Exercise', to: '/exercise', label: 'Move', icon: 'dumbbell' },
  { charge: 'Work', to: '/work', label: 'Work', icon: 'calendar' },
];

/**
 * Lit means *either* of you logged it today — the same query Eve's Garden
 * reads, so the check here and the charge in the fight cannot disagree.
 *
 * No red, no "missed", no count of what is left: an unlit log is a plain
 * button, and a lit one gets a check. The same tone rule the greeting and the
 * notify schedule hold.
 */
export function LogStrip({ day }: { day: DayKey }) {
  const lit = useLiveQuery(() => todaysCharges(day), [day]);
  return (
    <nav className="home-log" aria-label="Log today">
      {LOGS.map(({ charge, to, label, icon }) => {
        const done = lit?.includes(charge) === true;
        return (
          <Link
            key={charge}
            to={to}
            className="home-log-item"
            data-lit={done ? 'true' : 'false'}
            aria-label={done ? `Log ${label.toLowerCase()} (done today)` : `Log ${label.toLowerCase()}`}
          >
            <span className="home-log-glyph"><Icon name={icon} /></span>
            <span>{label}</span>
            {done ? <span className="home-log-done" aria-hidden="true">✓</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
