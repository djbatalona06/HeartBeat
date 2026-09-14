using System.Text.Json;
using HeartBeat.Game.Core;

namespace HeartBeat.Game.Tests;

/// <summary>
/// The JS boundary, exercised without a browser.
///
/// Because <c>Bridge</c> in the wasm project is nothing but one-line delegates
/// to <see cref="Api"/>, these tests cover the whole surface the worker can
/// reach. They deliberately assert on raw JSON in places: the field names are
/// the contract with
/// <c>app/src/features/eve-garden/engine/types.ts</c>, and renaming a C#
/// property is exactly the kind of change that compiles cleanly and breaks the
/// app.
/// </summary>
public class ApiTests
{
    private static JsonElement Parse(string? json)
    {
        Assert.NotNull(json);
        return JsonDocument.Parse(json!).RootElement;
    }

    [Fact]
    public void WorldListsFiveIslandsWithCamelCaseFields()
    {
        JsonElement world = Parse(Api.World());
        Assert.Equal(7, world.GetProperty("stagesPerIsland").GetInt32());

        JsonElement islands = world.GetProperty("islands");
        Assert.Equal(5, islands.GetArrayLength());

        JsonElement first = islands[0];
        Assert.Equal(1, first.GetProperty("number").GetInt32());
        Assert.Equal("Morning Meadow", first.GetProperty("lightName").GetString());
        Assert.Equal("Sloth Bog", first.GetProperty("darkName").GetString());
        Assert.True(first.GetProperty("built").GetBoolean());
        Assert.Equal(7, first.GetProperty("stageCount").GetInt32());
    }

    [Fact]
    public void EnumsCrossTheBoundaryAsStringsNotNumbers()
    {
        // PascalCase, matching the C# spelling - see the note on GameJson. The
        // exact strings are the contract with types.ts, so they are asserted
        // literally rather than round-tripped.
        // If these ever serialise as integers, renaming an enum member would
        // silently shift every value after it and the app would read the wrong
        // element off every monster.
        JsonElement island = Parse(Api.World()).GetProperty("islands")[0];
        Assert.Equal(JsonValueKind.String, island.GetProperty("element").ValueKind);
        Assert.Equal("Movement", island.GetProperty("element").GetString());

        JsonElement monster = Parse(Api.Stage(1, 1, "light")).GetProperty("monster");
        Assert.Equal("Common", monster.GetProperty("type").GetString());
        Assert.Equal("Light", monster.GetProperty("theme").GetString());
        Assert.Equal("Movement", monster.GetProperty("weakness").GetString());
    }

    [Fact]
    public void StageCarriesEverythingTheOverlayDraws()
    {
        JsonElement stage = Parse(Api.Stage(1, 1, "light"));
        Assert.Equal(1, stage.GetProperty("number").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(stage.GetProperty("name").GetString()));

        JsonElement monster = stage.GetProperty("monster");
        Assert.Equal("Sloth Sprout", monster.GetProperty("name").GetString());
        Assert.Equal("sloth-sprout", monster.GetProperty("spriteKey").GetString());
        Assert.Equal(30, monster.GetProperty("hp").GetInt32());
        Assert.Equal(30, monster.GetProperty("xp").GetInt32());
        Assert.Equal(2, monster.GetProperty("actionNames").GetArrayLength());
    }

    [Fact]
    public void TheDarkFaceComesBackRenamedAndTougher()
    {
        JsonElement light = Parse(Api.Stage(1, 7, "light")).GetProperty("monster");
        JsonElement dark = Parse(Api.Stage(1, 7, "dark")).GetProperty("monster");
        Assert.Equal("The Sedentary Sentinel", light.GetProperty("name").GetString());
        Assert.Equal("The Sunken Sentinel", dark.GetProperty("name").GetString());
        Assert.True(dark.GetProperty("hp").GetInt32() > light.GetProperty("hp").GetInt32());
    }

    [Fact]
    public void AnUnknownThemeFallsBackToLightRatherThanFailing() =>
        Assert.Equal(
            Parse(Api.Stage(1, 1, "light")).GetProperty("monster").GetProperty("hp").GetInt32(),
            Parse(Api.Stage(1, 1, "nonsense")).GetProperty("monster").GetProperty("hp").GetInt32());

    [Fact]
    public void StagesThatDoNotExistComeBackNullRatherThanThrowing()
    {
        Assert.Null(Api.Stage(1, 99, "light"));
        Assert.Null(Api.Stage(2, 1, "light"));   // island 2 is named but unbuilt
        Assert.Null(Api.Stage(99, 1, "light"));
        Assert.Null(Api.BeginBattle(2, 1, "light", 5, 1));
        Assert.Equal(0, Api.DefeatXp(2, 1));
    }

    [Fact]
    public void AFullFightCanBePlayedThroughTheBoundary()
    {
        string? state = Api.BeginBattle(1, 1, "light", 5, 12345);
        Assert.NotNull(state);

        for (int turn = 0; turn < 200; turn++)
        {
            JsonElement now = Parse(state);
            if (now.GetProperty("outcome").GetString() != "Fighting") break;

            state = now.GetProperty("turn").GetString() == "Player"
                ? Api.Act(state!, "strike")
                : Api.MonsterMove(state!);
            Assert.NotNull(state);
        }

        JsonElement end = Parse(state);
        Assert.Equal("Won", end.GetProperty("outcome").GetString());
        Assert.Equal(30, end.GetProperty("xpOwed").GetInt32());
        Assert.Equal(0, end.GetProperty("monster").GetProperty("hp").GetInt32());
        Assert.True(end.GetProperty("log").GetArrayLength() > 2);
    }

