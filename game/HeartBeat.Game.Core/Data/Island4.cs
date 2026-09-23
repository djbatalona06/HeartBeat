using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 4 - Joy Ridge, and its dark face, Isolation Peak.
///
/// The axis is mood, so every monster here is weak to <see cref="Element.Mood"/>:
/// checking in with how you feel - or saying what you are grateful for -
/// charges the thing they are weak to. Birds, kites and a cave that only ever
/// repeats you back to yourself.
///
/// Same seven-stage shape as <see cref="Island1"/>, and the same stat curve
/// scaled to this island's level band (entered at 13, boss at 20);
/// <c>IslandTests</c> holds both ends for every island.
/// </summary>
public static class Island4
{
    public static readonly Island Value = new(
        Number: 4,
        LightName: "Joy Ridge",
        DarkName: "Isolation Peak",
        Element: Element.Mood,
        Stages:
        [
            new Stage(1, "Wildflower Path", new Monster(
                Id: "i4s1-chirplet",
                Name: "Chirplet",
                Type: MonsterType.Common,
                Hp: 151, Attack: 21, Defense: 7, Speed: 4,
                Weakness: Element.Mood, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Peck", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Sigh", 0, Element.Focus, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "chirplet",
                Theme: DioramaTheme.Light)),

            new Stage(2, "Kite Hill", new Monster(
                Id: "i4s2-kitetail",
                Name: "Kitetail",
                Type: MonsterType.Common,
                Hp: 226, Attack: 26, Defense: 10, Speed: 6,
                Weakness: Element.Mood, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Swoop", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Wind Up", 0, Element.Movement, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "kitetail",
                Theme: DioramaTheme.Light)),

            new Stage(3, "Sunny Ledge", new Monster(
                Id: "i4s3-glimmerbug",
                Name: "Glimmerbug",
                Type: MonsterType.Common,
                Hp: 317, Attack: 32, Defense: 13, Speed: 9,
                Weakness: Element.Mood, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Flicker", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Gloom Dust", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "glimmerbug",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Echo Cave", new Monster(
                Id: "i4s4-the-echo",
                Name: "The Echo",
                Type: MonsterType.SemiBoss,
                Hp: 366, Attack: 41, Defense: 13, Speed: 6,
                Weakness: Element.Mood, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Echo Shout", 11, Element.Focus, ActionType.Attack),
                    new MonsterAction("Say It Again", 0, Element.Focus, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Echo Back", 56, Element.Focus, ActionType.Heal),
                ],
                SpriteKey: "the-echo",
                Theme: DioramaTheme.Light)),

            new Stage(5, "Meadow Crest", new Monster(
                Id: "i4s5-puffball",
                Name: "Puffball",
                Type: MonsterType.Common,
                Hp: 207, Attack: 34, Defense: 6, Speed: 11,
                Weakness: Element.Mood, Strength: Element.Nourishment,
                Actions:
                [
                    new MonsterAction("Bounce", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "puffball",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Stone Circle", new Monster(
                Id: "i4s6-cairn-keeper",
                Name: "Cairn Keeper",
                Type: MonsterType.Elite,
                Hp: 558, Attack: 47, Defense: 20, Speed: 6,
                Weakness: Element.Mood, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Stack Slam", 13, Element.Rest, ActionType.Attack),
                    new MonsterAction("Stand Tall", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Cold Shoulder", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 11, 3)),
                ],
                SpriteKey: "cairn-keeper",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Summit Bonfire", new Monster(
                Id: "i4s7-merriweather",
                Name: "Mother Merriweather",
                Type: MonsterType.Boss,
                Hp: 862, Attack: 45, Defense: 16, Speed: 7,
                Weakness: Element.Mood, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Thunderclap", 15, Element.Movement, ActionType.Attack),
                    new MonsterAction("Cloud Cover", 0, Element.Movement, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Rain on the Parade", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 14, 3)),
                ],
                SpriteKey: "merriweather",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i4s1-chirplet"] = "Hushed Chirplet",
            ["i4s2-kitetail"] = "Tangled Kitetail",
            ["i4s3-glimmerbug"] = "Dim Glimmerbug",
            ["i4s4-the-echo"] = "The Lonely Echo",
            ["i4s5-puffball"] = "Gray Puffball",
            ["i4s6-cairn-keeper"] = "Toppled Cairn",
            ["i4s7-merriweather"] = "The Silent Merriweather",
        };
}
