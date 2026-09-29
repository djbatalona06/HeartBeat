export interface Command {
  id: string;
  label: string;
  hint: string;
  to: string;
}

/** Sub-sequence matching, so "wk" finds Work and "st" finds Settings. */
export function fuzzyScore(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let score = 0;
  let at = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, at);
    if (found === -1) return null;
    // A run of adjacent characters beats the same letters scattered about.
    score += found === at ? 2 : 1;
    at = found + 1;
  }
  // A shorter target matching the same query is the better match.
  return score - t.length * 0.01;
}

export function rank(query: string, commands: Command[]): Command[] {
  if (!query.trim()) return commands;
  return commands
    .map((c) => ({ c, s: Math.max(fuzzyScore(query, c.label) ?? -Infinity, (fuzzyScore(query, c.hint) ?? -Infinity) - 1) }))
    .filter((x) => x.s > -Infinity)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}
