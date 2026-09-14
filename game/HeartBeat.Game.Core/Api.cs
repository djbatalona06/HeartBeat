using System.Text.Json;
using HeartBeat.Game.Core.Data;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>
/// Everything the browser can ask the game, as strings in and strings out.
///
/// This is the real boundary. <c>HeartBeat.Game.Wasm.Bridge</c> is a set of
/// one-line delegates to these methods and holds no logic at all, which means
/// the whole JS-facing surface is exercised by <c>dotnet test</c> rather than
/// only by loading a browser.
///
/// <b>Stateless on purpose.</b> No battle is held between calls: the caller
/// passes the state back in and gets a new one out. A worker that dies
/// mid-fight therefore costs the fight and nothing else, and two tabs cannot
/// desynchronise because there is nothing here for them to share.
///
/// <b>Total on purpose.</b> Nothing here throws for bad input. An unknown
/// island, a malformed state, a stage that does not exist - all return either
/// <c>null</c> or the state unchanged, because the alternative is an exception
/// crossing the wasm boundary, where it arrives as an unreadable string.
/// </summary>
public static class Api
{
    private static string Write<T>(T value, System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> info) =>
        JsonSerializer.Serialize(value, info);

    /// <summary>The five islands, for the compass and the world map.</summary>
    public static string World()
    {
        var islands = Data.World.Islands
            .Select(i => new IslandDto(
                i.Number, i.LightName, i.DarkName, i.Element,
                Built: i.Stages.Count > 0,
                StageCount: i.Stages.Count))
            .ToList();
        return Write(new WorldDto(islands, Island.StagesPerIsland), GameJson.Default.WorldDto);
    }

    /// <summary>
    /// One stage, with the monster standing on it. Returns <c>"null"</c> for a
    /// stage that does not exist - an unbuilt island, or a number outside 1..7.
    /// </summary>
    public static string? Stage(int island, int stage, string theme)
    {
        Stage? found = Data.World.StageFor(island, stage);
        Monster? monster = Data.World.MonsterAt(island, stage, ParseTheme(theme));
        if (found is null || monster is null) return null;
        return Write(new StageDto(found.Number, found.Name, ToDto(monster)), GameJson.Default.StageDto);
    }

    /// <summary>Opens a fight. Returns <c>null</c> if there is nothing on that stage to fight.</summary>
    public static string? BeginBattle(int island, int stage, string theme, int level, double seed)
    {
        DioramaTheme face = ParseTheme(theme);
        Monster? monster = Data.World.MonsterAt(island, stage, face);
        if (monster is null) return null;

        BattleState state = Battle.Begin(monster, level, ToSeed(seed));
        return Write(ToDto(state, island, stage, face, level, monster), GameJson.Default.BattleDto);
    }

    /// <summary>
    /// The player's turn. <paramref name="actionId"/> is an id from
    /// <see cref="Actions"/>, or <c>"flee"</c>.
    /// </summary>
    public static string? Act(string battleJson, string actionId)
    {
        if (!TryRead(battleJson, out BattleDto? dto, out Monster? monster)) return null;
        BattleState next = Battle.Act(FromDto(dto!), actionId, monster!, dto!.Level);
        return Write(ToDto(next, dto.Island, dto.Stage, dto.Theme, dto.Level, monster!), GameJson.Default.BattleDto);
    }

    /// <summary>The monster's turn. Kept separate so the overlay can animate between the two.</summary>
    public static string? MonsterMove(string battleJson)
    {
        if (!TryRead(battleJson, out BattleDto? dto, out Monster? monster)) return null;
        BattleState next = Battle.MonsterMove(FromDto(dto!), monster!);
        return Write(ToDto(next, dto!.Island, dto.Stage, dto.Theme, dto.Level, monster!), GameJson.Default.BattleDto);
    }

    /// <summary>Level, stats and unlocked actions for a total XP figure.</summary>
    public static string Progress(int xp) => Write(ProgressFor(xp), GameJson.Default.ProgressDto);

    /// <summary>
    /// What logging a wellness activity is worth, and whether it crossed a level.
    ///
    /// The caller passes the couple's XP *before* the log; C# does not remember
    /// it. <c>repository/petXp</c> remains the only thing that stores a number.
    /// </summary>
    public static string Award(string activity, int currentXp)
    {
        if (!Enum.TryParse(activity, ignoreCase: true, out Activity parsed))
        {
            return Write(
                new AwardDto(0, currentXp, Progression.LevelForXp(currentXp), false, "", ProgressFor(currentXp)),
                GameJson.Default.AwardDto);
        }

        int gained = Progression.XpFor(parsed);
        int total = currentXp + gained;
        int before = Progression.LevelForXp(currentXp);
        int after = Progression.LevelForXp(total);

        return Write(
            new AwardDto(
                Xp: gained,
                TotalXp: total,
                Level: after,
                LeveledUp: after > before,
                RewardText: after > before ? Progression.RewardTextAt(after) : "",
                Progress: ProgressFor(total)),
            GameJson.Default.AwardDto);
    }

