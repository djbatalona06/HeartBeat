import { describe, expect, it } from 'vitest';
import { SHEET_FLICK_SPEED, sheetOffset, shouldDismissSheet } from './sheet';

describe('shouldDismissSheet', () => {
  it('closes past a third of the sheet', () => {
    expect(shouldDismissSheet(150, 0, 400)).toBe(true);
    expect(shouldDismissSheet(100, 0, 400)).toBe(false);
  });

  it('closes on a flick however short', () => {
    expect(shouldDismissSheet(20, SHEET_FLICK_SPEED, 400)).toBe(true);
  });

  it('never closes on an upward drag, however fast', () => {
    expect(shouldDismissSheet(-200, 5, 400)).toBe(false);
  });
});

describe('sheetOffset', () => {
  it('follows the finger down and resists it up', () => {
    expect(sheetOffset(120)).toBe(120);
    expect(sheetOffset(-100)).toBe(-10);
  });
});
