using System.Text.Json.Serialization;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>
/// The shapes that cross the JS boundary.
///
/// These are separate from the domain models on purpose. The models are free to
/// use C# things TypeScript has no word for - record structs, nullable value
/// types, <c>IReadOnlyList</c> - and these are flat, string-enumed and boring,
/// because the other side of the boundary is
/// <c>app/src/features/eve-garden/engine/types.ts</c> and every shape here has
/// a hand-written twin over there.
///
/// Enums serialise as strings rather than integers so that a renamed enum
/// member breaks loudly in a test instead of silently shifting every value
/// after it by one. Property names are camelCased; enum *values* keep their C#
/// PascalCase spelling, because <c>PropertyNamingPolicy</c> does not reach them
/// and eight per-enum converters would be a lot of machinery to buy a lowercase
/// letter. The TypeScript twin spells them the same way, and `ApiTests` pins
/// the exact strings.
/// </summary>
public sealed record ActionDto(
    string Id,
    string Name,
    int Power,
    Element Element,
    ActionType Type,
    int UnlockLevel,
    Activity? Activity,
    int Xp);

public sealed record MonsterDto(
    string Id,
    string Name,
    MonsterType Type,
    int Hp,
    int Attack,
    int Defense,
    int Speed,
    Element Weakness,
    Element Strength,
    string SpriteKey,
    DioramaTheme Theme,
    IReadOnlyList<string> ActionNames,
    int Xp);

public sealed record StageDto(int Number, string Name, MonsterDto Monster);

public sealed record IslandDto(
    int Number,
    string LightName,
    string DarkName,
    Element Element,
    bool Built,
    int StageCount);

public sealed record WorldDto(IReadOnlyList<IslandDto> Islands, int StagesPerIsland);

public sealed record EffectDto(StatusKind Kind, int Magnitude, int TurnsLeft);

public sealed record CombatantDto(
    int Hp,
    int MaxHp,
    int Shield,
    int Attack,
    int Defense,
    int Speed,
    double HpFraction,
    IReadOnlyList<EffectDto> Effects);

public sealed record LineDto(int Round, Side Who, string Text);

/// <summary>
/// A whole battle, flattened.
///
/// The TypeScript side treats this as opaque state it hands back on the next
/// call - C# keeps nothing between calls, so a worker that dies mid-fight
/// costs the fight and nothing else - but it also reads <c>player</c>,
/// <c>monster</c> and <c>log</c> to draw the screen. So the fields are named
/// for a reader, not for a serialiser.
/// </summary>
public sealed record BattleDto(
    string MonsterId,
    int Island,
    int Stage,
    DioramaTheme Theme,
    int Level,
    int Round,
    Side Turn,
    CombatantDto Player,
    CombatantDto Monster,
    IReadOnlyList<LineDto> Log,
    Outcome Outcome,
    uint Seed,
    int XpOwed,
    int HitsLeft);

public sealed record ProgressDto(
    int Xp,
    int Level,
    int XpIntoLevel,
    int XpForNextLevel,
    double Progress,
    bool AtMaxLevel,
    int MaxHp,
    int Attack,
    int Defense,
    int Speed,
    IReadOnlyList<ActionDto> Actions);

/// <summary>What a wellness log did: XP paid, and any level crossed.</summary>
public sealed record AwardDto(
    int Xp,
    int TotalXp,
    int Level,
    bool LeveledUp,
    string RewardText,
    ProgressDto Progress);

/// <summary>
/// Source-generated JSON, and the reason the runtime can be trimmed.
///
/// Reflection-based serialisation would root most of System.Text.Json and defeat
/// <c>TrimMode=full</c> in the wasm csproj - worth roughly a third of the
/// shipped payload. Every type that crosses the boundary has to be listed here;
/// a missing one throws at runtime rather than at build time, which is what
/// <c>ApiTests</c> is for.
/// </summary>
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    UseStringEnumConverter = true,
    DefaultIgnoreCondition = JsonIgnoreCondition.Never)]
[JsonSerializable(typeof(WorldDto))]
[JsonSerializable(typeof(IslandDto))]
[JsonSerializable(typeof(StageDto))]
[JsonSerializable(typeof(MonsterDto))]
[JsonSerializable(typeof(BattleDto))]
[JsonSerializable(typeof(ProgressDto))]
[JsonSerializable(typeof(AwardDto))]
[JsonSerializable(typeof(ActionDto))]
[JsonSerializable(typeof(IReadOnlyList<ActionDto>))]
public partial class GameJson : JsonSerializerContext;
