namespace HeartBeat.Game.Core.Models;

/// <summary>
/// The seven wellness axes, doubling as the combat type chart.
///
/// There are exactly seven because there are seven islands, and each island's
/// element is the one its monsters are weak to. A move carries no element of its
/// own: the element arrives with a <see cref="Charge"/>, which is what logging
/// the matching thing today buys. So the way to beat Morning Meadow is still to
/// move - really move, on the exercise page - and the button you press in the
/// fight is whichever of your companion's moves suits it.
///
/// <see cref="Bond"/> and <see cref="Balance"/> are the two that no single log
/// provides: Bond is both of you logging on the same day, Balance is three
/// different kinds of log in one day.
/// </summary>
public enum Element
{
    Mood,
    Movement,
    Nourishment,
    Focus,
    Rest,
    Bond,
    Balance,
}
