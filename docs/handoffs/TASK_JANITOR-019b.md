# TASK JANITOR-019b — Replace call-sites: infrastructure/db + application layers

**Sprint:** JANITOR-019
**Branch:** `task/JANITOR-019b-callsites-infra-app`
**Estimate:** ~1.5h
**Depends on:** JANITOR-019a (barrel must exist before imports are added)
**Blocks:** nothing (019c is independent after 019a)

---

## Objective

Replace every `.map(() => "?").join(` occurrence in the `infrastructure/db/` stores and the `application/` layer. Eight files total.

---

## Files to edit

| File | Sites |
|------|-------|
| `apps/mcp-server/src/infrastructure/db/evidenceFragmentStore.ts` | 1 |
| `apps/mcp-server/src/infrastructure/db/insiderStore.ts` | 1 |
| `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` | 1 (compact join variant — normalise to `", "`) |
| `apps/mcp-server/src/infrastructure/fetchers/hose.ts` | confirm variant before replacing |
| `apps/mcp-server/src/infrastructure/fetchers/hnx.ts` | confirm variant before replacing |
| `apps/mcp-server/src/application/usecases/assembleBriefing.ts` | 3 |
| `apps/mcp-server/src/domain/services/marketContextBuilder.ts` | 1 — NOTE: domain layer |

### Domain layer note

`marketContextBuilder.ts` lives in `domain/` but must call through a repository, not import `sqlHelpers` directly. Check the actual pattern in the file: if it is constructing a raw SQL string, the DDD rule is already broken (pre-existing violation). In that case, replace the inline pattern with `sqlInClause` using the relative path `../../../infrastructure/db/sqlHelpers.js` and add a `// TODO(ddd): move raw SQL to repository` comment. Do NOT restructure the DDD violation in this task — that is out of scope.

---

## Replacement pattern

```ts
// Before (variable form)
const placeholders = items.map(() => "?").join(", ");
// ... IN (${placeholders})

// After
import { sqlInClause } from "../../infrastructure/db/sqlHelpers.js"; // adjust path
// ... IN (${sqlInClause(items.length)})
// remove the now-unused `placeholders` variable
```

```ts
// Before (compact join — seedWatchlist)
codes.map(() => "?").join(",")

// After
sqlInClause(codes.length)
```

---

## Gotchas

- `seedWatchlist.ts:172` uses `join(",")` — normalise separator to `", "` (semantically identical in SQLite).
- `hose.ts` and `hnx.ts` are marked "confirm" — grep the file for `map(() => "?")` before replacing; skip if not found.
- Import path depth varies per file — count `../` levels carefully.
- Use `.js` extension on all imports (ESM compatibility, dev-standards.md).

---

## Acceptance criteria

- [ ] All listed files use `sqlInClause(...)` — no `.map(() => "?").join(` remains in these files.
- [ ] Unused `placeholders` variable bindings are removed.
- [ ] Full test suite passes with no new failures.
- [ ] No new import added to any `domain/` file other than the noted pre-existing violation in `marketContextBuilder.ts`.
