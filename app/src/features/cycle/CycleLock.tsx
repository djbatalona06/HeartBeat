import { useCallback, useEffect, useState } from 'react';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH, hasPin, isValidPin, verifyPin } from './lock';

/**
 * The gate in front of the cycle page.
 *
 * It re-locks whenever the app leaves the foreground, which is the moment the
 * phone is most likely to change hands. Nothing behind it is rendered while
 * locked — not hidden with CSS, not mounted and covered — so there is no
 * arrangement of the page that shows through.
 */

interface Props {
  children: React.ReactNode;
}

export function CycleLock({ children }: Props) {
  // Null while we find out. Rendering the page during that beat would flash
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
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Locked</h1>
        <p className="page-sub">This page is yours.</p>
      </header>

      <form
        className="cycle-lock"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <label className="cycle-lock-label" htmlFor="cycle-pin">PIN</label>
        <input
          id="cycle-pin"
          className="field cycle-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
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
    </div>
  );
}
