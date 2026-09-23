using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 5 - Rest Haven, and its dark face, Burnout Abyss.
///
/// The axis is rest, so every monster here is weak to <see cref="Element.Rest"/>:
/// a night's sleep logged today is the thing they cannot stand. Everything
/// on this island is too wound up, and the boss has forgotten how to stop.
///
/// Same seven-stage shape as <see cref="Island1"/>, and the same stat curve
/// scaled to this island's level band (entered at 17, boss at 24);
/// <c>IslandTests</c> holds both ends for every island.
/// </summary>
public static class Island5
{
    public static readonly Island Value = new(
        Number: 5,
        LightName: "Rest Haven",
        DarkName: "Burnout Abyss",
        Element: Element.Rest,
        Stages:
        [
            new Stage(1, "Lantern Lane", new Monster(
                Id: "i5s1-glowmoth",
                Name: "Glowmoth",
                Type: MonsterType.Common,
                Hp: 184, Attack: 26, Defense: 9, Speed: 5,
                Weakness: Element.Rest, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Flutter", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Jitter", 0, Element.Focus, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "glowmoth",
                Theme: DioramaTheme.Light)),

            new Stage(2, "The Hammock Grove", new Monster(
                Id: "i5s2-shellsnooze",
                Name: "Shellsnooze",
                Type: MonsterType.Common,
                Hp: 277, Attack: 33, Defense: 13, Speed: 7,
                Weakness: Element.Rest, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Nudge", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Curl In", 0, Element.Movement, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "shellsnooze",
                Theme: DioramaTheme.Light)),

            new Stage(3, "The Tea Garden", new Monster(
                Id: "i5s3-steepling",
                Name: "Steepling",
                Type: MonsterType.Common,
                Hp: 391, Attack: 41, Defense: 18, Speed: 10,
                Weakness: Element.Rest, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Scald", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Caffeine Buzz", 0, Element.Mood, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "steepling",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Clock Tower", new Monster(
                Id: "i5s4-midnight-clock",
                Name: "The Midnight Clock",
                Type: MonsterType.SemiBoss,
                Hp: 457, Attack: 51, Defense: 18, Speed: 7,
                Weakness: Element.Rest, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Toll", 11, Element.Focus, ActionType.Attack),
                    new MonsterAction("One More Hour", 0, Element.Focus, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Wind Back", 71, Element.Focus, ActionType.Heal),
                ],
                SpriteKey: "midnight-clock",
                Theme: DioramaTheme.Light)),

            new Stage(5, "Pillow Fields", new Monster(
                Id: "i5s5-fluffkin",
                Name: "Fluffkin",
                Type: MonsterType.Common,
                Hp: 261, Attack: 43, Defense: 8, Speed: 12,
                Weakness: Element.Rest, Strength: Element.Nourishment,
                Actions:
                [
                    new MonsterAction("Pillow Bop", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "fluffkin",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Workshop", new Monster(
                Id: "i5s6-anvil-golem",
                Name: "Anvil Golem",
                Type: MonsterType.Elite,
                Hp: 691, Attack: 59, Defense: 26, Speed: 7,
                Weakness: Element.Rest, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Hammer Down", 13, Element.Mood, ActionType.Attack),
                    new MonsterAction("Clock In", 0, Element.Mood, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Burn the Oil", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 14, 3)),
                ],
                SpriteKey: "anvil-golem",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Dreamwell", new Monster(
                Id: "i5s7-lady-lullaby",
                Name: "Lady Lullaby",
                Type: MonsterType.Boss,
                Hp: 1068, Attack: 59, Defense: 21, Speed: 8,
                Weakness: Element.Rest, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Alarm Bell", 15, Element.Movement, ActionType.Attack),
                    new MonsterAction("Pillow Fort", 0, Element.Movement, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Keep Going", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 19, 3)),
                ],
                SpriteKey: "lady-lullaby",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i5s1-glowmoth"] = "Frayed Glowmoth",
            ["i5s2-shellsnooze"] = "Restless Shellsnooze",
            ["i5s3-steepling"] = "Overbrewed Steepling",
            ["i5s4-midnight-clock"] = "The Burnt Midnight Clock",
            ["i5s5-fluffkin"] = "Flattened Fluffkin",
            ["i5s6-anvil-golem"] = "Overheated Anvil",
            ["i5s7-lady-lullaby"] = "The Wakeful Lullaby",
        };
}
