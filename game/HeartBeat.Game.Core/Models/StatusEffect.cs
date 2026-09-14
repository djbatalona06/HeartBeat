namespace HeartBeat.Game.Core.Models;

/// <summary>The kinds of lingering effect a combatant can be under.</summary>
public enum StatusKind
{
    /// <summary>Halves the victim's effective speed while it lasts.</summary>
    SpeedDown,

    /// <summary>Reduces the victim's outgoing damage by <c>Magnitude</c> percent.</summary>
    AttackDown,

    /// <summary>Costs the victim <c>Magnitude</c> HP at the end of each of its turns.</summary>
    Drain,

    /// <summary>Reduces incoming damage by <c>Magnitude</c> percent.</summary>
    Guard,
}

/// <summary>
/// One lingering effect, counted down in whole turns.
///
/// A record struct because these are copied constantly and compared by value in
/// tests. <c>TurnsLeft</c> is decremented at the end of the bearer's turn, so an
/// effect applied with 1 turn left lasts exactly one of the victim's actions -
/// which is what "reduces player Speed for 1 turn" has to mean for it to be
/// worth a monster's whole turn.
/// </summary>
public readonly record struct StatusEffect(StatusKind Kind, int Magnitude, int TurnsLeft)
{
    public StatusEffect Tick() => this with { TurnsLeft = TurnsLeft - 1 };

    public bool Expired => TurnsLeft <= 0;
}
