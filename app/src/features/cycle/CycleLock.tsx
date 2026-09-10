import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/icons';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH, hasPin, isValidPin, verifyPin } from './lock';

/**
 * The gate in front of the cycle log.
 *
 * It used to gate a whole page at `/cycle`. The log now lives as the last
 * section of Mood, because two screens that both asked how the day felt — one
 * in numbers, one in words — was the confusion, and a route that had to stay
 * off the tab bar to keep its own secret was the symptom.
 *
 * So this gates a section instead. Two things had to survive that move and
 * both are load-bearing:
 *
 *   - Nothing behind it is rendered while locked. Not hidden with CSS, not
 *     mounted and covered. There is no arrangement of the page that shows it.
 *   - It re-locks whenever the app leaves the foreground, which is the moment
 *     the phone is most likely to change hands.
 *
 * The second one is why this is scoped to the section and not to the page. The
 * mood half has to stay mounted and usable through every tab away and back; if
 * the re-lock reached the whole page, logging your own mood would blank the
 * screen every time you glanced at a notification.
 */

interface Props {
  children: React.ReactNode;
}

export function CycleLock({ children }: Props) {
  // Null while we find out. Rendering the section during that beat would flash
  // its contents at exactly the person the lock is for.
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    hasPin().then((set) => { if (live) setLocked(set); }).catch(() => { if (live) setLocked(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onHide = async () => {
      if (document.visibilityState === 'visible') return;
      if (await hasPin()) setLocked(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  if (locked === null) return null;
  if (locked) return <PinPrompt onUnlock={() => setLocked(false)} />;
  return <>{children}</>;
}

function PinPrompt({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);

  const submit = useCallback(async () => {
    if (checking || !isValidPin(pin)) return;
    setChecking(true);
    setWrong(false);
    const ok = await verifyPin(pin);
    setChecking(false);
    if (ok) { onUnlock(); return; }
    setWrong(true);
    setPin('');
  }, [checking, pin, onUnlock]);

  return (
    <section className="panel cycle-panel" aria-labelledby="cycle-locked-heading">
      <h2 className="section-title cycle-panel-title" id="cycle-locked-heading">
        <Icon name="moon" />
        <span>Cycle</span>
      </h2>

      <p className="section-sub">
        Enter your PIN to open the log. It locks again the moment you leave the app,
        even if that was only for a moment.
      </p>

      <form
        className="cycle-lock cycle-lock-inline"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <label className="cycle-lock-label" htmlFor="cycle-pin">PIN</label>
        <input
          id="cycle-pin"
          className="field cycle-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={MAX_PIN_LENGTH}
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setWrong(false); }}
          aria-describedby={wrong ? 'cycle-pin-error' : undefined}
          aria-invalid={wrong || undefined}
        />
        <button
          type="submit"
          className="chip cycle-unlock"
          disabled={checking || !isValidPin(pin)}
        >
          {checking ? 'Checking…' : 'Unlock'}
        </button>
        {wrong ? (
          <p className="cycle-lock-error" id="cycle-pin-error" role="alert">
            That is not the PIN.
          </p>
        ) : (
          <p className="cycle-lock-hint">
            {MIN_PIN_LENGTH}–{MAX_PIN_LENGTH} digits. Forgetting it means clearing the app’s
            data, so it is not one to invent on the spot.
          </p>
        )}
      </form>
    </section>
  );
}
