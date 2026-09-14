namespace HeartBeat.Game.Core.Models;

/// <summary>
/// One thing a monster can do on its turn.
///
/// <paramref name="Power"/> is read differently per <paramref name="Type"/>, and
/// the readings are listed here rather than scattered through
/// <c>Battle</c>: damage scalar for Attack, HP restored for Heal, shield points
/// for Shield, and effect magnitude for Debuff. <paramref name="Status"/> is set
/// only on Debuff actions.
/// </summary>
public sealed record MonsterAction(
    string Name,
    int Power,
    Element Element,
    ActionType Type,
    StatusEffect? Status = null);
