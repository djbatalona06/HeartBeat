using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>The four numbers a level is worth.</summary>
public readonly record struct PlayerStats(int MaxHp, int Attack, int Defense, int Speed);

/// <summary>
/// Levels, XP, and what a level unlocks.
///
/// Note what is *not* here: the pet's XP as stored in Dexie. This class
/// computes what a level is worth; <c>repository/petXp</c> still owns the
/// number and the writing of it. Two sources of truth for "how much XP does the
/// couple have" would be a sync bug, so C# is handed the total and hands back a
/// level, and never remembers anything between calls.
/// </summary>
public static class Progression
{
    /// <summary>
    /// Thirty-four ranks: four for each of the seven islands on top of the ten
    /// island 1 was built for. Island <c>k</c> is balanced to be entered at
    /// <c>1 + 4(k-1)</c> and its boss beaten at <c>8 + 4(k-1)</c>, which
    /// <c>IslandTests</c> holds.
    /// </summary>
    public const int MaxLevel = 34;

    /// <summary>
    /// Total XP needed to *reach* <paramref name="level"/> from nothing.
    ///
    /// Gentle early, steeper later: level 2 costs 283, level 10 costs 3162. The
    /// exponent is below 2 on purpose - this is a wellness tracker, and a curve
    /// that punishes a quiet fortnight by making the next level unreachable is
    /// a curve that gets the app deleted.
    /// </summary>
    public static int XpForLevel(int level)
    {
        if (level <= 1) return 0;
        return (int)(100 * Math.Pow(level, 1.5));
    }

    /// <summary>The level a total XP figure buys. Never below 1, never above <see cref="MaxLevel"/>.</summary>
    public static int LevelForXp(int xp)
    {
        int level = 1;
        while (level < MaxLevel && xp >= XpForLevel(level + 1)) level++;
        return level;
    }

    /// <summary>How far through the current level a total sits, in [0, 1].</summary>
    public static double ProgressWithinLevel(int xp)
    {
        int level = LevelForXp(xp);
        if (level >= MaxLevel) return 1;
        int floor = XpForLevel(level);
        int ceiling = XpForLevel(level + 1);
        if (ceiling <= floor) return 1;
        return Math.Clamp((xp - floor) / (double)(ceiling - floor), 0, 1);
    }

    /// <summary>Past level 10, each rank lifts HP, attack and defense by this share.</summary>
    public const double LateGrowth = 0.07;

    /// <summary>
    /// What reaching one level adds, given the stats before it. One table for
    /// both the numbers and the line that announces them, so the reward text
    /// cannot describe a stat the level did not give.
    ///
    /// Levels 2-10 are island 1's curve. From 11 on growth compounds, because
    /// every island after the first spans the same seven ranks and has to feel
    /// like the same climb: a flat +4 attack is a lot at level 11 and nothing at
    /// level 30. Speed ticks up every fourth rank so turn order keeps pace with
    /// the islands' faster monsters.
    /// </summary>
    private static PlayerStats GainAt(int level, PlayerStats before) => level switch
    {
        <= 1 => default,
        2 => new(10, 0, 0, 0),
        3 => new(20, 0, 0, 0),
        4 => default,
        5 => new(0, 6, 0, 0),
        6 => new(0, 0, 0, 1),
        7 => new(0, 0, 5, 0),
        8 => new(0, 3, 0, 0),
        9 => new(40, 0, 0, 0),
        10 => default,
        _ => new(
            Grow(before.MaxHp),
            Grow(before.Attack),
            Grow(before.Defense),
            level % 4 == 0 ? 1 : 0),
    };

    private static int Grow(int value) => Math.Max(1, (int)Math.Round(value * LateGrowth, MidpointRounding.AwayFromZero));

    /// <summary>The player's stats at a level, built up from level 1 one rank at a time.</summary>
    public static PlayerStats StatsAt(int level)
    {
        var stats = new PlayerStats(MaxHp: 60, Attack: 12, Defense: 5, Speed: 5);
        for (int l = 2; l <= Math.Min(level, MaxLevel); l++)
        {
            PlayerStats gain = GainAt(l, stats);
            stats = new PlayerStats(
                stats.MaxHp + gain.MaxHp,
                stats.Attack + gain.Attack,
                stats.Defense + gain.Defense,
                stats.Speed + gain.Speed);
        }
        return stats;
    }

    /// <summary>What reaching a level gave, for the level-up line.</summary>
    public static string RewardTextAt(int level)
    {
        if (level < 2 || level > MaxLevel) return "";
        if (level == 4) return "Mend: your companion can heal.";
        if (level == 10) return "Together: the couple's move.";

        PlayerStats gain = GainAt(level, StatsAt(level - 1));
        var parts = new List<string>();
        if (gain.MaxHp > 0) parts.Add($"+{gain.MaxHp} max HP");
        if (gain.Attack > 0) parts.Add($"+{gain.Attack} attack");
        if (gain.Defense > 0) parts.Add($"+{gain.Defense} defense");
        if (gain.Speed > 0) parts.Add($"+{gain.Speed} speed");
        return string.Join(", ", parts) + ".";
    }

    /// <summary>
    /// XP for logging a wellness activity.
    ///
    /// Exercise pays most because it is the most expensive to actually do, not
    /// because it matters most.
    /// </summary>
    public static int XpFor(Activity activity) => activity switch
    {
        Activity.Mood => 10,
        Activity.Exercise => 25,
        Activity.Work => 15,
        Activity.Rest => 10,
        Activity.Gratitude => 20,
        Activity.Nourish => 10,
        _ => 0,
    };

    /// <summary>XP for winning a fight, by what was beaten.</summary>
    public static int XpForDefeating(MonsterType type) => type switch
    {
        MonsterType.Common => 30,
        MonsterType.SemiBoss => 75,
        MonsterType.Elite => 90,
        MonsterType.Boss => 200,
        _ => 0,
    };
}
