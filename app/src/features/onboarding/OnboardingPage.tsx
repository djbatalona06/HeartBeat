import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveSettings } from '../../db/database';
import { ensureIdentity, grantStarterItem, setThemeChoice } from '../../db/repository';
import { useTheme } from '../../themes/ThemeProvider';
import { writeStoredTheme } from '../settings/theme';
import { THEMES } from '../../themes';
import { getMascot } from '../pet/mascots';
import { gearById } from '../../domain/rpg/gear';
import { gearArt } from '../party/art/gear';

/** A small, common thing to start with — see grantStarterItem. Chosen rather
 *  than rolled, so every install's first item is one this page can describe
 *  by name instead of by chance. */
const STARTER_ITEM_ID = 'head-paper-crown';

const STEPS = ['welcome', 'pets', 'install', 'item', 'pair'] as const;
type Step = (typeof STEPS)[number];

/**
 * A new phone's first five screens, before it ever reaches the app proper.
 *
 * Gated by `Settings.onboarded` via `FirstRunGate` — a field the app carried
 * since day one, written by nothing and read by nothing, until now. Runs for
 * both a freshly installed phone and a guest who chose "look around anyway"
 * on Welcome; the two overlap in content on purpose (install steps matter to
 * both, differently), rather than assuming which path brought someone here.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const { setThemeId } = useTheme();
  const [index, setIndex] = useState(0);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const step: Step = STEPS[index];

  // The gift reveals itself the moment its screen is reached, not on a
  // second tap — a "your first item" screen that still asks you to claim it
  // would be a form, not a gift.
  useEffect(() => {
    if (step !== 'item' || granted || !identity) return;
    void grantStarterItem(identity.memberId, identity.coupleId, STARTER_ITEM_ID).then(() => {
      setGranted(true);
    });
  }, [step, granted, identity]);

  function chooseTheme(id: string) {
    setThemeId(id);
    writeStoredTheme(id);
    void setThemeChoice(id);
  }

  async function finish() {
    await saveSettings({ onboarded: true });
    navigate('/settings', { replace: true });
  }

  const next = () => setIndex((i) => Math.min(STEPS.length - 1, i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  const item = gearById(STARTER_ITEM_ID);
  const StarterArt = gearArt(STARTER_ITEM_ID);

  return (
    <div className="page onboarding">
      <div className="onboarding-dots" role="tablist" aria-label="Onboarding progress">
        {STEPS.map((s, i) => (
          <span key={s} className="onboarding-dot" data-on={i === index ? 'true' : 'false'} />
        ))}
      </div>

      {step === 'welcome' ? (
        <section className="panel onboarding-step">
          <h1 className="page-title">Welcome</h1>
          <p className="section-sub">
            HeartBeat is a shared tracker for two people — mood, exercise, a
            calendar, and a pet that grows from whatever either of you logs.
            Not a habit tracker for one person watched by another: everything
            here is meant to be seen by both of you.
          </p>
        </section>
      ) : null}

      {step === 'pets' ? (
        <section className="panel onboarding-step">
          <h2 className="section-title">Meet the pets</h2>
          <p className="section-sub">
            Five themes, five original companions. Pick the one that fits —
            you can change it any time from Settings, and your partner picks
            their own.
          </p>
          <div className="onboarding-pets">
            {THEMES.map((t) => {
              const mascot = getMascot(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="onboarding-pet-card"
                  onClick={() => chooseTheme(t.id)}
                  aria-label={`Choose ${t.name}, with ${mascot.name} the ${mascot.species}`}
                >
                  <span className="onboarding-pet-art"><mascot.Art mood="content" /></span>
                  <span className="onboarding-pet-name">{mascot.name}</span>
                  <span className="onboarding-pet-theme">{t.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 'install' ? (
        <section className="panel onboarding-step">
          <h2 className="section-title">Getting it on your phone</h2>
          <ol className="welcome-steps">
            <li><strong>Open the app link in Safari.</strong> iPhone only installs web apps from Safari.</li>
            <li><strong>Share → Add to Home Screen.</strong> Notifications need it.</li>
            <li><strong>Open it from the icon, then allow notifications.</strong> The prompt appears only from inside the installed app.</li>
            <li><strong>Pair on the next screen.</strong> A six-character code, read out and typed in.</li>
          </ol>
        </section>
      ) : null}

      {step === 'item' ? (
        <section className="panel onboarding-step">
          <h2 className="section-title">Your first item</h2>
          {item && StarterArt ? (
            <div className="onboarding-item">
              <span className="onboarding-item-art"><StarterArt /></span>
              <span className="onboarding-item-name">{item.name}</span>
              <p className="section-sub">{item.blurb}</p>
            </div>
          ) : (
            <p className="section-sub">Settling in…</p>
          )}
          <p className="section-sub">
            Already in your wardrobe on the Party page. Coins from doing your
            list buy more, and a second one refines it instead of stacking.
          </p>
        </section>
      ) : null}

      {step === 'pair' ? (
        <section className="panel onboarding-step">
          <h2 className="section-title">Last thing</h2>
          <p className="section-sub">
            Everything above works on one phone, but the point of it is two.
            The next screen holds pairing — one of you starts it, the other
            types in the code. Anything already logged on this phone comes
            along when you do.
          </p>
        </section>
      ) : null}

      <div className="onboarding-nav">
        {index > 0 ? (
          <button type="button" className="quiet" onClick={back}>Back</button>
        ) : <span />}
        {step === 'pair' ? (
          <button type="button" className="primary" onClick={finish}>Pair the two phones</button>
        ) : (
          <button type="button" className="primary" onClick={next}>Continue</button>
        )}
      </div>

      {step !== 'pair' ? (
        <button type="button" className="quiet onboarding-skip" onClick={finish}>
          Skip to pairing
        </button>
      ) : null}
    </div>
  );
}
