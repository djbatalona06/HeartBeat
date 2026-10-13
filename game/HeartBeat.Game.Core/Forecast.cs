using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>How a simulated player chooses its moves.</summary>
public enum PlayStyle
{
    /// <summary>
    /// Heals when badly hurt, otherwise its hardest-hitting ready attack. What a
    /// person tapping the biggest button does, and the policy every island
    /// balance test has always been measured with.
    /// </summary>
    Simple,

    /// <summary>
    /// Reads the warning: wards before a heavy blow, heals a little earlier, and
    /// re-picks its best attack every turn as the monster's state changes.
    /// </summary>
    Careful,
}

/// <summary>The pre-fight read, as words rather than a percentage.</summary>
public enum Verdict
{
    /// <summary>"Good chance with this build."</summary>
    Likely,

    /// <summary>"Could go either way."</summary>
    Close,

    /// <summary>"This may be tough."</summary>
    Tough,
}

/// <summary>
/// One plain-language reason behind a forecast, for the "Why?" line.
/// <paramref name="Code"/> is stable for the TypeScript side to word or
/// translate; <paramref name="Text"/> is the default wording.
/// </summary>
public sealed record ForecastReason(string Code, string Text);

/// <summary>
/// Whether this build can beat this monster, across many seeded fights.
///
/// Every rate and share is a figure for the screen to turn into words, never
/// to print: <see cref="Verdict"/> is the label, and
/// <see cref="AssistSuggested"/> is the only switch.
/// </summary>
public sealed record ForecastResult(
    double SimpleWinRate,
    double CarefulWinRate,
    int ExpectedRounds,
    double MedianEndingHp,
    double LowerTailHp,
    Verdict Verdict,
    bool AssistSuggested,
    IReadOnlyList<ForecastReason> Why);

/// <summary>
/// <c>canBeatEncounter</c>: a forecast for one build against one monster.
///
/// ## What it reads, and what it must never read
///
/// Its inputs are the fight's own: the combat level, the moves that level has
/// unlocked, today's charges and the raid sheet (<see cref="Boosts"/>), and the
/// monster as it will stand - face, stats and <see cref="Behavior"/>. It plays
/// the real reducer, so it cannot drift from the fight it predicts.
///
/// It takes nothing else on purpose. Mood entries, a quiet week, whether a
/// partner showed up - none of those measure how well somebody plays, and a
/// forecast that read them would be a hidden penalty wearing a helpful face.
///
/// ## Two players, not one
///
/// <see cref="PlayStyle.Simple"/> and <see cref="PlayStyle.Careful"/> bracket
/// the range. The verdict is the simple player's, because the forecast is for
/// whoever is holding the phone, and a fight that only falls to careful play is
/// a fight worth warning about.
///
/// ## Advice, never a dial
///
/// Nothing here changes a fight. <see cref="ForecastResult.AssistSuggested"/>
/// is an offer for the screen to make before the fight starts, and declining it
/// must start the fight as designed.
/// </summary>
public static class Forecast
{
    /// <summary>Seeds per play style. Matches the island balance tests.</summary>
    public const int Trials = 60;

    /// <summary>A guard against a fight that will not end, which the heal fade already prevents.</summary>
    public const int RoundCap = 300;

    /// <summary>
    /// At or above this, the verdict is <see cref="Verdict.Likely"/> and no
    /// assist is offered. The same 80% every light stage is held to at arrival.
    /// </summary>
    public const double LikelyAt = 0.8;

    /// <summary>Below this the verdict is <see cref="Verdict.Tough"/>.</summary>
    public const double CloseAt = 0.5;

    /// <summary>The careful player heals a little earlier than the simple one.</summary>
    private const double SimpleHealBelow = 0.35;
    private const double CarefulHealBelow = 0.5;

    /// <summary>A single turn that takes at least this share of max HP is worth naming.</summary>
    private const double BigHitShare = 0.2;

    /// <summary>When careful play wins this much more often, saying so is the most useful tip there is.</summary>
    private const double CarefulTipGap = 0.2;

    /// <summary>The "Why?" line stays short.</summary>
    public const int MaxReasons = 3;

