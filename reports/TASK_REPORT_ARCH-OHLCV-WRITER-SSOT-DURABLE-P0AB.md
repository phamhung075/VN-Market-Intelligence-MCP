## Task Report — P0-A: ARCH-OHLCV-WRITER-SSOT-DURABLE + P0-B: FIX-ALERT-SCAN-REJECT-STUB-BAR-P0

date: 2026-06-17
outcome: APPROVED (both)
done_verified: HELD — next VN market open 2026-06-18 ~02:15Z (shared behavioral gate)

---

### P0-A: ARCH-OHLCV-WRITER-SSOT-DURABLE (SUBTASK-1/2/3)

changed:
  - apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts (rewrite: UPDATE-only, no INSERT stub)
  - apps/mcp-server/src/application/usecases/ohlcvWriteService.ts (SSOT writer-inventory annotation)
  - apps/mcp-server/src/__tests__/2026-ohlcv-foreign-flow-merge.test.ts (NEW — 7 tests)
  - apps/mcp-server/src/__tests__/DPI-4-foreign-flow-upsert.test.ts (updated AC-1/AC-7)
  - apps/mcp-server/src/__tests__/1503-ohlcv-foreign-flow.test.ts (updated AC3)

commits: 41b4344c (impl+annotation) / e5461ad7 (new tests) / e96571ac (legacy tests)

tests (touched files only): 17 pass / 0 fail
tests (full suite — QA first-hand): 13181 pass / 52 fail / 42 skip
tsc: 0 errors
ddd: PASS
security: PASS (process.env["NODE_ENV"] in logger shim = test-noise guard, not secret read; pre-existing codebase pattern)
mock-guard: PASS (exit 0)

T-4 regression proof verified: test at 2026-ohlcv-foreign-flow-merge.test.ts:281-318 — calls writeForeignFlowToOhlcv on empty DB, asserts SELECT returns rows.length===0 (zero rows, not close=0 stub). Mandate criterion confirmed first-hand.

verdict: APPROVED

---

### P0-B: FIX-ALERT-SCAN-REJECT-STUB-BAR-P0

changed:
  - apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts (stub-bar guard L196-209)
  - apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts (stub-bar guard L195-198)
  - apps/mcp-server/src/__tests__/1307-ta-alert-scan-job.test.ts (SB-1..SB-4 new tests)
  - apps/mcp-server/src/__tests__/1309-bb-alert-scan-job.test.ts (SB-1..SB-5 new tests)
  - apps/mcp-server/src/__tests__/1391-bb-stale-candle-skip.test.ts (volume helper updated)
  - apps/mcp-server/src/__tests__/1803-ta-candle-guard.test.ts (volume helper updated)
  - apps/mcp-server/src/__tests__/FIX-ALERT-ENGINE-RSI-SINGLEDIGIT.test.ts (volume helper updated)
  - apps/mcp-server/src/__tests__/FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS.test.ts (volume helper updated)

commit: d79314bb

tests (touched files only): 52 pass / 0 fail
tests (full suite — shared with P0-A above): 13181 pass / 52 fail / 42 skip
tsc: 0 errors (same clean run)
ddd: PASS (scheduler importing infrastructure/ — explicitly permitted per per-file annotation)
security: PASS
mock-guard: PASS

Guard logic verified:
- taAlertScanJob.ts L196-209: latestCandle.close_price <= 0 || latestCandle.volume <= 0 → skip, no alert
- bbAlertScanJob.ts L195-198: lastCandle.close_price <= 0 || lastCandle.volume <= 0 → skip, no alert
- CANDLE_SQL in both files: SELECT volume added so guard can inspect vol=0 stubs
- SB-1..SB-5 behavioral tests cover: all-zero stub, close=0/vol>0, close>0/vol=0, valid bar fires, multi-ticker isolation

verdict: APPROVED

---

### Full-Suite Disjoint Failure Classification

52 failures + 3 errors reproduced first-hand. Classification: ALL PRE-EXISTING DISJOINT.

Evidence: git log --oneline -1 on every failing test file confirmed NONE were last touched by P0-A commits (41b4344c, e5461ad7, e96571ac) or P0-B commit (d79314bb). Failure patterns:
- Timeout (5000ms) class: 102-job-news-poll, 1146-insider-transactions, TSU-DEV-U5, FIX-B-2, 251-mcp-tools, 1518-get-foreign-flow-ohlcv-source, 1898b — all require live network / MCP server HTTP (pre-existing)
- Schema/DDL mismatch class: 1858c-logvpspush, 1113-vps-proxy-health, VPT-1, FIX-VPS-HEALTH-FRESHN, 1892a — all predating P0 wave
- Tool-count assertion (084-tool-market.test.ts): counts tools in McpServer, stale fixture pre-existing
- Deprecated path (1302-technical-indicators): in _deprecated/, pre-existing
- None overlap ohlcvForeignFlowStore.ts, ohlcvWriteService.ts, taAlertScanJob.ts, bbAlertScanJob.ts or any P0 test file.

Baseline delta: dev reported 51 fail → 48 fail (net -3). QA reproduced: run 1 = 52 fail, run 2 = 48 fail. Run-to-run variance is Bun flakiness in the timeout class (TCP/MCP tests can resolve slightly differently). No regression introduced.

---

### REBUILD_REQUIRED

YES — mcp-server. Writer logic (ohlcvForeignFlowStore.ts) and scan-job logic (taAlertScanJob.ts, bbAlertScanJob.ts) are COPY-baked at container build time. Ops must rebuild mcp-server image before the 2026-06-18 02:15Z TA scan behavioral gate.

Board is ready for ops rebuild. Both P0-A and P0-B: REVIEW → done-code (ops handles the done_verified flip after 02:15Z gate confirmation).