    /// <summary>What beating the monster on a stage is worth. Zero for a stage that does not exist.</summary>
    public static int DefeatXp(int island, int stage)
    {
        Monster? monster = Data.World.MonsterAt(island, stage, DioramaTheme.Light);
        return monster is null ? 0 : Progression.XpForDefeating(monster.Type);
    }

    // ---- plumbing -------------------------------------------------------

    private static ProgressDto ProgressFor(int xp)
    {
        int level = Progression.LevelForXp(xp);
        PlayerStats stats = Progression.StatsAt(level);
        bool max = level >= Progression.MaxLevel;
        int floor = Progression.XpForLevel(level);
        int ceiling = max ? floor : Progression.XpForLevel(level + 1);

        return new ProgressDto(
            Xp: xp,
            Level: level,
            XpIntoLevel: Math.Max(0, xp - floor),
            XpForNextLevel: max ? 0 : ceiling - floor,
            Progress: Progression.ProgressWithinLevel(xp),
            AtMaxLevel: max,
            MaxHp: stats.MaxHp,
            Attack: stats.Attack,
            Defense: stats.Defense,
            Speed: stats.Speed,
            Actions: Actions.UnlockedAt(level).Select(ToDto).ToList());
    }

    private static ActionDto ToDto(PlayerAction a) => new(
        a.Id, a.Name, a.Power, a.Element, a.Type, a.UnlockLevel, a.Activity,
        Xp: a.Activity is { } act ? Progression.XpFor(act) : 0);

    private static MonsterDto ToDto(Monster m) => new(
        m.Id, m.Name, m.Type, m.Hp, m.Attack, m.Defense, m.Speed,
        m.Weakness, m.Strength, m.SpriteKey, m.Theme,
        ActionNames: m.Actions.Select(a => a.Name).ToList(),
        Xp: Progression.XpForDefeating(m.Type));

    private static CombatantDto ToDto(Combatant c) => new(
        c.Hp, c.MaxHp, c.Shield, c.Attack, c.Defense, c.Speed, c.HpFraction,
        c.Effects.Select(e => new EffectDto(e.Kind, e.Magnitude, e.TurnsLeft)).ToList());

    private static BattleDto ToDto(
        BattleState s, int island, int stage, DioramaTheme theme, int level, Monster monster) => new(
        s.MonsterId, island, stage, theme, level, s.Round, s.Turn,
        ToDto(s.Player), ToDto(s.Monster),
        s.Log.Select(l => new LineDto(l.Round, l.Who, l.Text)).ToList(),
        s.Outcome, s.Seed, s.XpOwed,
        HitsLeft: s.Outcome == Outcome.Fighting ? Battle.HitsLeft(s, monster) : 0);

    private static BattleState FromDto(BattleDto d) => new(
        d.MonsterId, d.Round, d.Turn,
        FromDto(d.Player), FromDto(d.Monster),
        d.Log.Select(l => new BattleLine(l.Round, l.Who, l.Text)).ToList(),
        d.Outcome, d.Seed, d.XpOwed);

    private static Combatant FromDto(CombatantDto c) => new(
        c.Hp, c.MaxHp, c.Shield, c.Attack, c.Defense, c.Speed,
        c.Effects.Select(e => new StatusEffect(e.Kind, e.Magnitude, e.TurnsLeft)).ToList());

    /// <summary>Parses a battle and re-resolves its monster. False for anything malformed.</summary>
    private static bool TryRead(string json, out BattleDto? dto, out Monster? monster)
    {
        dto = null;
        monster = null;
        try
        {
            dto = JsonSerializer.Deserialize(json, GameJson.Default.BattleDto);
        }
        catch (JsonException)
        {
            return false;
        }
        if (dto is null) return false;

        // The monster is looked up rather than carried in the state, so its
        // stats cannot be edited by anything that can reach the JSON.
        monster = Data.World.MonsterAt(dto.Island, dto.Stage, dto.Theme);
        return monster is not null;
    }

    private static DioramaTheme ParseTheme(string theme) =>
        Enum.TryParse(theme, ignoreCase: true, out DioramaTheme parsed) ? parsed : DioramaTheme.Light;

    /// <summary>
    /// JS numbers are doubles and every uint fits in one, but a caller that
    /// passes something silly should get a usable seed rather than an overflow.
    /// </summary>
    private static uint ToSeed(double seed)
    {
        if (double.IsNaN(seed) || double.IsInfinity(seed)) return 1u;
        return (uint)(Math.Abs(seed) % 4294967296.0);
    }
}
