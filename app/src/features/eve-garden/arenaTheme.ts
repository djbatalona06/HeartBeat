import { getTheme } from '../../themes';
import { variantOf } from '../../themes/tokens';
import type { ThemeMode } from '../../themes/types';
import type { ArenaCssTokens } from '../pet/mascots/3d/arenaPalette';

/** The five theme tokens the board painter consumes; all stay pack-owned. */
export function arenaTokensForPet(petThemeId: string, mode: ThemeMode): ArenaCssTokens {
  const { colors } = variantOf(getTheme(petThemeId), mode);
  return {
    base: colors.base,
    text: colors.text,
    accent: colors.accent,
    success: colors.success,
    danger: colors.danger,
  };
}
