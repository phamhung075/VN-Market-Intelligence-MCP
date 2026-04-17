# Task Report: 1342+1343 — fix(ta-fallback): defaultComputeTa fallback to market_prices_history when daily_ohlcv < 15 rows
date: 2026-04-16
outcome: APPROVED

## Summary

| Item | Result |
|------|--------|
| Branch | `task/1342-1343-ta-fallback` |
| Commits on branch | 1 (`a475277`) |
| Sprint | 114 |
| Tasks | 1342 (TDD test) + 1343 (fix) |

## Test Results

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| `1342-ta-fallback-intraday.test.ts` | 4 | 0 | All TCs green |
| Full regression (`bun test`) | 4918 | 1 | `296-ocr-pipeline-e2e` — pre-existing on `main`, not introduced by this branch |
| TypeScript (`bun tsc --noEmit`) | — | 0 errors | Clean |

## QA Checklist

| Check | Result |
|-------|--------|
| Test file line 1 `process.env["DB_PATH"] = ":memory:"` | PASS |
| TC-2 documented RED before fix | PASS (test header line 10) |
| TC-4 documented RED before fix | PASS (test header line 14) |
| `defaultComputeTa` uses `let rows` | PASS (line 505) |
| Fallback block checks `rows.length < 15` | PASS (line 513) |
| Fallback query uses `MAX(price) GROUP BY DATE(fetched_at)` on `market_prices_history` | PASS (lines 516–519) |
| `defaultComputeTa` signature unchanged | PASS |
| `TaSignal` interface unchanged | PASS |
| DDD: no domain imports infrastructure | PASS (grep clean) |
| Security: no `process.env` in src (excluding tests) | PASS |

## Issues Found

### Blocking
None.

### Non-Blocking
- `296-ocr-pipeline-e2e` remains 1 fail — pre-existing, tracked separately (task 1338 added 30s timeout cap but underlying OCR network dependency still flaky in CI).

## Merge Status

Merged `task/1342-1343-ta-fallback` → `main` via `--no-ff`.
Branch deleted local + remote.
Server restarted: `launchctl kickstart -k gui/.../com.vn-market.mcp` — health OK (uptime ~8s, toolCount 98).
TASKS.md: 1342+1343 → Done, Sprint 114 → Complete.
`docs/data/project-stats.json`: totalTasksDone 296 → 298, previousSprint → 114 COMPLETE.
