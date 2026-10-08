import { useEffect } from 'react';
import { keyboardInset } from '../domain/touch/keyboard';

/**
 * Tells the CSS where the on-screen keyboard is.
 *
 * Writes `--kb-inset` (px the keyboard covers) and `<html data-keyboard="open">`
 * from the visual viewport, which is the only thing on iOS that knows. The tab
 * bar hides under it and the chat sheet rides on top of it; see
 * `05-chrome.css` and `09-messages.css`. Chromium on Android is told to resize
 * the page itself (`interactive-widget` in index.html), so there the inset
 * simply reads zero and nothing needs moving.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const root = document.documentElement;
    const update = () => {
      const inset = keyboardInset(window.innerHeight, vv.height, vv.offsetTop, vv.scale);
      root.style.setProperty('--kb-inset', `${inset}px`);
      if (inset > 0) root.dataset.keyboard = 'open';
      else delete root.dataset.keyboard;
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--kb-inset');
      delete root.dataset.keyboard;
    };
  }, []);
}
