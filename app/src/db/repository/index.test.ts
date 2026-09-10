import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import * as barrel from './index';

/**
 * The barrel is the whole point of this directory.
 *
 * `repository.ts` used to be one file every unit appended to, and three pull
 * requests broke `main` conflicting on its last line. Sections are now separate
 * files re-exported by `index.ts`, so two branches can add two sections without
 * touching the same line.
 *
 * That only holds while every section is actually in the barrel. A new file
 * nobody re-exported is invisible to all 21 of its callers, and the failure
 * looks like a missing export rather than a missing line here — so this test
 * reads the directory and insists the two agree.
 */
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Not sections: the barrel itself, the shared helpers, and any test file. */
const NOT_A_SECTION = new Set(['index.ts', 'shared.ts']);

function sectionFiles(): string[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !NOT_A_SECTION.has(f))
    .sort();
}

describe('the repository barrel', () => {
  it('re-exports every section file in the directory', () => {
    const source = readFileSync(join(HERE, 'index.ts'), 'utf8');
    const exported = [...source.matchAll(/export \* from '\.\/([^']+)';/g)]
      .map((m) => `${m[1]}.ts`)
      .sort();
    expect(exported).toEqual(sectionFiles());
  });

  it('lists them alphabetically, so two branches adding one each do not collide', () => {
    const source = readFileSync(join(HERE, 'index.ts'), 'utf8');
    const exported = [...source.matchAll(/export \* from '\.\/([^']+)';/g)].map((m) => m[1]);
    expect(exported).toEqual([...exported].sort());
  });

  it('serves the whole surface its callers import by name', () => {
    // A spot-check across every section: if a section fell out of the barrel,
    // its callers would fail to resolve rather than fail a type check.
    for (const name of [
      'putMood', 'putExercise', 'putCycle', 'putWorkEvent',   // entries
      'draftMessage', 'confirmMessage', 'mergeMessages',      // chat
      'putTask', 'completeTask', 'grantLifeEvent', 'equipItem', // rpg
      'addXp', 'awardPetXp', 'settlePetXp',                   // petXp
      'ensureIdentity', 'rekeyIdentity',                      // identity
      'putWorkoutPhoto', 'removeWorkoutPhoto',                // photos
      'savePairing', 'putMyProfile', 'saveMembersFromServer', // members
      'activeQuest', 'startQuest', 'measureQuest',            // quests
      'achievementState', 'claimAchievements',                // achievements
    ]) {
      expect(barrel, `${name} is missing from the barrel`).toHaveProperty(name);
    }
  });

  it('keeps the shared helpers out of the public surface', () => {
    // `id` and `now` are section plumbing. Exporting them would invite a
    // component to mint its own ids instead of going through a repository call.
    expect(barrel).not.toHaveProperty('id');
    expect(barrel).not.toHaveProperty('now');
  });
});
