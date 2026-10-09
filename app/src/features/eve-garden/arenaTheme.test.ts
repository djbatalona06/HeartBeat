import { describe, expect, it } from 'vitest';
import { THEMES } from '../../themes';
import { variantOf } from '../../themes/tokens';
import type { ThemeColors, ThemeMode } from '../../themes/types';
import { arenaTokensForPet } from './arenaTheme';

const PICKED = ['base', 'text', 'accent', 'success', 'danger'] as const;
function selected(colors: ThemeColors) {
  return Object.fromEntries(PICKED.map((key) => [key, colors[key]]));
}

describe('arena pet-theme tokens', () => {
  it('follows the chosen pet pack in both light and dark mode', () => {
    const modes: ThemeMode[] = ['dark', 'light'];
    for (const theme of THEMES) {
      for (const mode of modes) {
        expect(arenaTokensForPet(theme.id, mode), `${theme.id} ${mode}`)
          .toEqual(selected(variantOf(theme, mode).colors));
      }
    }
  });

  it('does not key the arena palette from the unrelated active app theme', () => {
    const first = THEMES[0];
    const other = THEMES.find((t) => t.id !== first.id)!;
    expect(arenaTokensForPet(first.id, 'dark'))
      .toEqual(selected(variantOf(first, 'dark').colors));
    expect(arenaTokensForPet(first.id, 'dark'))
      .not.toEqual(selected(variantOf(other, 'dark').colors));
  });
});
