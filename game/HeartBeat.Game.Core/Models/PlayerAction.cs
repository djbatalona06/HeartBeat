namespace HeartBeat.Game.Core.Models;

/// <summary>
/// One thing the player can do on their turn, and the wellness log behind it.
///
/// Every player action is a wellness activity. That is the point of Eve's
/// Garden: there is no "Attack" button that is only a button. Striking is
/// logging a workout, healing is logging rest, and the action bar and the
/// tracker are the same control.
///
/// <paramref name="Activity"/> is what the TypeScript side writes to the
/// repository when this action resolves. It is nullable only for actions that
/// spend something already logged rather than logging something new.
/// </summary>
public sealed record PlayerAction(
    string Id,
    string Name,
    int Power,
    Element Element,
    ActionType Type,
    int UnlockLevel,
    Activity? Activity,
    StatusEffect? Status = null);

/// <summary>
/// The wellness activities that pay XP.
///
/// The names match what <c>repository/entries</c> and <c>repository/vitals</c>
/// already store on the TypeScript side; the enum exists so the XP table and
/// the action table cannot disagree about what counts as a log.
/// </summary>
public enum Activity
{
    Mood,
    Exercise,
    Work,
    Rest,
    Gratitude,
}
