import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../../db/database';
import { dexieStudyStore } from '../../db/study.repository';
import { DEFAULT_TIMEZONE } from '../../domain/types';
import { StudyPage } from './StudyPage';

/**
 * The in-app wiring, kept apart from the screen itself.
 *
 * `StudyPage` is mounted twice — here, and again in the standalone HTML file,
 * where there is no Dexie and no settings row. Everything that knows about the
 * database therefore lives in this file, which the standalone build never
 * imports. It is a four-line component on purpose.
 */
export function StudyRoute() {
  const settings = useLiveQuery(loadSettings, []);
  return (
    <StudyPage
      store={dexieStudyStore}
      timeZone={settings?.timeZone ?? DEFAULT_TIMEZONE}
    />
  );
}
