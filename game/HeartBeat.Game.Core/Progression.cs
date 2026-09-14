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
    public const int MaxLevel = 10;

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

    /// <summary>
    /// Stats at a level, from the level-up reward table.
    ///
    /// Written as a fold over the reward table rather than a switch so the
    /// table below stays the single statement of what each level gives. Odd
    /// levels from 3 up are stat bumps; even levels are unlocks
    /// (<see cref="Actions.UnlockedAt"/>), which is why this only moves on 3,
    /// 5, 7 and 9.
    ///
    /// The sizes of those bumps are not a matter of taste - they are pinned by
    /// `IslandTests`, which simulates real fights and fails if a stage becomes
    /// unwinnable at the level a player arrives with. The first draft of this
    /// table (+10 HP, +2 attack) lost to the stage-7 boss a hundred times out
    /// of a hundred, because a 200 HP boss needs the player's damage to roughly
    /// double across the island and +2 does not do that. Change a number here
    /// and the simulation will tell you what it did.
    /// </summary>
    public static PlayerStats StatsAt(int level)
    {
        var stats = new PlayerStats(MaxHp: 60, Attack: 12, Defense: 5, Speed: 5);
        for (int l = 2; l <= Math.Min(level, MaxLevel); l++)
        {
            stats = l switch
            {
                3 => stats with { MaxHp = stats.MaxHp + 20 },
                5 => stats with { Attack = stats.Attack + 6 },
                7 => stats with { Defense = stats.Defense + 5 },
                9 => stats with { MaxHp = stats.MaxHp + 40 },
                _ => stats,
            };
        }
        return stats;
    }

    /// <summary>A human-readable line for the level-up banner. Empty for levels that give nothing.</summary>
    public static string RewardTextAt(int level) => level switch
    {
        2 => "Log Mood becomes a combat action.",
        3 => "+20 max HP.",
        4 => "Log Rest becomes a heal.",
        5 => "+6 attack.",
        6 => "Log Gratitude charges resonance.",
        7 => "+5 defense.",
        8 => "Log Work joins the action bar.",
        9 => "+40 max HP.",
        10 => "Together: the couple's synergy move.",
        _ => "",
    };

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
