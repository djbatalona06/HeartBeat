using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>
/// The player's whole move list, and when each move arrives.
///
/// Three moves from day one - one of each <see cref="Style"/> a companion
/// fights with - so a brand-new couple has a real choice on their first turn.
/// The heal arrives at level 4 and the couple's move at 10. The names here are
/// the plain ones; each companion's kit renames them on the TypeScript side.
/// </summary>
public static class Actions
{
    public static readonly PlayerAction Strike = new(
        Id: "strike",
        Name: "Strike",
        Power: 15,
        Style: Style.Physical,
        Type: ActionType.Attack,
        UnlockLevel: 1);

    public static readonly PlayerAction Guard = new(
        Id: "guard",
        Name: "Guard",
        Power: 14,
        Style: Style.Defensive,
        Type: ActionType.Shield,
        UnlockLevel: 1);

    /// <summary>Hits for less and ignores defense - see <c>Battle.Act</c>.</summary>
    public static readonly PlayerAction Spell = new(
        Id: "spell",
        Name: "Spell",
        Power: 12,
        Style: Style.Magic,
        Type: ActionType.Attack,
        UnlockLevel: 1);

    /// <summary>
    /// Restores a percentage of maximum HP rather than a flat amount, so the
    /// level-4 unlock does not quietly expire as the islands get harder.
    /// </summary>
    public static readonly PlayerAction Mend = new(
        Id: "mend",
        Name: "Mend",
        Power: 30,
        Style: Style.Mend,
        Type: ActionType.Heal,
        UnlockLevel: 4);

    /// <summary>The couple's move. Hits hardest, and Resonance is what feeds it.</summary>
    public static readonly PlayerAction Together = new(
        Id: "together",
        Name: "Together",
        Power: 28,
        Style: Style.Together,
        Type: ActionType.Attack,
        UnlockLevel: 10);

    public static readonly IReadOnlyList<PlayerAction> All =
        [Strike, Guard, Spell, Mend, Together];

    /// <summary>Everything available at a level, in unlock order.</summary>
    public static IReadOnlyList<PlayerAction> UnlockedAt(int level) =>
        All.Where(a => a.UnlockLevel <= level).ToList();

    public static PlayerAction? ById(string id) =>
        All.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.Ordinal));
}
