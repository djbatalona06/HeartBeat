import { describe, expect, it } from 'vitest';
import { openPopupCount, registerPopup } from './popupPresence';

describe('popupPresence', () => {
  it('counts popups that are open and forgets them when they close', () => {
    const before = openPopupCount();
    const closeA = registerPopup();
    const closeB = registerPopup();
    expect(openPopupCount()).toBe(before + 2);
    closeA();
    expect(openPopupCount()).toBe(before + 1);
    closeB();
    expect(openPopupCount()).toBe(before);
  });

  /** A double close (strict-mode effects run twice) must not go negative. */
  it('ignores a second close of the same popup', () => {
    const before = openPopupCount();
    const close = registerPopup();
    close();
    close();
    expect(openPopupCount()).toBe(before);
  });
});
