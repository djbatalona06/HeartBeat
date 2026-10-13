import { saveSettings } from '../database';
import { normalizeBoardKit, type BoardKitId } from '../../domain/rpg/boards';

/**
 * Pick the battle board's look. Stored on this phone's settings; the board is
 * dressed this way the next time the garden is entered. Anything this build
 * does not know is stored as the classic board, so a stale caller cannot leave
 * a value nothing can read.
 */
export async function setBoardKit(kit: BoardKitId | string): Promise<void> {
  await saveSettings({ boardKit: normalizeBoardKit(kit) });
}
