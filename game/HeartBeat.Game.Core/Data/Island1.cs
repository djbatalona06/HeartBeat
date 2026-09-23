using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 1 - Morning Meadow, and its dark face, Sloth Bog.
///
/// The axis is movement, so every monster here is weak to
/// <see cref="Element.Movement"/> and most resist <see cref="Element.Rest"/>:
/// you do not out-sleep the thing that is keeping you in bed.
///
/// The seven stages follow the island shape used by every island after this
/// one - common, common, common, semi-boss, common, elite, boss - with stage 5
/// deliberately soft. A recovery stage after the semi-boss is what stops a
/// seven-fight island from being a seven-fight slog.
///
/// The monsters are four friendly elemental spirits - Earth, Water, Fire and
/// Air - which is their name and their sprite and nothing more. The fight's
/// type chart is <see cref="Element"/>, themed on the app's self-care areas,
/// and the spirits' elements deliberately do not touch it. Their ids and sprite
/// keys still carry the old names because the ids are stored in every
/// couple's clear list; renaming them would forget who had beaten what.
///
/// Stat curve: HP roughly doubles across the island while the player's does
/// not, which is what the level-up rewards and the element chart are for.
/// `Island1Tests` pins the two ends - stage 1 must be winnable at level 1, and
/// the boss must be winnable at level 5 - so the middle can be tuned by feel
/// without anyone discovering a wall by walking into it.
/// </summary>
public static class Island1
{
    private static MonsterAction Tackle(int power) => new("Tackle", power, Element.Movement, ActionType.Attack);

    public static readonly Island Value = new(
        Number: 1,
        LightName: "Morning Meadow",
        DarkName: "Sloth Bog",
        Element: Element.Movement,
        Stages:
        [
            new Stage(1, "The First Step", new Monster(
                Id: "i1s1-sloth-sprout",
                Name: "Mossling",
                Type: MonsterType.Common,
                Hp: 30, Attack: 5, Defense: 3, Speed: 2,
                Weakness: Element.Movement, Strength: Element.Rest,
                Actions:
                [
                    Tackle(5),
                    new MonsterAction("Yawn", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "sloth-sprout",
                Theme: DioramaTheme.Light)),

            new Stage(2, "Dew Line", new Monster(
                Id: "i1s2-dozing-beetle",
                Name: "Dewdrop Sprite",
                Type: MonsterType.Common,
                Hp: 42, Attack: 7, Defense: 4, Speed: 4,
                Weakness: Element.Movement, Strength: Element.Rest,
                Actions:
                [
                    Tackle(7),
                    new MonsterAction("Shell Up", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "dozing-beetle",
                Theme: DioramaTheme.Light)),

            new Stage(3, "The Long Grass", new Monster(
                Id: "i1s3-snooze-thistle",
                Name: "Cinder Sprite",
                Type: MonsterType.Common,
                Hp: 55, Attack: 9, Defense: 5, Speed: 6,
                Weakness: Element.Movement, Strength: Element.Focus,
                Actions:
                [
                    Tackle(9),
                    new MonsterAction("Pollen Haze", 0, Element.Focus, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "snooze-thistle",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Long Lie-In", new Monster(
                Id: "i1s4-lie-in",
                Name: "The Long Drizzle",
                Type: MonsterType.SemiBoss,
                Hp: 90, Attack: 11, Defense: 7, Speed: 3,
                Weakness: Element.Movement, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Heavy Quilt", 11, Element.Rest, ActionType.Attack),
                    new MonsterAction("Five More Minutes", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Settle In", 14, Element.Rest, ActionType.Heal),
                ],
                SpriteKey: "lie-in",
                Theme: DioramaTheme.Light)),

            new Stage(5, "Open Ground", new Monster(
                Id: "i1s5-dust-drifter",
                Name: "Breeze Wisp",
                Type: MonsterType.Common,
                Hp: 48, Attack: 8, Defense: 3, Speed: 9,
                Weakness: Element.Movement, Strength: Element.Mood,
                Actions: [Tackle(8)],
                SpriteKey: "dust-drifter",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Old Couch", new Monster(
                Id: "i1s6-couch-moss",
                Name: "Mossback Golem",
                Type: MonsterType.Elite,
                Hp: 120, Attack: 13, Defense: 9, Speed: 4,
                Weakness: Element.Movement, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Slump", 13, Element.Rest, ActionType.Attack),
                    new MonsterAction("Take Root", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Creeping Moss", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 4, 3)),
                ],
                SpriteKey: "couch-moss",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Sentinel's Field", new Monster(
                Id: "i1s7-sedentary-sentinel",
                Name: "The Hearthkeeper",
                Type: MonsterType.Boss,
                Hp: 200, Attack: 12, Defense: 8, Speed: 4,
                Weakness: Element.Movement, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Crushing Weight", 15, Element.Movement, ActionType.Attack),
                    new MonsterAction("Rooted Stance", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Drain Vigor", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 5, 3)),
                ],
                SpriteKey: "sedentary-sentinel",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>
    /// What each stage's monster is called on the island's dark face.
    ///
    /// A separate map rather than a field on <see cref="Monster"/> because the
    /// dark name is a presentation detail of the island, and keeping it here
    /// means adding island 2 is one file and no model change.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i1s1-sloth-sprout"] = "Bog Mossling",
            ["i1s2-dozing-beetle"] = "Murk Dewdrop",
            ["i1s3-snooze-thistle"] = "Smoulder Sprite",
            ["i1s4-lie-in"] = "The Endless Drizzle",
            ["i1s5-dust-drifter"] = "Fog Wisp",
            ["i1s6-couch-moss"] = "Sunken Mossback",
            ["i1s7-sedentary-sentinel"] = "The Ashen Hearthkeeper",
        };
}
