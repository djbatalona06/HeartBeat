/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { InfoBubble } from './InfoBubble';

/**
 * What a screenshot cannot show: who has focus when the guide opens and
 * closes, and whether each collapsible section says it is open.
 */

const GUIDE = {
  title: 'Mood',
  steps: ['Pick how today feels.', 'Tick rest, gratitude or eating well.'],
  game: 'A mood check-in lights the Mood charge in Eve\'s Garden.',
};

afterEach(cleanup);

const bubble = () => screen.getByRole('button', { name: 'How Mood works' });

describe('InfoBubble', () => {
  it('is a closed button until tapped, and says it opens a dialog', () => {
    render(<InfoBubble guide={GUIDE} />);
    expect(bubble().getAttribute('aria-haspopup')).toBe('dialog');
    expect(bubble().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a dialog named for the page, with the steps showing', () => {
    render(<InfoBubble guide={GUIDE} />);
    fireEvent.click(bubble());
    expect(screen.getByRole('dialog', { name: 'How Mood works' })).toBeTruthy();
    expect(bubble().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Pick how today feels.')).toBeTruthy();
  });

  it('keeps "In the game" collapsed until asked, and announces each state', () => {
    render(<InfoBubble guide={GUIDE} />);
    fireEvent.click(bubble());
    const steps = screen.getByRole('button', { name: 'How it works' });
    const game = screen.getByRole('button', { name: 'In the game' });
    expect(steps.getAttribute('aria-expanded')).toBe('true');
    expect(game.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(GUIDE.game)).toBeNull();

    fireEvent.click(game);
    expect(game.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(GUIDE.game)).toBeTruthy();

    fireEvent.click(steps);
    expect(steps.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Pick how today feels.')).toBeNull();
  });

  it('closes on "Got it" and on Escape, handing focus back to the bubble', () => {
    render(<InfoBubble guide={GUIDE} />);
    bubble().focus();
    fireEvent.click(bubble());
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(bubble());

    fireEvent.click(bubble());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(bubble());
  });
});
