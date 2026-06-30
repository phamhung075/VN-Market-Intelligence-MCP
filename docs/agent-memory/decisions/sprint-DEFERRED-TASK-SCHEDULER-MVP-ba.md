# Decision Journal — Sprint DEFERRED-TASK-SCHEDULER-MVP · ba

**Sprint goal:** at(1) one-shot deferred-task scheduler (verify-loop MVP) — requirement spec from architect brief 2026-06-29.
**Agent:** ba
**Started:** 2026-06-29T21:00:00Z

---

### STEP ba-S1 · ba · 2026-06-29T21:00:00Z
**task-id:** BA-DEFERRED-SCHEDULER
**what-done:** Authored full requirement spec (docs/handoffs/BA-DEFERRED-SCHEDULER.md) mapping 8 STs to DDD layers, tracing all 12 ACs to blocking gates, and outlining 3 end-to-end acceptance-test scenarios (G1/G2/G3) from the locked architect brief.
**what-considered:**
- Design is fully locked (user + architect); BA scope = faithful transposition to implementable FRs, not re-design.
- `claim_due_scheduled_tasks` exposure: brief says "NOT an MCP tool" yet Step 0b.3 pseudocode calls it via `call_tool`. Flagged as Q2 implicit (non-blocking): must be reachable by cowork-team but excluded from public agent packages. Implementation detail for dev-mcp-server.
- `done` vs `fired` terminal ambiguity: both exist in the CHECK enum; sweeper sets `fired`. Q1 flagged as non-blocking: MVP treats `fired` as terminal; `done` reserved Phase-2.
**why-decision:** No PO blockers found. Spec maps architect brief §c–h verbatim onto FR/NFR/AT layers; open Q1–Q3 are advisory implementation-detail notes for dev-mcp-server, not unresolved design decisions.
**why-change:** No change from plan — design SSOT is the locked brief; spec faithfully transposes it without deviation.

### STEP ba-S2 · ba · 2026-06-30T01:50:00Z
**task-id:** BA-IND-P1-MOMENTUM-RS
**what-done:** Authored full 4-tool requirement spec (docs/handoffs/BA-IND-P1-MOMENTUM-RS.md) covering IND-P1-ROC-MOMENTUM, IND-P1-RELATIVE-STRENGTH, IND-P1-52W-HIGH-PROXIMITY, IND-P1-FOREIGN-ACCUM-RANK; zone-split 3x apps/technical-analysis + 1x apps/stock-price; 5 ARCH-RATIFY items; 0 PO blockers.
**what-considered:**
- Zone assignment: all 4 tools initially look like TA zone. Foreign-Accum-Rank reads `vnstock_trading_stats` + `foreign_room_events` — both owned by stock-price service. CHOSEN: mandatory zone split 3+1 per data ownership.
- VN-Index source for cross-sectional RS: runtime fetch vs `daily_ohlcv` row. CHOSEN: `daily_ohlcv` only — avoids cross-service call, consistent with no-fake-data (backfill already verified LIVE). Architect confirms ticker_id via ARCH-RATIFY-RS-1.
- `room_exhaustion` absent → false vs null. CHOSEN: null + null_reason — absence is NOT proof of no exhaustion; honest-null contract overrides defaulting.
- Factor-return series persistence: new table vs compute-on-read. CHOSEN: compute-on-read for P1 (recommended to architect via ARCH-RATIFY-ROC-1), avoids schema churn.
**why-decision:** Zone split is mandatory (data ownership); honest-null with explicit null_reason for all absence cases is the P0 contract extended consistently; no PO-level unknowns remain.
**why-change:** No change from roadmap §P1 scope — spec faithfully transposes 4 backlog placeholders into implementable FRs without adding scope.
