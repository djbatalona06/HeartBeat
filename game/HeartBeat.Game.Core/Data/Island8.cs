using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 8 - Skyward Ridge, and its dark face, Drift Mire.
///
/// The far end of the world: the same axis and the same seven-stage shape as
/// <see cref="Island4"/>, fought at ranks 29 to 36 against monsters
/// that are Island 4's own, grown to match the player at that rank. The
/// seven elements are reused rather than extended: the type chart has seven
/// rows because the app has seven things worth logging, and a new island is
/// a harder visit to one of them, not an eighth.
/// </summary>
public static class Island8
{
    public static readonly Island Value = new(
        Number: 8,
        LightName: "Skyward Ridge",
        DarkName: "Drift Mire",
        Element: Element.Mood,
        Stages:
        [
            new Stage(1, "High Wildflower Path", new Monster(
                Id: "i8s1-chirplet",
                Name: "Elder Chirplet",
                Type: MonsterType.Common,
                Hp: 776, Attack: 106, Defense: 37, Speed: 6,
                Weakness: Element.Mood, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Peck", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Sigh", 0, Element.Focus, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "chirplet-elder",
                Theme: DioramaTheme.Light)),

            new Stage(2, "High Kite Hill", new Monster(
                Id: "i8s2-kitetail",
                Name: "Elder Kitetail",
                Type: MonsterType.Common,
                Hp: 1190, Attack: 138, Defense: 51, Speed: 9,
                Weakness: Element.Mood, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Swoop", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Wind Up", 0, Element.Movement, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "kitetail-elder",
                Theme: DioramaTheme.Light)),

            new Stage(3, "High Sunny Ledge", new Monster(
                Id: "i8s3-glimmerbug",
                Name: "Elder Glimmerbug",
                Type: MonsterType.Common,
                Hp: 1726, Attack: 175, Defense: 71, Speed: 14,
                Weakness: Element.Mood, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Flicker", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Gloom Dust", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "glimmerbug-elder",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The High Echo Cave", new Monster(
                Id: "i8s4-the-echo",
                Name: "The Elder Echo",
                Type: MonsterType.SemiBoss,
                Hp: 2054, Attack: 230, Defense: 75, Speed: 9,
                Weakness: Element.Mood, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Echo Shout", 11, Element.Focus, ActionType.Attack),
                    new MonsterAction("Say It Again", 0, Element.Focus, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Echo Back", 317, Element.Focus, ActionType.Heal),
                ],
                SpriteKey: "the-echo-elder",
                Theme: DioramaTheme.Light,
                Behavior: Behavior.Healer)),

            new Stage(5, "High Meadow Crest", new Monster(
                Id: "i8s5-puffball",
                Name: "Elder Puffball",
                Type: MonsterType.Common,
                Hp: 1209, Attack: 194, Defense: 37, Speed: 17,
                Weakness: Element.Mood, Strength: Element.Nourishment,
                Actions:
                [
                    new MonsterAction("Bounce", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "puffball-elder",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The High Stone Circle", new Monster(
                Id: "i8s6-cairn-keeper",
                Name: "Elder Cairn Keeper",
                Type: MonsterType.Elite,
                Hp: 3303, Attack: 276, Defense: 120, Speed: 9,
                Weakness: Element.Mood, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Stack Slam", 13, Element.Rest, ActionType.Attack),
                    new MonsterAction("Stand Tall", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Cold Shoulder", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 65, 3)),
                ],
                SpriteKey: "cairn-keeper-elder",
                Theme: DioramaTheme.Light,
                Behavior: Behavior.Bruiser)),

            new Stage(7, "The High Summit Bonfire", new Monster(
                Id: "i8s7-merriweather",
                Name: "Elder Mother Merriweather",
                Type: MonsterType.Boss,
                Hp: 5214, Attack: 272, Defense: 97, Speed: 10,
                Weakness: Element.Mood, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Thunderclap", 15, Element.Movement, ActionType.Attack),
                    new MonsterAction("Cloud Cover", 0, Element.Movement, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Rain on the Parade", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 83, 3)),
                ],
                SpriteKey: "merriweather-elder",
                Theme: DioramaTheme.Light,
                Behavior: Behavior.Drainer)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i8s1-chirplet"] = "Elder Hushed Chirplet",
            ["i8s2-kitetail"] = "Elder Tangled Kitetail",
            ["i8s3-glimmerbug"] = "Elder Dim Glimmerbug",
            ["i8s4-the-echo"] = "The Elder Lonely Echo",
            ["i8s5-puffball"] = "Elder Gray Puffball",
            ["i8s6-cairn-keeper"] = "Elder Toppled Cairn",
            ["i8s7-merriweather"] = "The Elder Silent Merriweather",
        };
}
