---
sprint: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
task_id: CONTAM-10-EXEC-2
branch: task/CONTAM-10-EXEC-2
size: S
zone: scripts/migrations/ + ops-gated rebuild
depends_on: [CONTAM-10-WRITER-H]
blocks: []
sequential: true
---

## TLDR

Re-execute `repair-ohlcv-unit-contamination-wholerow-lt1000.ts` against live database to repair the growing contaminated set (6,533 rows/27 tickers as of 2026-07-07, up from original alert's 10 rows). **CRITICAL ORDERING:** This task MUST run AFTER CONTAM-10-WRITER-H lands AND is deployed (ops rebuild). Running the repair before the writer leak closes just gets re-contaminated by the next ~15–30 min VPS backfill poll cycle.

## [PM] Planning Context

- **Zone:** Live database mutation + ops rebuild gate
- **Sequential gate:** CONTAM-10-WRITER-H must be DONE_VERIFIED + deployed before this task starts
- **Rationale:** The backfill queue poller (handlePushOhlcvHistory route, ~15–30 min cadence) is the active leak. Repair without fixing the leak = repair runs, contamination returns within 15–30 min.
- **Acceptance Criteria:**
  - [ ] CONTAM-10-WRITER-H committed, QA-passed, ops rebuild completed
  - [ ] Fresh dry-run against live named volume shows current contamination extent (6,533 rows/27 tickers baseline)
  - [ ] Dry-run report reviewed + approved (human gate: repair candidate list)
  - [ ] Live repair execution (`--live` flag): `repair-ohlcv-unit-contamination-wholerow-lt1000.ts --live`
  - [ ] Post-repair verification (same script, dry-run mode): candidate count drops to 0 or ≤10 residual rows (all corrected)
  - [ ] Gateway probe: POST /api/push-ohlcv-history with a test backfill batch → verify `writeOhlcvBatch` routing active and scale-guard fires (no new contamination on write)
  - [ ] Market surface check: verify `get_price_history` / stock price dashboard (apps/frontend) reflects corrected OHLCV values for VHM, VIC, FPT, etc.

- **Files to read first:**
  - `scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts` (CLI + dry-run/live modes)
  - `docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md` (full context)
  - `docs/architecture-briefs/2026-06-30-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000.md` (repair design)

- **Files to modify:** None (repair script already exists, just re-execute)

- **Files to create:** None

- **Dependencies:** CONTAM-10-WRITER-H (hard gate: must be deployed first)

- **Knowledge needed:**
  - Live database access + container exec pattern
  - Dry-run output interpretation (candidate count, per-ticker summary)
  - Gateway probe POST pattern

## Execution Flow

1. **Wait gate:** CONTAM-10-WRITER-H DONE_VERIFIED + ops rebuild complete
2. **Fresh dry-run:** 
   ```bash
   docker exec vn-market-intelligence-mcp-mcp-server-1 \
     bun run /app/scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts --dry-run
   ```
   Expected: ~6,533 candidate rows (may have grown since 2026-07-07 if backfill continued)
3. **Human review gate:** Developer + QA review the dry-run report (per-ticker summary + full SQL output if needed)
4. **Live repair:**
   ```bash
   docker exec vn-market-intelligence-mcp-mcp-server-1 \
     bun run /app/scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts --live
   ```
5. **Post-repair dry-run:** Re-run dry-run to confirm candidates gone
6. **Gateway probe:** POST /api/push-ohlcv-history with test batch (or use existing backfill queue poller to verify writeOhlcvBatch is active)
7. **Market surface check:** Frontend stock-price / dashboard reflects corrected OHLCV for watchlist stocks

## Notes

**Why sequential, not parallel?**
- WRITER-H is the producer/leak fix; EXEC-2 is the one-time cleanup
- Running repair while the leak is active = wasted work (re-contamination within 15–30 min)
- After WRITER-H ships, no new contamination → repair becomes permanent + cumulative

**Accepted gap:** This is a one-time live repair. Future contamination prevention depends entirely on WRITER-H staying deployed (monitoring: if fresh contamination is detected post-repair, escalate to dev-mcp-server to investigate Writer H deployment status or new bypass routes).

---

## Success Criteria

- [ ] Dry-run candidate count matches pre-execution baseline (or shows growth if backfill continued)
- [ ] Live repair executes without errors
- [ ] Post-repair dry-run shows ≤10 residual rows (ideally 0)
- [ ] Gateway probe shows writeOhlcvBatch routing active (scale guard fires on contaminated input)
- [ ] Market surface (frontend stock prices, dashboards) reflects corrected OHLCV
- [ ] Commit message or notebook entry references this task and links to CONTAM-10-WRITER-H deployment date
