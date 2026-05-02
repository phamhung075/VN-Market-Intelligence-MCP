/**
 * SQL utility helpers for building parameterised query fragments.
 */

/**
 * Returns a comma-separated placeholder string for SQLite IN-clauses.
 * @example sqlInClause(3) → "?, ?, ?"
 */
export function sqlInClause(n: number): string {
  if (n < 1) throw new RangeError(`sqlInClause requires n ≥ 1, got ${n}`);
  return Array(n).fill("?").join(", ");
}
