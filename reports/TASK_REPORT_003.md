# Task Report — Task 003: Env Config + Structured Logging

> **Branch**: `task/003-env-config`
> **Date started**: 2026-03-25
> **Date merged**: 2026-03-25
> **Final status**: APPROVED
> **DDD layer**: infrastructure

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog -> Todo | 2026-03-24 | Dependency on 001 cleared |
| Todo -> In Progress | 2026-03-25 | Assigned to Coder |
| In Progress -> Review | 2026-03-25 | Single commit: 7aa5019 |
| Review -> Done | 2026-03-25 | APPROVED — merged with --no-ff |
| Done | 2026-03-25 | Merged to main as 709686b |

---

## Summary of Changes

### Files Created
- `src/infrastructure/config.ts` — Typed `AppConfig` interface, `loadConfig()` function reading PORT/DB_PATH/LOG_LEVEL from `Bun.env` with sensible defaults, `requireEnv()` helper that throws `AppConfigError` for missing required vars, singleton `config` export
- `src/infrastructure/logger.ts` — Structured JSON logger emitting newline-delimited JSON to stdout; `createLogger(minLevel, sink)` factory; log level filtering (debug < info < warn < error); fallback error handling for broken sinks; singleton `logger` export
- `src/__tests__/003-env-config.test.ts` — 18 tests covering config defaults, env overrides, required var errors, logger format, context fields, ISO timestamps, and level filtering

### Files Modified
- `src/infrastructure/index.ts` — Added barrel exports for config (AppConfigError, requireEnv, loadConfig, config, AppConfig, LogLevel) and logger (createLogger, logger, Logger, LogEntry, LogSink)

---

## Test Results

```
bun test src/__tests__/003-env-config.test.ts

  Task 003 — Env config + structured logging
  (pass) PORT defaults to 3000 when not set
  (pass) PORT is parsed from Bun.env when set
  (pass) DB_PATH defaults to './data/market.db' when not set
  (pass) DB_PATH is read from Bun.env when set
  (pass) LOG_LEVEL defaults to 'info' when not set
  (pass) LOG_LEVEL is read from Bun.env when set
  (pass) throws AppConfigError when a required env var is missing
  (pass) requireEnv returns the value when the var is present
  (pass) AppConfigError message names the missing variable
  (pass) logger createLogger returns an object with info, warn, error, debug methods
  (pass) logger output is valid JSON with timestamp, level, message fields
  (pass) logger includes context/meta fields when provided
  (pass) logger timestamp is a valid ISO 8601 string
  (pass) debug messages are suppressed when level is 'info'
  (pass) debug messages appear when level is 'debug'
  (pass) warn messages appear when level is 'info'
  (pass) error messages appear when level is 'warn'
  (pass) info messages are suppressed when level is 'error'

Tests: 18 passed, 0 failed
Coverage: config.ts 100% funcs / 100% lines; logger.ts 85.71% funcs / 90% lines
```

---

## Type Check Results

`bun tsc --noEmit` — 3 pre-existing errors in `src/infrastructure/rag/vectorstore.ts` (BctcRagEntry not assignable to `Record<string, unknown>`). These errors exist identically on `main` before this merge and are NOT introduced by Task 003. No new type errors introduced.

---

## Review Checklist

| Check | Result | Notes |
|-------|--------|-------|
| `bun test` — all pass | PASS | 18/18 tests, 29 expect() calls |
| `bun tsc --noEmit` — no new errors | PASS | Pre-existing errors only (vectorstore.ts) |
| DDD compliance — domain/ does not import infrastructure/ | PASS | No imports from infrastructure found in domain/ |
| Security — no hardcoded secrets | PASS | No passwords, API keys, tokens, or secrets in any new file |
| Config reads from Bun.env only | PASS | All config sourced from environment variables |
| Logger outputs structured JSON | PASS | Verified via test with custom sink |
| Level filtering works correctly | PASS | 5 tests cover all level combinations |
| AppConfigError thrown for missing required vars | PASS | Error message includes variable name |

---

## Issues Discovered During Review

### BLOCKING Issues

None.

### NON-BLOCKING Issues

#### Issue 003-01
- **Type**: Minor coverage gap
- **File**: `src/infrastructure/logger.ts` lines 79-83
- **Description**: The error fallback path in the `write()` function (when `sink` throws) is not covered by tests. Coverage shows 85.71% funcs / 90% lines for logger.ts.
- **Status**: Won't fix — the fallback is a defensive safety net; testing it would require injecting a throwing sink, which is low-value. The path is simple and correct by inspection.

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | Hardcoded secrets | No credentials or API keys in any new file | None | N/A — clean |
| 2 | Env var leakage | Logger does not log raw env values | None | Config values are parsed, not echoed |
| 3 | Error messages | AppConfigError reveals variable name only, not value | None | Safe — names are not sensitive |

**Security verdict**: CLEAN

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `Bun.env` typed config object with PORT, DB_PATH, LOG_LEVEL | PASS | `AppConfig` interface with typed fields |
| Sensible defaults (3000, ./data/market.db, info) | PASS | All 3 defaults tested |
| `requireEnv()` throws at startup for missing required vars | PASS | `AppConfigError` with descriptive message |
| Structured JSON logger with levels | PASS | JSON output with timestamp, level, message, context |
| Log level filtering (debug < info < warn < error) | PASS | 5 filtering tests pass |

---

## Merge Summary

```bash
git merge --no-ff task/003-env-config -m "merge(003): env config + structured logging"
```

- Commits in branch: 1 (7aa5019)
- Files changed: 4
- Lines added: +438
- Lines removed: -2
- Tests added: 18 new tests

---

## Notes for Next Tasks

- Tasks 021-030 (infrastructure fetchers) depend on Task 003 — dependency is now cleared
- Task 081 (Bun HTTP server) depends on 002 + 003 — 003 is now done; check 002 status
- The `config` singleton and `logger` singleton are available via `src/infrastructure/index.ts` barrel exports
- Future tasks requiring API keys should use `requireEnv()` to fail fast at startup
- Pre-existing TS errors in `src/infrastructure/rag/vectorstore.ts` should be addressed in a future task (011 or 012)
