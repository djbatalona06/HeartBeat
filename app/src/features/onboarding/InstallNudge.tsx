import { saveSettings } from '../../db/database';
import { installState, isIos } from '../../pwa/install';
import { shouldReofferInstall } from '../../domain/notify/offer';
import type { Settings } from '../../domain/types';
import { ShareGlyph } from '../../components/ShareGlyph';

/**
 * The install steps again, for a phone still using the app in Safari.
 *
 * The Welcome screen shows them once, and "look around anyway" used to be the
 * end of it — which left the people most likely to miss notifications with no
 * reminder of why. This comes back every few days (`shouldReofferInstall`)
 * until the app is opened from the Home Screen, and "Not now" resets the wait.
 */
export function InstallNudge({ settings }: { settings: Settings | undefined }) {
  if (!settings || !shouldReofferInstall({
    state: installState(), ios: isIos(), offeredAt: settings.installOfferedAt, now: Date.now(),
  })) return null;

  return (
    <section className="panel install-nudge">
      <p className="section-sub">
        <strong>Put HeartBeat on your Home Screen.</strong> Tap <ShareGlyph /> Share, then
        {' '}<strong>Add to Home Screen</strong>, and open it from the icon. That is what lets
        your partner&rsquo;s nudges reach you.
      </p>
      <button
        type="button"
        className="chip"
        onClick={() => void saveSettings({ installOfferedAt: Date.now() })}
      >
        Not now
      </button>
    </section>
  );
}
