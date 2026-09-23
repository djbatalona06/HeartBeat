using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>
/// The raid sheet, as TypeScript adds it up: the seven totals from
/// <c>domain/rpg/loadout.ts</c>. Gear, the room, the dye, the companion, the
/// garden and the pet's own level all land here, and nowhere else in C# needs
/// to know any of them exist.
/// </summary>
public sealed record RaidStats(
    int Energy = 0,
    int Resilience = 0,
    int Resonance = 0,
    int Burden = 0,
    int Fortify = 0,
    int Reveal = 0,
    int Recovery = 0)
{
    public static readonly RaidStats None = new();
}

/// <summary>
/// Everything a couple carries into a fight that is not the fight itself:
/// today's charges and the raid sheet.
/// </summary>
public sealed record Boosts(IReadOnlyList<Charge> Charges, RaidStats Stats)
{
    public static readonly Boosts None = new([], RaidStats.None);
}

/// <summary>
/// What the raid sheet is worth in a fight.
///
/// Every stat goes through the same curve, <c>cap * t / (t + K)</c>: the first
/// points matter most, and no amount of owning things takes a stat past its cap.
/// That is what keeps gear a reason to want the nicer boots rather than a way
/// to skip an island - <c>IslandTests</c> holds a maxed sheet short of beating a
/// boss at the level its island starts.
/// </summary>
public static class Loadout
{
    /// <summary>The points at which a stat is worth half its cap.</summary>
    public const double HalfAt = 60;

    public const double PhysicalCap = 0.25;  // Burden
    public const double MagicCap = 0.25;     // Reveal
    public const double WardCap = 0.3;      // Fortify
    public const double MendCap = 0.3;      // Recovery
    public const double HpCap = 0.15;        // Resilience
    public const double SpeedCap = 3;       // Energy, in points
    public const double TogetherCap = 0.3;  // Resonance

    public static double Curve(int points, double cap) =>
        points <= 0 ? 0 : cap * points / (points + HalfAt);

    /// <summary>The lift a move style gets from the sheet, as a multiplier.</summary>
    public static double StyleMultiplier(RaidStats stats, Style style) => 1 + style switch
    {
        Style.Physical => Curve(stats.Burden, PhysicalCap),
        Style.Magic => Curve(stats.Reveal, MagicCap),
        Style.Defensive => Curve(stats.Fortify, WardCap),
        Style.Mend => Curve(stats.Recovery, MendCap),
        Style.Together => Curve(stats.Resonance, TogetherCap),
        _ => 0,
    };

    public static int BonusHp(RaidStats stats, int maxHp) =>
        (int)Math.Round(maxHp * Curve(stats.Resilience, HpCap), MidpointRounding.AwayFromZero);

    public static int BonusSpeed(RaidStats stats) =>
        (int)Math.Round(Curve(stats.Energy, SpeedCap), MidpointRounding.AwayFromZero);
}
