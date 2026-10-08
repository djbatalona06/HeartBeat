import { describe, expect, it } from 'vitest';
import { keyboardInset } from './keyboard';

describe('keyboardInset', () => {
  it('reads the keyboard as what the visual viewport lost', () => {
    expect(keyboardInset(844, 508, 0)).toBe(336);
  });

  it('accounts for the page having scrolled under the keyboard', () => {
    expect(keyboardInset(844, 508, 100)).toBe(236);
  });

  it('ignores a toolbar collapsing, which is not a keyboard', () => {
    expect(keyboardInset(844, 790, 0)).toBe(0);
  });

  it('does not mistake a pinch-zoom for a keyboard', () => {
    expect(keyboardInset(844, 400, 0, 2)).toBe(0);
  });

  it('is zero when nothing is covered', () => {
    expect(keyboardInset(844, 844, 0)).toBe(0);
  });
});
