/**
 * The two helpers every section of the repository needs, and nothing else.
 *
 * These lived at the top of the old single-file repository. They are here so
 * that a new section imports them rather than redeclaring them, and so that
 * adding a section never means editing a file another branch is also editing.
 */

export function id(): string {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}
