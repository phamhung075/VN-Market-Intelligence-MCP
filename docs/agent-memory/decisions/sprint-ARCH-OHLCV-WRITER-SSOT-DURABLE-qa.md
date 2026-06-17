---
agent: qa
cycle: 2026-06-17
task-id: ARCH-OHLCV-WRITER-SSOT-DURABLE (P0-A) + FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 (P0-B)
verdict: APPROVE (both)
---

## Decision Journal — ARCH-OHLCV-WRITER-SSOT-DURABLE (P0-A) + FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 (P0-B)

### What was considered

**P0-A: ARCH-OHLCV-WRITER-SSOT-DURABLE (SUBTASK-1/2/3)**

- tsc: clean (exit 0) — QA first-hand run.
- Full suite: 13181 pass / 52 fail / 42 skip / 3 errors — QA first-hand, 13275 tests across 1107 files.
- P0-A touched files isolated: 17 pass / 0 fail (3 files: 2026-ohlcv-foreign-flow-merge.test.ts + DPI-4-foreign-flow-upsert.test.ts + 1503-ohlcv-foreign-flow.test.ts).
- All 52 full-suite failures classified DISJOINT: none overlap ohlcvForeignFlowStore.ts / ohlcvWriteService.ts / any P0-A test file. Last-commit on every failing test file predates P0-A commits (41b4344c, e5461ad7, e96571ac) by multiple sprints.
- T-4 REGRESSION PROOF verified in source: test queries SELECT close FROM daily_ohlcv WHERE code='REGRESSION-TEST' AND date='2026-06-18' via .all(); asserts rows.length===0 (zero rows, not close=0 stub) + belt-and-suspenders rows.some(r=>r.close===0)===false. Exact mandate criterion met.
- Mock-guard: PASS (exit 0).
- DDD: ohlcvForeignFlowStore.ts is infrastructure/db — correct layer, imports only domain/models/shared-types and bun:sqlite. ohlcvWriteService.ts is application/usecases — correct layer, annotation is comment-only (no runtime change).
- Security: process.env["NODE_ENV"] in logger shim is test-noise suppression, not a secret read. Pre-existing pattern in codebase (server.ts, spawners). Non-blocking.
- Writer inventory table verified: 7 writers (A,C,D,E,F,G,H) with correct statuses, sentinel pattern documented, ESLint follow-on noted.

**P0-B: FIX-ALERT-SCAN-REJECT-STUB-BAR-P0**

- P0-B touched files isolated: 52 pass / 0 fail (6 files).
- taAlertScanJob.ts: stub-bar guard at lines 196-209 checks latestCandle.close_price <= 0 || latestCandle.volume <= 0 BEFORE computeFn call — fail-closed, no alert emitted.
- bbAlertScanJob.ts: stub-bar guard at lines 195-198 checks lastCandle.close_price <= 0 || lastCandle.volume <= 0 BEFORE BB compute — fail-closed, no "giá 0" alert.
- CANDLE_SQL updated in both to SELECT volume (previously only date+close) so guard can see vol=0.
- SB-1..SB-5 tests in 1307 and 1309 test files: cover close=0/vol=0, close=0/vol>0, close>0/vol=0, valid bar still fires, multi-ticker stub+valid isolation. Non-trivial behavioral assertions.
- DDD: scheduler layer importing infrastructure/ is explicitly permitted (annotated in both files).
- Security: no process.env for secrets, no hardcoded credentials.
- Mock-guard: PASS (covered by the same run above — no fabricated-data patterns).
- 52 full-suite failures are the same pre-existing set; P0-B files (d79314bb) not in any failing test's last-commit ancestry.

### Why APPROVE (not CHANGES_REQUESTED)

- All checks green on touched files.
- 52 full-suite failures are 100% disjoint from both change sets (confirmed via git log --oneline -1 on each failing file).
- T-4 asserts SELECT returns 0 rows — the exact regression-proof criterion required by the mandate.
- DDD, security, mock-guard all PASS.
- No new architecture concern (writer-layer fix + scanner guard, same zone, no new MCP tool, no cross-service HTTP).

### Why done_verified is NOT cleared

Both P0-A and P0-B require a clean VN market open (2026-06-18 ~02:15Z) as their shared behavioral gate:
- P0-A: live daily_ohlcv shows zero close=0 rows at the leading edge of the scan window
- P0-B: zero single-digit RSI alerts, zero "giá 0 dưới BB" alerts on MARKET channel
REBUILD_REQUIRED: YES — mcp-server image must be rebuilt by ops before the 02:15Z gate.
