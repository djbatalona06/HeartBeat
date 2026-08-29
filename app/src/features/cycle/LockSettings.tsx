import { useEffect, useState } from 'react';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH, clearPin, hasPin, isValidPin, setPin } from './lock';

/** Turning the lock on and off, from the bottom of the page it locks. */
export function LockSettings() {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [pin, setPinValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    hasPin().then((set) => { if (live) setLocked(set); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (locked === null) return null;

  const submit = async () => {
    if (busy || !isValidPin(pin)) return;
    setBusy(true);
    setError('');
    try {
      if (locked) {
        // Removing the lock needs the PIN, or the person it exists for can
        // take it off in two taps.
        if (!(await clearPin(pin))) { setError('That is not the PIN.'); return; }
        setLocked(false);
      } else {
        await setPin(pin);
        setLocked(true);
      }
      setPinValue('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cycle-lock-settings">
      <div className="spread">
        <span>{locked ? 'This page is locked with a PIN.' : 'This page is not locked.'}</span>
        <button type="button" className="chip" onClick={() => { setOpen((o) => !o); setError(''); }}>
          {locked ? 'Remove PIN' : 'Lock page'}
        </button>
      </div>

      {open ? (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="cycle-lock-form">
          <label className="cycle-lock-label" htmlFor="cycle-set-pin">
            {locked ? 'Current PIN' : `New PIN (${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digits)`}
          </label>
          <input
            id="cycle-set-pin"
            className="field cycle-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={MAX_PIN_LENGTH}
            value={pin}
            onChange={(e) => { setPinValue(e.target.value.replace(/\D/g, '')); setError(''); }}
          />
          <button type="submit" className="chip chip-on" disabled={busy || !isValidPin(pin)}>
            {busy ? 'Working…' : locked ? 'Remove' : 'Lock'}
          </button>
          {error ? <p className="cycle-lock-error" role="alert">{error}</p> : null}
          {!locked ? (
            <p className="cycle-lock-hint">
              Kept on this phone only — it is never synced, so the other phone keeps its own.
              There is no way to recover it.
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
