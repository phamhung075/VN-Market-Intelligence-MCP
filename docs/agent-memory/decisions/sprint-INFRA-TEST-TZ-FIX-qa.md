<!-- decision-journal: qa | task-id: INFRA-TEST-TZ-FIX | 2026-06-13 -->
# Decision Journal — INFRA-TEST-TZ-FIX

**task-id:** INFRA-TEST-TZ-FIX
**agent:** qa
**date:** 2026-06-13
**cycle:** 252

## Entry: qa-S1 — Verdict: APPROVED

**what-considered:**
- AC4 (scope): `git show --name-only 02bed9fa` → single file only: `apps/alert-engine/pkg/infrastructure/sqlite_test.go`. No prod code, no Dockerfile, no go.mod, no go.sum.
- AC3 (determinism): `go test -count=1 ./pkg/infrastructure/...` run under 3 host TZs — UTC, Pacific/Kiritimati (+14), America/New_York (-4). All 17 tests PASS each run. No "(cached)" lines in any output.
- AC2 (fix quality): Both anchored sites use injected/derived reference instant from `time.Now()` captured once per test, then `time.Date(..., 12, 0, 0, 0, location)` to construct a noon anchor, plus `AddDate(0,0,-1)` / `AddDate(0,0,-91)` for calendar-day steps. No hardcoded dates, no widened offsets, no t.Skip.
- AC1 (completeness): All remaining `time.Now()` sites audited — none touch a calendar-day bucket boundary. ±1h future/past mute fixtures are relative-ordering checks (future > now, past < now at the exact same instant). GetRecentAlerts ±5m/60m are intra-`now` relative offsets against a 30-minute window. Insert-at-now fixtures (StoreAlert, WriteAlertOutcome, ReturnsRequiredFields, RespectsLimit, NullOutcomeOnly) make no date-boundary assertion.

**why-change:** No change from plan — all checks green.
**verdict:** APPROVED
