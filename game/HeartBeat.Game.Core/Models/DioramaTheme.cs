namespace HeartBeat.Game.Core.Models;

/// <summary>
/// Which face of an island is showing.
///
/// This is not a difficulty setting the player picks. It is read off the
/// couple's recent logging (see `domain/rpg/diorama.ts` on the TypeScript
/// side) and it is deliberately not framed as a punishment: the dark variant
/// exists so that a dipped week *looks* different, and the stat bump is small
/// enough to notice and not large enough to wall anyone out.
/// </summary>
public enum DioramaTheme
{
    Light,
    Dark,
}
