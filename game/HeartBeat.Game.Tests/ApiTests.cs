using System.Text.Json;
using System.Text.Json.Nodes;
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
    public void TheTogetherCooldownSurvivesTheRoundTripAsTogetherCooldown()
    {
        string state = Api.BeginBattle(1, 7, "light", 6, 31)!; // the boss: it survives a Together
        Assert.Equal(0, Parse(state).GetProperty("togetherCooldown").GetInt32());

        // The first turn may be the monster's; hand the move back to the player
        // by playing it out until it is theirs.
        while (Parse(state).GetProperty("turn").GetString() != "Player") state = Api.MonsterMove(state)!;

        string used = Api.Act(state, "together")!;
        Assert.Equal(1, Parse(used).GetProperty("togetherCooldown").GetInt32());

        // The monster moves, then the recharging move is refused and the turn is still ours.
        string theirs = Api.MonsterMove(used)!;
        string refused = Api.Act(theirs, "together")!;
        Assert.Equal("Player", Parse(refused).GetProperty("turn").GetString());
        Assert.Equal(1, Parse(refused).GetProperty("togetherCooldown").GetInt32());
    }

    [Fact]
    public void TheUltimateCooldownSurvivesTheRoundTripAsUltimateCooldown()
    {
        string state = Api.BeginBattle(1, 7, "light", 12, 31)!;
        Assert.Equal(0, Parse(state).GetProperty("ultimateCooldown").GetInt32());
        while (Parse(state).GetProperty("turn").GetString() != "Player") state = Api.MonsterMove(state)!;

        string used = Api.Act(state, "ultimate")!;
        Assert.Equal(Battle.UltimateCooldownTurns, Parse(used).GetProperty("ultimateCooldown").GetInt32());
    }

    [Fact]
    public void WorldListsTenIslandsWithCamelCaseFields()
    {
        JsonElement world = Parse(Api.World());
        Assert.Equal(7, world.GetProperty("stagesPerIsland").GetInt32());

        JsonElement islands = world.GetProperty("islands");
        Assert.Equal(10, islands.GetArrayLength());

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
        Assert.Equal("Mossling", monster.GetProperty("name").GetString());
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
        Assert.Equal("The Hearthkeeper", light.GetProperty("name").GetString());
        Assert.Equal("The Ashen Hearthkeeper", dark.GetProperty("name").GetString());
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
        Assert.Null(Api.Stage(11, 1, "light"));  // there are ten islands
        Assert.Null(Api.Stage(99, 1, "light"));
        Assert.Null(Api.BeginBattle(99, 1, "light", 5, 1));
        Assert.Equal(0, Api.DefeatXp(11, 1));
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

    /// <summary>Edits one field of a state the way someone in the dev tools would.</summary>
    private static string Edit(string state, Action<JsonNode> change)
    {
        JsonNode node = JsonNode.Parse(state)!;
        change(node);
        return node.ToJsonString();
    }

    [Fact]
    public void AnEditedStateIsRefusedNotBelieved()
    {
        // The state crosses an untrusted boundary and is sealed on the way out.
        // A one-hit boss, a level-46 player, a different monster: all refused.
        string state = Api.BeginBattle(1, 7, "light", 8, 5)!;

        Assert.NotNull(Api.Act(state, "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["monster"]!["hp"] = 1), "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["player"]!["attack"] = 9999), "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["level"] = 46), "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["xpOwed"] = 9999), "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["monsterId"] = "anything"), "strike"));
        Assert.Null(Api.MonsterMove(Edit(state, n => n["round"] = 40)));
    }

    [Fact]
    public void ARaidSheetEditedMidFightIsRefused()
    {
        string state = Api.BeginBattle(1, 7, "light", 8, 5, null, """{"energy":10}""")!;
        Assert.NotNull(Api.Act(state, "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["stats"]!["energy"] = 999), "strike"));
    }

    [Fact]
    public void AStateWithNoSealOrAForgedOneIsRefused()
    {
        string state = Api.BeginBattle(1, 7, "light", 8, 5)!;
        Assert.Null(Api.Act(Edit(state, n => n["sig"] = null), "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["sig"] = "AAAA"), "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["sig"] = "not base64 !"), "strike"));
    }

    [Fact]
    public void ChargesAndMoveNamesCanBeAddedWithoutBreakingTheSeal()
    {
        // The page adds both before each move: a workout logged mid-fight is
        // meant to count on the next swing, so they are deliberately unsealed.
        string state = Api.BeginBattle(1, 7, "light", 8, 5)!;
        string withCharges = Edit(state, n =>
        {
            n["charges"] = new JsonArray("Work");
            n["moveNames"] = new JsonObject { ["strike"] = "Pounce" };
        });
        Assert.NotNull(Api.Act(withCharges, "strike"));
    }

    [Fact]
    public void NullAndPartialStatesComeBackNullRatherThanThrowing()
    {
        Assert.Null(Api.Act(null, "strike"));
        Assert.Null(Api.Act(Api.BeginBattle(1, 1, "light", 3, 1), null));
        Assert.Null(Api.MonsterMove(null));
        Assert.Null(Api.Act("""{"island":1,"stage":1,"theme":"Light","player":null,"log":null}""", "strike"));
        string state = Api.BeginBattle(1, 1, "light", 3, 1)!;
        Assert.Null(Api.Act(Edit(state, n => n["player"] = null), "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["log"] = null), "strike"));
        Assert.Null(Api.Act(Edit(state, n => n["monster"]!["effects"] = null), "strike"));
    }

    [Fact]
    public void RefusedMovesCannotGrowTheLogWithoutEnd()
    {
        string state = Api.BeginBattle(1, 1, "light", 3, 1)!;
        for (int i = 0; i < 400; i++)
        {
            // Not a move, so no turn is spent and the same line is added every time.
            state = Api.Act(state, "not-a-real-action")!;
        }
        Assert.True(Parse(state).GetProperty("log").GetArrayLength() <= Battle.MaxLogLines);
    }

    [Fact]
    public void ANumberIsNotAnActivityOrATheme()
    {
        Assert.Equal(0, Parse(Api.Award("99", 10)).GetProperty("xp").GetInt32());
        Assert.NotNull(Api.Stage(1, 1, "99")); // an undefined theme falls back to Light
    }

    [Fact]
    public void AwardNearTheTopOfTheRangeClampsInsteadOfWrapping()
    {
        JsonElement award = Parse(Api.Award("Exercise", int.MaxValue - 1));
        Assert.True(award.GetProperty("totalXp").GetInt32() > 0);
        Assert.Equal(Progression.MaxLevel, award.GetProperty("level").GetInt32());
    }

    [Fact]
    public void ProgressReportsLevelStatsAndUnlocks()
    {
        JsonElement start = Parse(Api.Progress(0));
        Assert.Equal(1, start.GetProperty("level").GetInt32());
        Assert.Equal(60, start.GetProperty("maxHp").GetInt32());
        Assert.False(start.GetProperty("atMaxLevel").GetBoolean());
        Assert.Equal(3, start.GetProperty("actions").GetArrayLength());
        Assert.Equal("strike", start.GetProperty("actions")[0].GetProperty("id").GetString());
        Assert.Equal("Physical", start.GetProperty("actions")[0].GetProperty("style").GetString());

        JsonElement capped = Parse(Api.Progress(int.MaxValue));
        Assert.Equal(Progression.MaxLevel, capped.GetProperty("level").GetInt32());
        Assert.True(capped.GetProperty("atMaxLevel").GetBoolean());
        Assert.Equal(0, capped.GetProperty("xpForNextLevel").GetInt32());
        Assert.Equal(Actions.All.Count, capped.GetProperty("actions").GetArrayLength());
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

    [Fact]
    public void ChargesStatsAndMoveNamesSurviveTheRoundTrip()
    {
        string begun = Api.BeginBattle(
            1, 1, "light", 3, 99, "exercise,bond,nonsense", """{"burden":40,"resilience":30}""")!;
        JsonElement start = Parse(begun);
        Assert.Equal(2, start.GetProperty("charges").GetArrayLength());
        Assert.Equal("Exercise", start.GetProperty("charges")[0].GetString());
        Assert.Equal(40, start.GetProperty("stats").GetProperty("burden").GetInt32());
        Assert.True(start.GetProperty("player").GetProperty("maxHp").GetInt32() > Progression.StatsAt(3).MaxHp);

        // TypeScript names the moves for the companion by setting moveNames on
        // the battle it hands back. The log line uses the name; nothing else does.
        string named = begun.Replace("\"moveNames\":null", "\"moveNames\":{\"strike\":\"Hoofbeat\"}", StringComparison.Ordinal)
            .Replace("\"turn\":\"Monster\"", "\"turn\":\"Player\"", StringComparison.Ordinal);
        JsonElement after = Parse(Api.Act(named, "strike")!);
        JsonElement log = after.GetProperty("log");
        Assert.StartsWith("Hoofbeat hits for", log[log.GetArrayLength() - 1].GetProperty("text").GetString(), StringComparison.Ordinal);
        Assert.Equal("Hoofbeat", after.GetProperty("moveNames").GetProperty("strike").GetString());
        Assert.Equal(2, after.GetProperty("charges").GetArrayLength());
    }

    [Fact]
    public void ABadStatsArgumentIsNoStatsRatherThanAFailure() =>
        Assert.Equal(0, Parse(Api.BeginBattle(1, 1, "light", 3, 1, "", "{not json")!)
            .GetProperty("stats").GetProperty("burden").GetInt32());
}
