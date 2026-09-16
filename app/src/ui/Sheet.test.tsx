/**
 * @vitest-environment jsdom
 *
 * Declared per file rather than by a glob in vitest.config.ts. Both work, but
 * `environmentMatchGlobs` is deprecated in Vitest 3 and gone in 4, and the
 * docblock has meant the same thing in every version — which matters for a
 * config that exists to keep 2164 node tests out of a DOM they never touch.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { Sheet } from './Sheet';

/**
 * The first `.test.tsx` in the repo, and the reason the runner was widened.
 *
 * Every rule asserted here is invisible to the two guards that already exist.
 * A screenshot of an open sheet looks identical whether Tab escapes the panel
 * or not, and `veil.test.ts` is arithmetic over colours and has no opinion
 * about focus. The bug this component was written to fix — Tab walking out of
 * a dialog into a page nobody can see, still clickable by keyboard — is
 * precisely the class of defect that only a rendered DOM can catch.
 *
 * That is the bar for adding another one of these: **it has to assert
 * behaviour a screenshot cannot.** "It renders" is not that.
 */

function open(onClose = () => {}) {
  return render(
    <Sheet
      open
      onClose={onClose}
      label="Menu"
      scrimClassName="menu-scrim"
      panelClassName="menu-panel"
    >
      <button type="button">first</button>
      <button type="button">middle</button>
      <button type="button">last</button>
    </Sheet>,
  );
}

describe('Sheet', () => {
  it('renders nothing at all when closed', () => {
    render(
      <Sheet open={false} onClose={() => {}} label="Menu" scrimClassName="s" panelClassName="p">
        <button type="button">hidden</button>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    // Not merely invisible: a closed sheet whose buttons are still in the tree
    // is the same keyboard bug as a leaky trap, one level up.
    expect(screen.queryByRole('button', { name: 'hidden' })).toBeNull();
  });

  it('moves focus to the first focusable thing inside', () => {
    open();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'first' }));
  });

  it('is a modal dialog with the name it was given', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('wraps Tab from the last control back to the first', () => {
    open();
    screen.getByRole('button', { name: 'last' }).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'first' }));
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    open();
    screen.getByRole('button', { name: 'first' }).focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'last' }));
  });

  it('leaves Tab alone in the middle of the panel', () => {
    open();
    const middle = screen.getByRole('button', { name: 'middle' });
    middle.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    // The trap only intervenes at the two ends. Stealing every Tab would mean
    // reimplementing the browser's own order, badly.
    expect(document.activeElement).toBe(middle);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes when the scrim is clicked', () => {
    const onClose = vi.fn();
    const { container } = open(onClose);
    fireEvent.click(container.querySelector('.menu-scrim')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('gives focus back to whatever opened it, on both close paths', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const escape = render(
      <Sheet open onClose={() => {}} label="Menu" scrimClassName="menu-scrim" panelClassName="p">
        <button type="button">inside</button>
      </Sheet>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
    escape.unmount();

    // The scrim path is the one MenuSheet got wrong before this component
    // existed: it restored on Escape and nowhere else, so clicking out left
    // the keyboard at the top of the document.
    opener.focus();
    const { container } = render(
      <Sheet open onClose={() => {}} label="Menu" scrimClassName="menu-scrim" panelClassName="p">
        <button type="button">inside</button>
      </Sheet>,
    );
    fireEvent.click(container.querySelector('.menu-scrim')!);
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });

  it('does not trap a panel with nothing focusable in it', () => {
    render(
      <Sheet open onClose={() => {}} label="Empty" scrimClassName="s" panelClassName="p">
        <p>nothing to focus</p>
      </Sheet>,
    );
    // Guarded rather than crashing: `items.length === 0` returns early. A
    // dialog of pure text is unusual, not invalid.
    expect(() => fireEvent.keyDown(window, { key: 'Tab' })).not.toThrow();
  });
});
