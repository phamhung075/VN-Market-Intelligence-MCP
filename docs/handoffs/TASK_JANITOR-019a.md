# TASK JANITOR-019a — Create sqlHelpers.ts + test + barrel export

**Sprint:** JANITOR-019
**Branch:** `task/JANITOR-019a-sqlhelpers-create`
**Estimate:** ~1h
**Depends on:** none
**Blocks:** JANITOR-019b, JANITOR-019c

---

## Objective

Create the `sqlInClause` helper function, its unit test, and wire the barrel export. No call-sites are touched in this task.

---

## Files to create / edit

| Action | Path |
|--------|------|
| CREATE | `apps/mcp-server/src/infrastructure/db/sqlHelpers.ts` |
| CREATE | `apps/mcp-server/src/__tests__/JANITOR-019-sqlHelpers.test.ts` |
| EDIT   | `apps/mcp-server/src/infrastructure/db/index.ts` — add barrel re-export |

---

## Implementation

### sqlHelpers.ts (~15 lines)

```ts
/**
 * Returns a comma-separated list of `?` placeholders for a SQL IN clause.
 * @param n - number of bind parameters (must be >= 1)
 * @returns e.g. sqlInClause(3) => "?, ?, ?"
 * @throws RangeError if n < 1
 */
export function sqlInClause(n: number): string {
  if (n < 1) throw new RangeError("sqlInClause requires n >= 1");
  return Array(n).fill("?").join(", ");
}
```

### Test file (~30 lines)

Cover: n=1, n=3, n=0 throws RangeError, n=-1 throws RangeError.

### Barrel export

Read `apps/mcp-server/src/infrastructure/db/index.ts` first.
If it already re-exports infrastructure symbols, add:
```ts
export { sqlInClause } from "./sqlHelpers.js";
```
If it is schema-only, add the export anyway — the barrel is the canonical import path.

---

## Acceptance criteria

- [ ] `sqlHelpers.ts` exports `sqlInClause` with the signature above.
- [ ] `JANITOR-019-sqlHelpers.test.ts` passes: n=1, n=3, n=0 throws, n=-1 throws.
- [ ] `infrastructure/db/index.ts` re-exports `sqlInClause`.
- [ ] Full test suite passes with no new failures.
- [ ] No call-sites touched — that is JANITOR-019b and 019c.
