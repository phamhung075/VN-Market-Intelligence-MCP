# Task Report: 1383 — TDD RED Tests for france-msg-quality
date: 2026-04-17
outcome: APPROVED

## Test Results

| Suite | Pass | Fail | Skip |
|-------|------|------|------|
| 1383 unit tests | 1 | 7 | 0 |
| TypeScript (tsc --noEmit) | 0 errors | — | — |

RED phase verified: 7/8 tests fail as required. T6 (callable/return-type guard) passes by design — function exists in source.

## Coverage of Acceptance Criteria

| Criterion | Test | Status |
|-----------|------|--------|
| movers=0 alerts=2 ta=0 → alerts present, no filler | T1 | RED |
| movers=3 alerts=0 ta=0 → movers present, no filler | T2 | RED |
| movers=0 alerts=0 ta=2 → TA section present, no filler | T3 | RED |
| movers=2 alerts=1 ta=1 → all 3 sections present | T4 | RED |
| Vietnamese diacritics: headers + signal + severity labels | T5 | RED |
| `formatFranceSummaryVI` callable, returns string | T6 | PASS (correct) |
| all-empty → title present, zero "Khong co" | T7 | RED |
| old unaccented ASCII strings absent from output | T8 | RED |

## Source State Confirmed Unmodified

`src/scheduler/franceSummaryJob.ts` still contains:
- Filler strings: `"Khong co du lieu gia."`, `"Khong co canh bao."`, `"Khong co tin hieu ky thuat"`
- Unaccented headers: `"Ban tin sang Phap"`, `"Top bien dong gia"`, `"Canh bao gan nhat"`, `"Tin hieu ky thuat"`
- Unaccented labels: `"qua mua"`, `"qua ban"`, `"gia tren MA20"`, `"gia duoi MA20"`, `"NGHIEM TRONG"`, `"CANH BAO"`, `"THONG TIN"`

Confirmed via grep — source is RED-phase correct.

## DDD Compliance: PASS

Test file imports only from `scheduler/` layer — no cross-layer violations.

## Security: PASS (non-blocking note)

`process.env["DB_PATH"] = ":memory:"` on line 1 — established test-suite convention used in 8+ other test files. Not a production path. Non-blocking.

## Issues Found

### Blocking
none

### Non-Blocking
- `src/__tests__/1383-france-summary-message-quality.test.ts:1` — `process.env` used instead of `Bun.env`. Matches existing test convention throughout repo. No action required for RED phase; 1384 fix does not touch test file.

## Merge Status

Branch `task/1383-france-msg-quality-tdd` approved for merge to `main`.
RED phase complete. Task 1384 (GREEN fix) may branch from this point.
