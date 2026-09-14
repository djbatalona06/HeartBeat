using HeartBeat.Game.Core;

namespace HeartBeat.Game.Tests;

/// <summary>
/// The pin that keeps the C# port of <c>app/src/domain/hash.ts</c> honest.
///
/// Every expected value below was produced by running the TypeScript original
/// under node, not by running this code and writing down what it said. That
/// distinction is the entire value of the file: if someone edits `hash.ts`, or
/// if a C# compiler ever disagrees with JavaScript about a 32-bit multiply,
/// these fail and name the problem instead of a fight quietly desynchronising
/// between the two languages.
///
/// To regenerate, run the snippet in the repository's `game/README.md`.
/// </summary>
public class RngTests
{
    [Theory]
    [InlineData("", 2166136261u)]
    [InlineData("a", 3826002220u)]
    [InlineData("sloth-sprout", 3079488315u)]
    [InlineData("The Sedentary Sentinel", 1460594235u)]
    [InlineData("island-1/stage-7", 3250149579u)]
    [InlineData("é", 1812687940u)]
    public void HashMatchesTypeScript(string text, uint expected) =>
        Assert.Equal(expected, Rng.Hash(text));

    [Theory]
    [InlineData(0u, 0, 0.54216790921054780)]
    [InlineData(0u, 1, 0.40707016643136740)]
    [InlineData(0u, 2, 0.31260441988706589)]
    [InlineData(0u, 7, 0.29072576249018312)]
    [InlineData(0u, 100, 0.12927383859641850)]
    [InlineData(1u, 0, 0.90849896776489913)]
    [InlineData(1u, 7, 0.71078698430210352)]
    [InlineData(12345u, 0, 0.26807062048465014)]
    [InlineData(12345u, 100, 0.83655188162811100)]
    [InlineData(3079488315u, 2, 0.93829189729876816)]
    [InlineData(3079488315u, 7, 0.03683525463566184)]
    [InlineData(4294967295u, 1, 0.96348763210698962)]
    [InlineData(4294967295u, 7, 0.01138119352981448)]
    public void RollMatchesTypeScript(uint seed, int step, double expected) =>
        Assert.Equal(expected, Rng.Roll(seed, step), precision: 15);

    [Fact]
    public void RollStaysInRange()
    {
        for (int step = 0; step < 2000; step++)
        {
            double value = Rng.Roll(Rng.Hash($"seed-{step}"), step);
            Assert.InRange(value, 0.0, 0.9999999999);
        }
    }

    [Fact]
    public void ConsecutiveStepsAreNotCorrelated()
    {
        // The reason hash.ts mixes with a second imul rather than hashing the
        // step directly: consecutive steps of a bare FNV are visibly ordered,
        // and a fight where every swing lands the same is not variance. A
        // monotonic run of 20 would mean the mixing regressed.
        int run = 1, longest = 1;
        for (int step = 1; step < 5000; step++)
        {
            bool rising = Rng.Roll(99u, step) > Rng.Roll(99u, step - 1);
            run = rising ? run + 1 : 1;
            longest = Math.Max(longest, run);
        }
        Assert.True(longest < 20, $"longest rising run was {longest}");
    }

    [Fact]
    public void WobbleStaysWithinVariance()
    {
        for (int step = 0; step < 1000; step++)
        {
            Assert.InRange(Rng.Wobble(7u, step), 1 - Rng.Variance, 1 + Rng.Variance);
        }
    }
}
