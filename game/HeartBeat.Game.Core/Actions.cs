using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>
/// The player's whole move list, and when each move arrives.
///
/// Five entries, because a wellness tracker has five things worth logging and
/// this is that list with damage attached. <c>Strike</c> is unlocked at level 1
/// so a brand-new couple can fight on day one with the only activity that needs
/// no history behind it.
/// </summary>
public static class Actions
{
    public static readonly PlayerAction Strike = new(
        Id: "strike",
        Name: "Log Exercise",
        Power: 10,
        Element: Element.Movement,
        Type: ActionType.Attack,
        UnlockLevel: 1,
        Activity: Activity.Exercise);

    public static readonly PlayerAction Mood = new(
        Id: "mood",
        Name: "Log Mood",
        Power: 12,
        Element: Element.Mood,
        Type: ActionType.Attack,
        UnlockLevel: 2,
        Activity: Activity.Mood);

    /// <summary>
    /// Restores a percentage of maximum HP rather than a flat amount - see
    /// <c>Battle.Act</c>. A flat heal is worth less and less as the island gets
    /// harder, which makes the level-4 unlock feel like it expires.
    /// </summary>
    public static readonly PlayerAction Rest = new(
        Id: "rest",
        Name: "Log Rest",
        Power: 30,
        Element: Element.Rest,
        Type: ActionType.Heal,
        UnlockLevel: 4,
        Activity: Activity.Rest);

    public static readonly PlayerAction Gratitude = new(
        Id: "gratitude",
        Name: "Log Gratitude",
        Power: 10,
        Element: Element.Mood,
        Type: ActionType.Shield,
        UnlockLevel: 6,
        Activity: Activity.Gratitude);

    public static readonly PlayerAction Focus = new(
        Id: "focus",
        Name: "Log Work",
        Power: 11,
        Element: Element.Focus,
        Type: ActionType.Attack,
        UnlockLevel: 8,
        Activity: Activity.Work);

    /// <summary>
    /// The couple's synergy move, and the only action that is not one person's
    /// log. It hits for a lot and costs the whole turn; level 10 is the end of
    /// the curve, so this is what the end of the curve is for.
    /// </summary>
    public static readonly PlayerAction Together = new(
        Id: "together",
        Name: "Together",
        Power: 25,
        Element: Element.Mood,
        Type: ActionType.Attack,
        UnlockLevel: 10,
        Activity: null);

    public static readonly IReadOnlyList<PlayerAction> All =
        [Strike, Mood, Rest, Gratitude, Focus, Together];

    /// <summary>Everything available at a level, in unlock order.</summary>
    public static IReadOnlyList<PlayerAction> UnlockedAt(int level) =>
        All.Where(a => a.UnlockLevel <= level).ToList();

    public static PlayerAction? ById(string id) =>
        All.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.Ordinal));
}
