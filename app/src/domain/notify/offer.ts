/**
 * When to offer notifications, and when to offer the Home Screen again.
 *
 * Both used to be asked once and never again: the push switch sat in Settings
 * where few people look, and the install steps were shown on the Welcome screen
 * and then gone for good after "look around anyway". Each is now offered at a
 * moment it makes sense, and backs off for a few days when declined.
 */
export const OFFER_BACKOFF_MS = 3 * 24 * 60 * 60 * 1000;

const rested = (at: number | undefined, now: number) => at === undefined || now - at >= OFFER_BACKOFF_MS;

export interface PushOfferInput {
  /** `notificationPermission()`; only `'default'` can still be asked. */
  permission: NotificationPermission | 'unsupported';
  /** iOS only shows the prompt in the installed app. Elsewhere, true. */
  canPrompt: boolean;
  /** Reminders go to a partner's phone too; there is nobody to remind solo. */
  paired: boolean;
  notifyOn: boolean;
  /** Something was just logged on this screen. The ask rides on the win. */
  justWon: boolean;
  dismissedAt?: number;
  now: number;
}

export function shouldOfferPush(at: PushOfferInput): boolean {
  return at.justWon
    && at.permission === 'default'
    && at.canPrompt
    && at.paired
    && !at.notifyOn
    && rested(at.dismissedAt, at.now);
}

export interface InstallOfferInput {
  /** `installState()`: only a phone still in the browser is asked. */
  state: 'installed' | 'needs-install' | 'unsupported-browser';
  /** The steps are Safari's; other browsers install differently. */
  ios: boolean;
  /** Last shown: the Welcome screen, or this nudge. */
  offeredAt?: number;
  now: number;
}

export function shouldReofferInstall(at: InstallOfferInput): boolean {
  return at.state === 'needs-install' && at.ios && rested(at.offeredAt, at.now);
}