    /// <summary>The seed for trial <paramref name="trial"/>. Unchanged from the balance tests' own.</summary>
    public static uint SeedFor(Monster monster, int level, int trial) => Rng.Hash($"{monster.Id}/{level}/{trial}");

    /// <summary>Plays one fight to the end with the given policy.</summary>
    public static BattleState Play(Monster monster, int level, uint seed, Boosts? boosts, PlayStyle style)
    {
        BattleState state = Battle.Begin(monster, level, seed, boosts);
        var available = Actions.UnlockedAt(level);
        PlayerAction? heal = available.FirstOrDefault(a => a.Type == ActionType.Heal);
        PlayerAction? ward = available.FirstOrDefault(a => a.Type == ActionType.Shield);
        double healBelow = style == PlayStyle.Careful ? CarefulHealBelow : SimpleHealBelow;

        // Best first, ranked once at the opening. The pick takes the first one
        // that is ready, so when the couple's move is recharging it falls back to
        // its next-best attack.
        BattleState opening = state;
        List<PlayerAction> attacks = available
            // The finisher is not part of the policy every balance threshold was
            // measured with; it can only ever make a fight easier.
            .Where(a => a.Type == ActionType.Attack && a.Style != Style.Ultimate)
            .OrderByDescending(a => Battle.PreviewDamage(opening, a, monster))
            .ToList();

        int guard = 0;
        while (state.Outcome == Outcome.Fighting && guard++ < RoundCap)
        {
            if (state.Turn == Side.Player)
            {
                state = Battle.Act(state, Choose(state, monster, style, healBelow, heal, ward, attacks).Id, monster, level);
            }
            else
            {
                state = Battle.MonsterMove(state, monster);
            }
        }
        return state;
    }

    private static PlayerAction Choose(
        BattleState state, Monster monster, PlayStyle style, double healBelow,
        PlayerAction? heal, PlayerAction? ward, List<PlayerAction> attacks)
    {
        bool hurt = state.Player.HpFraction < healBelow && state.Player.Hp < state.Player.MaxHp;
        if (hurt && heal is not null) return heal;

        if (style == PlayStyle.Simple) return attacks.First(a => Battle.IsReady(state, a));

        // The warning is exact (see `Behaviours.Telegraph`), so a ward raised
        // now is spent on the blow that was announced.
        if (ward is not null && state.Player.Shield == 0 && Behaviours.Telegraph(state, monster) == "heavy") return ward;

        return attacks
            .Where(a => Battle.IsReady(state, a))
            .OrderByDescending(a => Battle.PreviewDamage(state, a, monster))
            .First();
    }

    /// <summary>The forecast for this build against this monster.</summary>
    public static ForecastResult For(Monster monster, int level, Boosts? boosts = null, int trials = Trials)
    {
        int n = Math.Max(1, trials);
        var simple = Enumerable.Range(0, n).Select(t => Play(monster, level, SeedFor(monster, level, t), boosts, PlayStyle.Simple)).ToList();
        int carefulWins = Enumerable.Range(0, n)
            .Count(t => Play(monster, level, SeedFor(monster, level, t), boosts, PlayStyle.Careful).Outcome == Outcome.Won);

        double simpleRate = simple.Count(s => s.Outcome == Outcome.Won) / (double)n;
        var won = simple.Where(s => s.Outcome == Outcome.Won).ToList();
        // A loss ends on zero, which is what the lower tail is for.
        var endings = simple.Select(s => s.Outcome == Outcome.Won ? s.Player.HpFraction : 0).OrderBy(x => x).ToList();

        Verdict verdict = VerdictFor(simpleRate);

        return new ForecastResult(
            SimpleWinRate: simpleRate,
            CarefulWinRate: carefulWins / (double)n,
            ExpectedRounds: (int)Math.Round(Median((won.Count > 0 ? won : simple).Select(s => (double)s.Round)), MidpointRounding.AwayFromZero),
            MedianEndingHp: Median(endings),
            LowerTailHp: endings[(int)Math.Floor((endings.Count - 1) * 0.1)],
            Verdict: verdict,
            AssistSuggested: verdict != Verdict.Likely,
            Why: Reasons(monster, level, boosts ?? Boosts.None, simpleRate, carefulWins / (double)n));
    }

