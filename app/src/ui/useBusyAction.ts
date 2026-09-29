import { useCallback, useState } from 'react';

/**
 * Holds a screen's buttons while an action runs, and says something when it
 * fails. A `finally` that clears the flag on every path, in one place, rather
 * than a try/catch/finally copied into each handler.
 */
export function useBusyAction(onFailure: (message: string) => void) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (
      task: () => Promise<void>,
      failure: string | ((error: unknown) => string),
      cleanup?: () => void,
    ) => {
      setBusy(true);
      try {
        await task();
      } catch (error) {
        cleanup?.();
        onFailure(typeof failure === 'function' ? failure(error) : failure);
      } finally {
        setBusy(false);
      }
    },
    [onFailure],
  );

  return { busy, run };
}
