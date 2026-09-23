namespace HeartBeat.Game.Core.Models;

/// <summary>
/// One move the player can make on their turn.
///
/// A move is a move, not a log. Logging a workout, a study session or a good
/// night's sleep happens on its own page (or on the garden's charge strip), and
/// what it buys in a fight is a <see cref="Charge"/> that changes how these land
/// - see <see cref="Charges"/>. Keeping the two apart is what lets a button be
/// pressed as often as a fight needs without writing a row every time.
///
/// <paramref name="Name"/> is the plain name. The companion's own name for the
/// move ("Wishfire", "Ink Claw") comes across from TypeScript on the battle and
/// is only ever used for the log line.
/// </summary>
public sealed record PlayerAction(
    string Id,
    string Name,
    int Power,
    Style Style,
    ActionType Type,
    int UnlockLevel,
    StatusEffect? Status = null);

/// <summary>
/// The three kinds of move a companion has, plus the heal and the couple's move.
///
/// Physical and Magic both hit; the difference is that Magic ignores defense and
/// hits for less, so it is the answer to the armoured elites and Physical is the
/// answer to everything else. Defensive raises a ward.
/// </summary>
public enum Style
{
    Physical,
    Defensive,
    Magic,
    Mend,
    Together,
}

/// <summary>
/// The wellness activities that pay XP.
///
/// The names match what <c>repository/entries</c> and <c>repository/vitals</c>
/// already store on the TypeScript side. <see cref="Nourish"/>, like
/// <see cref="Rest"/> and <see cref="Gratitude"/>, has no table - its XP award
/// is the record.
/// </summary>
public enum Activity
{
    Mood,
    Exercise,
    Work,
    Rest,
    Gratitude,
    Nourish,
}
