import { Link } from 'react-router-dom';
import { Icon } from '../../components/icons';
import { ACTIVITIES } from './catalogue';

/**
 * The activities hub: a grid of the things to do that are not a task.
 *
 * Finch's own Activities screen is the model, and the one thing deliberately
 * not copied is its density. That screen is widely and fairly criticised as
 * cluttered; what is worth taking is the idea that self-care is a *menu of
 * small things* rather than a single checklist, not the number of tiles.
 *
 * A grid rather than a list because these are peers — none of them is the
 * main one, and a list would imply an order that does not exist. The entries
 * are data in `catalogue.ts` so the hub and the router cannot disagree about
 * what exists, the same reason `nav.ts` is one registry.
 */
export function ActivitiesPage() {
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Activities</h1>
        <p className="page-sub">Small things to do. None of them take long.</p>
      </header>

      <div className="activity-grid">
        {ACTIVITIES.map((activity) => (
          <Link className="activity" to={activity.to} key={activity.to}>
            <span className="activity-glyph"><Icon name={activity.icon} /></span>
            <span className="activity-name">{activity.name}</span>
            <span className="activity-hint">{activity.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
