import { useEffect, useState, type CSSProperties } from 'react';
import { syncNow } from '../pwa/useSync';
import { useBuzz } from '../pwa/haptics';
import { PULL_ARM_PX, pullDistance, pullState, type PullState } from '../domain/touch/pull';

/**
 * Pull the top of any screen down to sync with the other phone.
 *
 * The sync already runs on launch, on every foreground and when the network
 * returns, so this adds no new occasion — it hands the one people reach for by
 * habit to the round `useSync` would have run anyway (`syncNow`).
 *
 * Only from the very top of the page, only with one finger, and never from a
 * canvas (the garden and the overworld own their own drags), a dialog, a field
 * or anything already scrolled — the same places the native gesture stays out
 * of. The `touchmove` listener is non-passive only while a pull is live, so an
 * ordinary scroll never waits on it. The numbers are `domain/touch/pull.ts`.
 */
const NOT_FROM = 'canvas, input, textarea, select, [role="dialog"], .chat, [data-no-pull]';

function scrolledAncestor(node: Element | null): boolean {
  for (let el = node; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

export function PullToRefresh() {
  const [dy, setDy] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const tap = useBuzz();

  useEffect(() => {
    if (refreshing) return undefined;
    let startY = 0;
    let last = 0;

    const onMove = (e: TouchEvent) => {
      last = e.touches[0].clientY - startY;
      if (last <= 0) return;
      e.preventDefault();
      setDy(last);
    };

    const onEnd = () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      if (pullState(last) !== 'armed') {
        setDy(0);
        return;
      }
      // Inside touchend, which still counts as the gesture the tick needs.
      tap('tap');
      setRefreshing(true);
      void syncNow().finally(() => {
        setRefreshing(false);
        setDy(0);
      });
    };

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      if (e.touches.length !== 1 || window.scrollY > 0) return;
      if (target?.closest(NOT_FROM) || scrolledAncestor(target)) return;
      startY = e.touches[0].clientY;
      last = 0;
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshing, tap]);

  const state: PullState | 'refreshing' = refreshing ? 'refreshing' : pullState(dy);
  if (state === 'idle') return null;
  return (
    <div
      className="ptr"
      data-state={state}
      style={{ '--ptr': `${refreshing ? PULL_ARM_PX : pullDistance(dy)}px` } as CSSProperties}
      aria-hidden="true"
    >
      <svg className="ptr-mark" viewBox="0 0 100 100" width="28" height="28">
        <path d="M50 88C20 62 22 36 42 34c8-1 8 8 8 14 0-6 0-15 8-14 20 2 22 28-8 54z" />
      </svg>
    </div>
  );
}
