# Task Report — Task 137: Fix Step E — Read Alerts from DB and Send to Telegram

> **Branch**: `task/137-fix-step-e-alerts`
> **Date merged**: 2026-04-01
> **Final status**: APPROVED
> **DDD layer**: infrastructure (alertStore.ts), interface/scheduler (intelligenceCycleJob.ts)

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Todo → In Progress | 2026-03-29 | Sprint 010 |
| In Progress → Review | 2026-03-30 | Developer submitted, 18 tests |
| Review → Done | 2026-04-01 | QA approved |

---

## Role Activity Log

### Developer
- Files modified:
  - `src/infrastructure/db/alertStore.ts` — added `readUnnotifiedAlerts()` and `markAlertNotified()`
  - `src/scheduler/intelligenceCycleJob.ts` — wired Step E with `readUnnotifiedAlertsFn` + `markAlertNotifiedFn` injectable deps, added `CycleDeps` extensions
  - `src/infrastructure/db/schema.ts` — added `notified_telegram` column migration
- TDD cycle followed: YES
- Tests written: `src/__tests__/137-fix-alert-pipeline.test.ts` — 18 tests

### QA — Review 1
- Date: 2026-04-01
- Outcome: APPROVED
- `bun test src/__tests__/137-fix-alert-pipeline.test.ts`: PASS (18 passed, 0 failed)
- `bun tsc --noEmit`: PASS (0 errors)
- Issues found: none blocking

---

## Test Results

```
bun test src/__tests__/137-fix-alert-pipeline.test.ts

  Task 137 — schema migration: notified_telegram column (2 tests)
  Task 137 — readUnnotifiedAlerts() (7 tests)
  Task 137 — markAlertNotified() (3 tests)
  Task 137 — Step E: alerts flow through to sendAlertsFn (6 tests)

  18 pass
  0 fail
```

**Coverage notes**: The test file directly exercises the full Step E pipeline via dependency injection. Key scenarios covered: successful send + mark, failed send without mark, idempotency across two cycles, out-of-window exclusion, severity filtering (info/warning excluded), and off-hours skip.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

### NON-BLOCKING Issues

- `intelligenceCycleJob.ts` line coverage is 56% due to many fallback production paths (network calls to Yahoo/SBV) being untested. This is by design — the module uses dependency injection specifically to allow testing the core logic without network calls. The Step E specific paths are 100% exercised.

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL Parameterized | All queries in alertStore.ts use `?` placeholders | None | Verified: no string concatenation in SQL |
| 2 | No process.env | Uses `Bun.env` exclusively (verified via grep) | None | N/A |
| 3 | Idempotent mark | markAlertNotified() is idempotent — safe to call twice | None | N/A |

**Security verdict**: CLEAN

---

## DDD Compliance

- `alertStore.ts` is in infrastructure layer — correct
- `intelligenceCycleJob.ts` is in scheduler/interface layer — imports alertStore via dynamic import — correct
- Step E imports `alertCooldown.ts` from domain layer — correct direction (interface → domain is allowed)
- No domain files import from infrastructure

**DDD verdict**: PASS

---

## Schema Migration

The `notified_telegram INTEGER NOT NULL DEFAULT 0` column is added to the `alerts` table via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `schema.ts`. The migration is safe to run on existing databases.

Index added: `idx_alerts_notified ON alerts(notified_telegram, severity)` — composite index for efficient Step E queries.

---

## Step E Behaviour Summary

| Scenario | Behaviour |
|----------|-----------|
| HIGH/CRITICAL alert, not notified, within 16 min | Read, sent to Telegram, marked notified |
| Already notified (notified_telegram=1) | Excluded from read query |
| Outside 16-min window | Excluded from read query |
| INFO/WARNING severity | Excluded from read query |
| sendAlertsFn returns 0 (Telegram failed) | NOT marked notified — will retry next cycle |
| Cooldown suppressed | Marked notified without sending (no re-send) |
| Off-market hours | Step E skipped entirely |

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| DB alerts passed to sendAlertsFn (AC-1) | PASS | |
| notified_telegram = 1 after successful send | PASS | |
| Second cycle sees 0 alerts after first (idempotency) | PASS | |
| No mark when sendAlertsFn returns 0 (AC-2) | PASS | |
| telegramAlertsSent = 0 when no alerts | PASS | |
| Step E skipped outside market hours | PASS | |
| Schema migration idempotent (initDatabase twice) | PASS | |

---

## Merge Summary

- Implementation was on main at review time (branch already integrated)
- Files modified: alertStore.ts, intelligenceCycleJob.ts, schema.ts
- Tests added: 18
- Type errors at merge: 0
