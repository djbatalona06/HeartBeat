import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { openPurse } from '../../db/repository';
import { purseById, unopened } from '../../domain/rpg/coinSources';
import { useToast } from '../../ui/Toast';
import { SecondaryAction } from '../../ui/SecondaryAction';

/**
 * Coin purses you have found and not yet opened.
 *
 * Purses are found, not sold — a login award, a boss cleared together, the loot
 * a boss drops when you go back to it — so this shelf is only ever as full as
 * play has made it, and hides itself when it is empty.
 */
export function PurseShelf({ memberId }: { memberId: string }) {
  const { say } = useToast();
  const rows = useLiveQuery(
    () => db.inventory.where('memberId').equals(memberId).toArray(),
    [memberId],
  );
  const purses = unopened(rows ?? []);
  if (purses.length === 0) return null;

  return (
    <section className="panel" aria-label="Coin purses">
      <h2 className="section-title">Purses</h2>
      <p className="section-sub">Found, not bought. Open one for the coins inside.</p>
      <ul className="purse-list">
        {purses.map((row) => {
          const purse = purseById(row.itemId);
          if (!purse) return null;
          return (
            <li key={row.id} className="purse-row">
              <span>{purse.name}</span>
              <SecondaryAction
                onClick={async () => {
                  const coins = await openPurse(memberId, row.id);
                  if (coins !== null) say(`+${coins} coins.`, 'success');
                }}
              >
                Open
              </SecondaryAction>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