    [Fact]
    public void RoundTrippingAStateDoesNotChangeIt()
    {
        // The worker hands the same JSON back on the next call, so a state that
        // drifts through serialisation would desynchronise a fight in progress.
        string state = Api.BeginBattle(1, 4, "dark", 6, 777)!;
        string once = Api.Act(state, "not-a-real-action")!;
        string twice = Api.Act(once, "not-a-real-action")!;

        JsonElement a = Parse(once);
        JsonElement b = Parse(twice);
        Assert.Equal(a.GetProperty("player").GetProperty("hp").GetInt32(), b.GetProperty("player").GetProperty("hp").GetInt32());
        Assert.Equal(a.GetProperty("round").GetInt32(), b.GetProperty("round").GetInt32());
        Assert.Equal(a.GetProperty("turn").GetString(), b.GetProperty("turn").GetString());
    }

    [Fact]
    public void MalformedStateComesBackNullRatherThanThrowing()
    {
        Assert.Null(Api.Act("{", "strike"));
        Assert.Null(Api.Act("null", "strike"));
        Assert.Null(Api.MonsterMove("not json at all"));
        Assert.Null(Api.Act("""{"island":99,"stage":1,"theme":"light"}""", "strike"));
    }

    [Fact]
    public void MonsterStatsAreLookedUpNotTrustedFromTheState()
    {
        // The state crosses an untrusted boundary. Editing the monster's HP in
        // the JSON must not make the monster weaker - the stats come from
        // Data/, keyed by island and stage.
        string state = Api.BeginBattle(1, 7, "light", 8, 5)!;
        string tampered = state.Replace("\"monsterId\":\"i1s7-sedentary-sentinel\"", "\"monsterId\":\"anything\"", StringComparison.Ordinal);

        string? after = Api.Act(tampered, "strike");
        Assert.NotNull(after);
        // Still the real boss: a single strike cannot have finished it.
        Assert.Equal("Fighting", Parse(after).GetProperty("outcome").GetString());
    }

    [Fact]
    public void ProgressReportsLevelStatsAndUnlocks()
    {
        JsonElement start = Parse(Api.Progress(0));
        Assert.Equal(1, start.GetProperty("level").GetInt32());
        Assert.Equal(60, start.GetProperty("maxHp").GetInt32());
        Assert.False(start.GetProperty("atMaxLevel").GetBoolean());
        Assert.Equal(1, start.GetProperty("actions").GetArrayLength());
        Assert.Equal("strike", start.GetProperty("actions")[0].GetProperty("id").GetString());
        Assert.Equal(25, start.GetProperty("actions")[0].GetProperty("xp").GetInt32());

        JsonElement capped = Parse(Api.Progress(int.MaxValue));
        Assert.Equal(10, capped.GetProperty("level").GetInt32());
        Assert.True(capped.GetProperty("atMaxLevel").GetBoolean());
        Assert.Equal(0, capped.GetProperty("xpForNextLevel").GetInt32());
        Assert.Equal(6, capped.GetProperty("actions").GetArrayLength());
    }

    [Fact]
    public void AwardPaysTheActivityAndReportsALevelUp()
    {
        JsonElement quiet = Parse(Api.Award("mood", 0));
        Assert.Equal(10, quiet.GetProperty("xp").GetInt32());
        Assert.Equal(10, quiet.GetProperty("totalXp").GetInt32());
        Assert.False(quiet.GetProperty("leveledUp").GetBoolean());
        Assert.Equal("", quiet.GetProperty("rewardText").GetString());

        // One XP short of level 2, then a workout tips it over.
        JsonElement crossed = Parse(Api.Award("exercise", 281));
        Assert.Equal(25, crossed.GetProperty("xp").GetInt32());
        Assert.Equal(2, crossed.GetProperty("level").GetInt32());
        Assert.True(crossed.GetProperty("leveledUp").GetBoolean());
        Assert.False(string.IsNullOrWhiteSpace(crossed.GetProperty("rewardText").GetString()));
    }

    [Fact]
    public void AnUnknownActivityPaysNothingAndDoesNotThrow()
    {
        JsonElement none = Parse(Api.Award("brushed-the-cat", 500));
        Assert.Equal(0, none.GetProperty("xp").GetInt32());
        Assert.Equal(500, none.GetProperty("totalXp").GetInt32());
        Assert.False(none.GetProperty("leveledUp").GetBoolean());
    }

    [Fact]
    public void ActivityNamesAreCaseInsensitive() =>
        Assert.Equal(
            Parse(Api.Award("exercise", 0)).GetProperty("xp").GetInt32(),
            Parse(Api.Award("Exercise", 0)).GetProperty("xp").GetInt32());

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(-1)]
    [InlineData(9e18)]
    public void SillySeedsStillProduceAFight(double seed) =>
        Assert.NotNull(Api.BeginBattle(1, 1, "light", 3, seed));

    [Fact]
    public void DefeatXpMatchesTheStageTier()
    {
        Assert.Equal(30, Api.DefeatXp(1, 1));
        Assert.Equal(75, Api.DefeatXp(1, 4));
        Assert.Equal(200, Api.DefeatXp(1, 7));
    }
}
