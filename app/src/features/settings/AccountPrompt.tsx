import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSettings } from '../../db/database';
import { isPaired } from '../../domain/identity/rekey';
import { providerLink, providerStart, type AuthProvider } from '../../pwa/api';
import { PrimaryAction } from '../../ui/PrimaryAction';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { Sheet } from '../../ui/Sheet';
import { usePopupBusy } from '../../ui/popupPresence';
import { PROVIDER_NAMES } from './recoveryReturn';
import { configuredProviders, showAccountPrompt, type ProviderAnswers } from './accountPrompt';

/**
 * "Keep your link safe": the optional first sign-in with Google or GitHub.
 *
 * Offered once, the first time this phone is part of a couple, because that is
 * when there is something to keep. It is the same connection Settings →
 * "A way back in" makes — one code path, so there is one place for an auth bug
 * to live — with a plain explanation in front of it and nothing forced.
 *
 * What it promises is only what is true, which is why the wording lists things
 * rather than saying "everything". Mood, workouts, calendar, pet, gear, tasks
 * and the garden are saved on the server, so a new phone pulls them back down
 * after signing in. The journal and this phone's own look-and-feel settings are
 * not, and the fine print says so.
 *
 * It does not make the pairing code optional or replace it. And it never
 * blocks: "Maybe later" is a local write with no network in it.
 */
export function AccountPrompt({ otherGateShowing }: { otherGateShowing: boolean }) {
  // The raw row, not `loadSettings()`: that merges defaults and can trigger a
  // sync rewrite when called inside a live query. See CLAUDE.md.
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const token = settings?.workerSecret;
  const paired = isPaired(settings);

  const [providers, setProviders] = useState<ProviderAnswers>({});
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The daily award, when it is up, goes first. This offer does not register
  // itself as a popup: it is the one that waits, and counting itself would make
  // it hide the moment it appeared.
  const popupBusy = usePopupBusy();

  // Asked only while it could matter, so a phone that has already seen this, or
  // has nobody to be paired with, makes no request at all.
  const worthAsking = paired && !!token && settings?.accountPromptSeenAt === undefined;
  useEffect(() => {
    if (!worthAsking) return;
    let live = true;
    void Promise.all(
      (['google', 'github'] as const).map(
        async (provider) => [provider, await providerLink(provider, token)] as const,
      ),
    ).then((answered) => { if (live) setProviders(Object.fromEntries(answered)); });
    return () => { live = false; };
  }, [worthAsking, token]);

  const show = showAccountPrompt({
    paired,
    onboarded: settings?.onboarded === true,
    otherGateShowing: otherGateShowing || popupBusy,
    seen: settings?.accountPromptSeenAt !== undefined,
    providers,
  });
  if (!show) return null;

  const offered = configuredProviders(providers);

  const later = () => { void saveSettings({ accountPromptSeenAt: Date.now() }); };

  const connect = async (provider: AuthProvider) => {
    setBusy(provider);
    setNote(null);
    try {
      // Marked first, so coming back from the provider's page does not open this
      // again on top of the result Settings is about to show.
      await saveSettings({ accountPromptSeenAt: Date.now() });
      // A full navigation, not a popup: iOS standalone has no window to open.
      window.location.assign(await providerStart(provider, 'link', token));
    } catch (error) {
      setBusy(null);
      setNote(error instanceof Error ? error.message : 'That did not start. Try again, or do it later in Settings.');
    }
  };

  return (
    <Sheet
      open
      onClose={later}
      label="Keep your link safe"
      scrimClassName="popup-scrim"
      panelClassName="account-panel"
    >
      <h2 className="account-title">Keep your link safe</h2>
      <p className="account-body">
        Sign in with {offered.map((p) => PROVIDER_NAMES[p]).join(' or ')} and we
        will remember it is you. Your partner link, your moods, workouts,
        calendar, pet, gear and garden are saved to your account. If you lose or
        change your phone, sign in again and they all come back.
      </p>
      <div className="account-actions">
        {offered.map((provider, index) => {
          const Action = index === 0 ? PrimaryAction : SecondaryAction;
          return (
            <Action key={provider} onClick={() => connect(provider)} disabled={busy !== null}>
              {busy === provider ? 'Opening…' : `Continue with ${PROVIDER_NAMES[provider]}`}
            </Action>
          );
        })}
        <SecondaryAction onClick={later} disabled={busy !== null}>Maybe later</SecondaryAction>
      </div>
      {note ? <p className="account-note" role="status">{note}</p> : null}
      <p className="account-fine">
        It is your choice. Your pairing code still works without it. We never ask
        for your password, and we do not read your email. Private notes like your
        journal, and how this phone looks, stay on this phone.
      </p>
    </Sheet>
  );
}
