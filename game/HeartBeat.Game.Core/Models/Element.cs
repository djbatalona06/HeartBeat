namespace HeartBeat.Game.Core.Models;

/// <summary>
/// The five wellness axes, doubling as the combat type chart.
///
/// There are exactly five because there are five islands, and each island's
/// element is the one its monsters are weak to. That is the whole design: the
/// way to beat Morning Meadow is to log movement, because Morning Meadow's
/// monsters are weak to <see cref="Movement"/>. The type chart is not
/// decoration on top of the wellness tracking - it is the wellness tracking.
/// </summary>
public enum Element
{
    Mood,
    Movement,
    Nourishment,
    Focus,
    Rest,
}
