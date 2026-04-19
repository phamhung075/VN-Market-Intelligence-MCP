# TECH-181: fix(test-isolation) — bulk Bun.env DB_PATH replace

status: APPROVED_BY_ARCHITECT
req_ref: REQ-181

## Brownfield Impact

- Files modified: `src/__tests__/*.test.ts` — 242 files matching `process.env["DB_PATH"]` at line 1 (filesystem actual; REQ says 109 as post-Sprint-180 estimate — dynamic discovery governs)
- Files created: `src/__tests__/1480-db-isolation-batch5.test.ts`
- Files deleted: none
- Breaking changes: no — line 1 replacement only, no logic change

## Architecture Decision

`schema.ts:64` reads `Bun.env["DB_PATH"]` exclusively. In Bun, `process.env` and `Bun.env` are separate namespaces; setting `process.env["DB_PATH"] = ":memory:"` at test line 1 has zero effect on schema.ts — DB falls back to `DEFAULT_DB_PATH = data/market.db` (production). Bulk sed replace on line 1 only is the safest, most auditable fix: one changed line per file, full git diff trail, no logic touched.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
| --- | --- | --- | --- |
| TDD isolation test | interface | `src/__tests__/1480-db-isolation-batch5.test.ts` | NEW |
| 242 test files line 1 | interface | `src/__tests__/*.test.ts` | MODIFY (line 1 only) |

## Interface Contracts

No new domain interfaces. Change is purely in test infrastructure layer.

Key invariant preserved: `schema.ts:64` `Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH` — read-only reference, untouched.

## Verified Adjacent Lines (BA-confirmed locations)

- `schema.ts:60-67`: `getDb()` function signature unchanged — reads `Bun.env["DB_PATH"]` at line 64, `DEFAULT_DB_PATH` fallback at line 31. No interface change.
- Already-fixed files: `Bun.env["DB_PATH"] = ":memory:";` at line 1 — sed pattern `^process\.env\["DB_PATH"\]` will not match them. Safe to run on full glob.

## Task Breakdown

| Task | Title | Depends on |
| --- | --- | --- |
| 1480_a | TDD RED: 1480-db-isolation-batch5.test.ts (dynamic Bun.Glob discovery) | — |
| 1480_b | GREEN: bulk sed replace + verify | 1480_a |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| sed touches non-line-1 occurrences | Low | Medium | Pattern anchored with `^` — only line 1 matches |
| Files with comment at line 1 (not env) | Low | Low | Pattern requires exact `^process\.env["DB_PATH"]` — won't match comments |
| Bun worker shared DB state post-fix | Low | High | Each worker opens fresh `:memory:` — ephemeral, no WAL growth |
| Actual count diverges from REQ-181 estimate | Confirmed | Low | TDD uses Bun.Glob dynamic discovery — count mismatch irrelevant |

## Security Review

- SQL parameterized? N/A (test infra only)
- File paths validated? N/A (sed on known glob)
- External HTTP? No
- Secrets via Bun.env only? Yes — this fix enforces it
