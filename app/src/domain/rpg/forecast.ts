/**
 * The pre-fight forecast, as the screen says it.
 *
 * The forecast itself is worked out in C# (`game/.../Forecast.cs`), which plays
 * the fight sixty times with a simple player and sixty with a careful one. This
 * is only the wording: a label per verdict, never a percentage, because "a 62%
 * chance" reads as a grade and "could go either way" reads as a heads-up.
 *
 * `forecast.test.ts` reads the C# enum and fails when the two lists drift.
 */

/** Matches the C# `Verdict` enum. */
export const VERDICTS = ['Likely', 'Close', 'Tough'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<Verdict, string> = {
  Likely: 'Good chance with this build',
  Close: 'Could go either way',
  Tough: 'This may be tough',
};

/** The one line above the board, naming what it is about. */
export function forecastLine(monsterName: string, verdict: Verdict): string {
  return `${monsterName}: ${VERDICT_LABELS[verdict]}.`;
}

/**
 * Whether an answer still belongs to the monster on screen. The worker answers
 * asynchronously, and clearing a stage moves `monster` on before the next
 * answer lands; without this the old monster's read would sit under the new one.
 */
export function forecastFits(forecast: { monsterId: string } | null, monsterId: string | undefined): boolean {
  return forecast !== null && monsterId !== undefined && forecast.monsterId === monsterId;
}
