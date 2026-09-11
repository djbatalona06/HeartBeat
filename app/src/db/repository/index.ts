/**
 * Every write in the app goes through this module. Components call these and
 * await them; the Dexie live queries re-render on their own. Nothing in
 * `features/` touches the database directly.
 *
 * This used to be one file that every unit appended to, and three pull requests
 * broke `main` conflicting on its last line. It is now one file per section,
 * re-exported here in alphabetical order. Adding a section means adding a file
 * and one line below, which two branches can do at once without colliding.
 *
 * Sections import each other directly (`./petXp`), never through this barrel —
 * routing a sibling call through here would make the module graph cyclic.
 */
export * from './achievements';
export * from './assets';
export * from './chat';
export * from './cosmetics';
export * from './entries';
export * from './goals';
export * from './identity';
export * from './inventory';
export * from './members';
export * from './petXp';
export * from './photos';
export * from './quests';
export * from './reflections';
export * from './rpg';
export * from './vitals';
