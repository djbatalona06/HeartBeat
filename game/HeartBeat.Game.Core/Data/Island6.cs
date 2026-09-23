using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 6 - Tandem Tides, and its dark face, Drifting Shoals.
///
/// The axis is the two of you, so every monster here is weak to
/// <see cref="Element.Bond"/> - the charge nobody can log alone. It lights
/// when both of you have logged something on the same day. A shoreline of
/// things that come in pairs, and a boss that pulls them apart.
///
/// Same seven-stage shape as <see cref="Island1"/>, and the same stat curve
/// scaled to this island's level band (entered at 21, boss at 28);
/// <c>IslandTests</c> holds both ends for every island.
/// </summary>
public static class Island6
{
    public static readonly Island Value = new(
        Number: 6,
        LightName: "Tandem Tides",
        DarkName: "Drifting Shoals",
        Element: Element.Bond,
        Stages:
        [
            new Stage(1, "The Twin Shells", new Monster(
                Id: "i6s1-clamlet",
                Name: "Clamlet",
                Type: MonsterType.Common,
                Hp: 247, Attack: 32, Defense: 12, Speed: 6,
                Weakness: Element.Bond, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Pinch", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Clam Up", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "clamlet",
                Theme: DioramaTheme.Light)),

            new Stage(2, "Tidepool Steps", new Monster(
                Id: "i6s2-starfin",
                Name: "Starfin",
                Type: MonsterType.Common,
                Hp: 367, Attack: 42, Defense: 17, Speed: 8,
                Weakness: Element.Bond, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Arm Swipe", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Brace", 0, Element.Focus, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "starfin",
                Theme: DioramaTheme.Light)),

            new Stage(3, "The Kelp Maze", new Monster(
                Id: "i6s3-kelpkin",
                Name: "Kelpkin",
                Type: MonsterType.Common,
                Hp: 519, Attack: 55, Defense: 23, Speed: 11,
                Weakness: Element.Bond, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Lash", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Knot Up", 0, Element.Movement, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "kelpkin",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Lighthouse", new Monster(
                Id: "i6s4-lamp-keeper",
                Name: "The Lamp Keeper",
                Type: MonsterType.SemiBoss,
                Hp: 608, Attack: 69, Defense: 23, Speed: 8,
                Weakness: Element.Bond, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Beam", 11, Element.Mood, ActionType.Attack),
                    new MonsterAction("Look Away", 0, Element.Mood, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Relight", 95, Element.Mood, ActionType.Heal),
                ],
                SpriteKey: "lamp-keeper",
                Theme: DioramaTheme.Light)),

            new Stage(5, "The Sandbar", new Monster(
                Id: "i6s5-crablet",
                Name: "Crablet",
                Type: MonsterType.Common,
                Hp: 346, Attack: 57, Defense: 10, Speed: 13,
                Weakness: Element.Bond, Strength: Element.Nourishment,
                Actions:
                [
                    new MonsterAction("Scuttle", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "crablet",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Wreck", new Monster(
                Id: "i6s6-barnacle-golem",
                Name: "Barnacle Golem",
                Type: MonsterType.Elite,
                Hp: 917, Attack: 77, Defense: 34, Speed: 8,
                Weakness: Element.Bond, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Hull Slam", 13, Element.Rest, ActionType.Attack),
                    new MonsterAction("Batten Down", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Undertow", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 18, 3)),
                ],
                SpriteKey: "barnacle-golem",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Tide Between", new Monster(
                Id: "i6s7-queen-coralie",
                Name: "Queen Coralie",
                Type: MonsterType.Boss,
                Hp: 1415, Attack: 77, Defense: 27, Speed: 9,
                Weakness: Element.Bond, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Riptide", 15, Element.Focus, ActionType.Attack),
                    new MonsterAction("Coral Wall", 0, Element.Focus, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Pull Apart", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 25, 3)),
                ],
                SpriteKey: "queen-coralie",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i6s1-clamlet"] = "Shut Clamlet",
            ["i6s2-starfin"] = "Stranded Starfin",
            ["i6s3-kelpkin"] = "Tangled Kelpkin",
            ["i6s4-lamp-keeper"] = "The Dark Lamp Keeper",
            ["i6s5-crablet"] = "Sideways Crablet",
            ["i6s6-barnacle-golem"] = "Sunken Barnacle",
            ["i6s7-queen-coralie"] = "The Drifting Coralie",
        };
}
