/**
 * The words the app is willing to put in someone's mouth.
 *
 * A generated compliment is unusual among this app's features: everything else
 * records what one of them did, and this one *writes* to the other in their
 * partner's name. That asymmetry is what the rules here are for.
 *
 * Three of them, and none is decoration:
 *
 *  - **It is never sent unread.** The endpoint returns candidates. A person
 *    picks one, or edits it, or writes their own. A generated line delivered
 *    without anyone choosing it is a bot texting your partner, which is the
 *    opposite of the thing being built.
 *  - **The prompt carries shape, not diary.** What goes to the model is a tone,
 *    a name, and at most a couple of coarse signals. Not the mood log, not the
 *    notes, not the cycle. The point is a line that sounds like them, and that
 *    does not require handing over what they wrote.
 *  - **The sender's blocklist wins.** Every couple has words that land wrong.
 *    A candidate containing one is dropped rather than shown, because seeing it
 *    at all is the harm.
 */

export const TONES = ['tender', 'playful', 'funny', 'proud'] as const;
export type Tone = (typeof TONES)[number];

export const DEFAULT_TONE: Tone = 'tender';

/** How each tone is described to the model. Second person, because it is. */
export const TONE_BRIEF: Record<Tone, string> = {
  tender: 'warm and sincere, the kind of thing said quietly',
  playful: 'teasing and affectionate, the way close people talk',
  funny: 'genuinely funny, and still kind — the joke is never at their expense',
  proud: 'admiring, about something they have actually been doing',
};

/** Long enough for a real sentence, short enough to read on a lock screen. */
export const MAX_COMPLIMENT = 160;
export const MIN_COMPLIMENT = 8;

/** A pet name, not a paragraph. */
export const MAX_PET_NAME = 24;

export interface ComplimentSettings {
  tone: Tone;
  /** What the sender calls them. Blank means the model uses no name at all. */
  petName?: string;
  /** Words this couple does not want to see. Matched case-insensitively. */
  blocked?: string[];
}

/**
 * Coarse signals only — a streak length, a quest name, a direction of travel.
 *
 * Deliberately not the mood log. A line that quotes what someone wrote in a bad
 * week is not a compliment, and the model does not need it to write one.
 */
export interface ComplimentContext {
  workoutStreak?: number;
  questName?: string;
  moodTrend?: 'up' | 'steady' | 'down';
}

export function isTone(value: unknown): value is Tone {
  return typeof value === 'string' && (TONES as readonly string[]).includes(value);
}

/**
 * Normalise whatever the model returned into one candidate line, or null.
 *
 * Models like to wrap a line in quotes, number it, and add a trailing note.
 * Stripping that here rather than asking the prompt to stop doing it is more
 * reliable, because the prompt is a request and this is not.
 */
export function cleanCandidate(raw: string): string | null {
  let line = raw.trim();
  line = line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '');
  line = line.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  // A model that ignored "one line" gets its first one taken.
  line = line.split('\n')[0].trim();
  if (line.length < MIN_COMPLIMENT || line.length > MAX_COMPLIMENT) return null;
  return line;
}

/** Does this line contain something the sender said they never want to see? */
export function isBlocked(line: string, blocked: string[] | undefined): boolean {
  if (!blocked?.length) return false;
  const haystack = line.toLowerCase();
  return blocked.some((word) => {
    const needle = word.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * The candidates worth showing: cleaned, unblocked, and each one distinct.
 *
 * Duplicates are dropped because three candidates that say the same thing is a
 * choice in name only, and a model asked for three variations will sometimes
 * give the same sentence three ways.
 */
export function usableCandidates(raw: string[], settings: ComplimentSettings): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const line = cleanCandidate(item);
    if (!line || isBlocked(line, settings.blocked)) continue;
    const fingerprint = line.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(line);
  }
  return out;
}

/**
 * What the model is asked for.
 *
 * Built here rather than in the endpoint so it can be read, argued with, and
 * tested — a prompt is the part of an AI feature most likely to be wrong and
 * least likely to be looked at.
 */
export function buildPrompt(settings: ComplimentSettings, context: ComplimentContext): string {
  const name = settings.petName?.trim();
  const lines = [
    'Write three different short messages from one partner to the other in a long-term relationship.',
    `Tone: ${TONE_BRIEF[settings.tone]}.`,
    name ? `They call them "${name}". Use it in at most one of the three.` : 'Use no name.',
  ];

  if (context.workoutStreak && context.workoutStreak >= 3) {
    lines.push(`They have worked out ${context.workoutStreak} days running.`);
  }
  if (context.questName) lines.push(`They are partway through a shared goal called "${context.questName}".`);
  if (context.moodTrend === 'down') {
    // Named, not described. The model should be gentle without being told what
    // was written — and without announcing that it noticed.
    lines.push('They have had a harder week than usual. Be warm about it without mentioning it directly.');
  }

  lines.push(
    'Rules: one sentence each. Under 160 characters. Specific, not greeting-card.',
    'No emoji. No quotation marks. No numbering. Return exactly three lines, nothing else.',
  );
  return lines.join('\n');
}
