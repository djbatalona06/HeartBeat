/**
 * The vocabulary the cycle log offers.
 *
 * Ordinary clinical terms, grouped so the sheet can show a heading rather than
 * one flat list of forty chips. The groups are for reading, not for meaning:
 * `CycleEntry.symptoms` stores the plain strings, so regrouping later is a
 * change to this file and nothing else.
 */

import type { CycleEntry } from '../types';

export type Flow = NonNullable<CycleEntry['flow']>;

export const FLOWS: ReadonlyArray<{ id: Flow; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'heavy', label: 'Heavy' },
  { id: 'clots', label: 'Clots' },
];

export interface SymptomGroup {
  label: string;
  items: readonly string[];
}

export const SYMPTOM_GROUPS: readonly SymptomGroup[] = [
  {
    label: 'Pain',
    items: ['Cramps', 'Back pain', 'Headache', 'Migraine', 'Joint pain', 'Muscle aches', 'Ovulation pain'],
  },
  {
    label: 'Body',
    items: ['Tender breasts', 'Bloating', 'Swelling', 'Acne', 'Oily skin', 'Dry skin', 'Hair changes'],
  },
  {
    label: 'Stomach',
    items: ['Nausea', 'Cravings', 'Constipation', 'Diarrhea', 'Gas', 'Indigestion'],
  },
  {
    label: 'Energy',
    items: ['Fatigue', 'Insomnia', 'Brain fog', 'Dizziness', 'Hot flashes', 'Night sweats', 'Chills'],
  },
];

export const SYMPTOMS: readonly string[] = SYMPTOM_GROUPS.flatMap((g) => g.items);

export const MOODS: readonly string[] = [
  'Calm', 'Happy', 'Energetic', 'Confident',
  'Irritable', 'Anxious', 'Sad', 'Low',
  'Sensitive', 'Restless', 'Withdrawn', 'Frustrated',
];

/**
 * The four named stretches of a cycle.
 *
 * Phases are a reading aid, not a diagnosis: they are derived from the
 * predicted ovulation, so they carry the same error bar the prediction does.
 */
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulatory: 'Ovulatory',
  luteal: 'Luteal',
};
