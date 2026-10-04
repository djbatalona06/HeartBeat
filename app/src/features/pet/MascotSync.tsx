import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { setAvatarMascot } from '../../db/repository';
import { useTheme } from '../../themes/ThemeProvider';

/**
 * Keeps the avatar's `mascot` equal to the theme showing, and renders nothing.
 *
 * The theme is a per-phone preference in `localStorage` (the theme engine has
 * deliberately never imported Dexie), so the partner's phone cannot read it.
 * Writing it onto the avatar, which already syncs, is how their Friends page
 * knows which bird to draw. Mounted once in `App`, inside the theme provider.
 */
export function MascotSync() {
  const { theme } = useTheme();
  const settings = useLiveQuery(loadSettings, []);
  const memberId = settings?.memberId;
  const mascot = useLiveQuery(
    async () => (memberId ? { for: memberId, value: (await db.avatars.get(memberId))?.mascot } : undefined),
    [memberId],
  );

  useEffect(() => {
    if (!memberId || !mascot || mascot.for !== memberId || mascot.value === theme.id) return;
    void setAvatarMascot(memberId, theme.id).catch(() => {});
  }, [memberId, mascot, theme.id]);

  return null;
}