    /// <summary>The label for a simple-play win rate.</summary>
    public static Verdict VerdictFor(double simpleWinRate) =>
        simpleWinRate >= LikelyAt ? Verdict.Likely : simpleWinRate >= CloseAt ? Verdict.Close : Verdict.Tough;

    private static double Median(IEnumerable<double> values)
    {
        var xs = values.OrderBy(x => x).ToList();
        if (xs.Count == 0) return 0;
        int mid = xs.Count / 2;
        return xs.Count % 2 == 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
    }

    /// <summary>
    /// The game factors worth naming, most useful first. Every one is about the
    /// fight - the monster's rhythm, a move that answers it, today's charge -
    /// and none is about the person.
    /// </summary>
    public static IReadOnlyList<ForecastReason> Reasons(
        Monster monster, int level, Boosts boosts, double simpleWinRate, double carefulWinRate)
    {
        var why = new List<ForecastReason>();
        BattleState opening = Battle.Begin(monster, level, 0, boosts);

        double worstTurn = WorstTurnShare(monster, opening);
        if (worstTurn >= BigHitShare)
        {
            int percent = (int)(Math.Round(worstTurn * 20, MidpointRounding.AwayFromZero) * 5);
            why.Add(new("big-hits", $"Its strongest turn can take about {percent}% of your health."));
        }

        ForecastReason? rhythm = monster.Behavior switch
        {
            Behavior.Bruiser => new("heavy-blow", "Every third turn it winds up a heavy blow. Guard when it warns you."),
            Behavior.Swarm => new("two-blows", "When it attacks, it strikes twice in one turn."),
            Behavior.Guardian => new("braces", "Every third turn it braces, so hits land softer for a moment."),
            Behavior.Drainer => new("drain", "It lays a drain on you that ticks away each turn."),
            Behavior.Trickster => new("trickster", "It hits harder than it looks, but sometimes misses."),
            Behavior.Healer => new("heals", "It mends itself when hurt. Its heals fade as the fight goes on."),
            _ => null,
        };
        if (rhythm is not null) why.Add(rhythm);

        if (carefulWinRate - simpleWinRate >= CarefulTipGap)
        {
            // Guarding is the other half of careful play, and it only answers a heavy blow.
            why.Add(new("heal-earlier", monster.Behavior == Behavior.Bruiser
                ? "Healing a little earlier, and guarding when it warns you, makes a big difference here."
                : "Healing a little earlier makes a big difference here."));
        }

        if (Charges.HitsWeakness(boosts.Charges, monster))
        {
            why.Add(new("weakness-lit", "Today's logging hits its weak spot."));
        }
        else
        {
            why.Add(new("weakness", $"It is weak to {monster.Weakness}. Logging that today would help."));
        }

        int strike = Battle.PreviewDamage(opening, Actions.Strike, monster);
        int spell = Battle.PreviewDamage(opening, Actions.Spell, monster);
        if (spell > strike) why.Add(new("thick-hide", "Its hide is thick. Spell goes straight through."));

        return why.Take(MaxReasons).ToList();
    }

    /// <summary>
    /// The most one monster turn can take from a full-health player, as a share
    /// of max HP: its hardest attack, its playstyle's scale and hit count, and
    /// the top of the wobble. Before shield and guard.
    /// </summary>
    public static double WorstTurnShare(Monster monster, BattleState opening)
    {
        int power = monster.Actions.Where(a => a.Type == ActionType.Attack).Select(a => a.Power).DefaultIfEmpty(0).Max();
        if (power == 0 || opening.Player.MaxHp <= 0) return 0;

        (double scale, int hits) = monster.Behavior switch
        {
            Behavior.Bruiser => (Behaviours.BruiserHeavyScale, 1),
            Behavior.Swarm => (Behaviours.SwarmHitScale, 2),
            Behavior.Trickster => (Behaviours.TricksterHitScale, 1),
            Behavior.Drainer => (Behaviours.DrainerBlowScale, 1),
            _ => (1.0, 1),
        };
        int perHit = Battle.Damage(monster.Attack, power, opening.Player.Defense, scale, 1 + Rng.Variance, 0);
        return Math.Min(1, perHit * hits / (double)opening.Player.MaxHp);
    }
}
