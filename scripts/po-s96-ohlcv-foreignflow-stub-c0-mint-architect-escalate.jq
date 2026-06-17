# po-s96-ohlcv-foreignflow-stub-c0-mint-architect-escalate.jq
#
# Single-pass dev-team :07 RECURRING-BUG-ESCALATION triage for the live USER bug
# "actual RSI and BB calcul on report is false" (2026-06-17 market open, MARKET msg 783-790).
#
# Root (PO code-traced, building on router RAW-verify): writeForeignFlowToOhlcv
# (apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts L58-69) is the LAST
# daily_ohlcv writer still BYPASSING the writeOhlcvBatch SSOT; at VN market open it INSERTs
# an all-zero stub (O=H=L=C=0, vol=0) ON CONFLICT(code,date) before the real bar arrives, so
# the alert scan jobs (taAlertScanJob/bbAlertScanJob, CANDLE_SQL date>=-60d ORDER BY day ASC)
# read C=0 as today's latest candle -> single-digit RSI universe-wide + "gia 0 duoi BB" spam.
#
# 4th recurrence of a "fixed" P0; owner zone (apps/alert-engine) proven WRONG twice -> per
# feedback_recurring_bug_escalation the durable producer root goes to ARCHITECT, with a coupled
# consumer defense-in-depth FIX to dev-mcp-server.
#
# Mutations (all idempotent, id-guarded):
#   M1: MINT ARCH-OHLCV-WRITER-SSOT-DURABLE   -> ready[] (architect, leads via unshift)
#   M2: MINT FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 -> ready[] (dev-mcp-server, consumer guard)
#   M3: ACK signal_queue row gatherer-doublefire (informational; stays READ, no flip)
# Held rows ASSERTED untouched: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT stays in review[] (gate RED),
# the closed OHLCV-seeder done_verified rows untouched, ARCH-CRON in_progress untouched.
#
# Harness: CONSERVATION (ready += 2 mints; in_progress/review/done/done_verified/backlog
# LENGTHS byte-stable) + PLACEMENT (both mints in ready with status=READY + next_agent) +
# IDEMPOTENCY (re-run mints 0). Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s96-ohlcv-foreignflow-stub-c0-mint-architect-escalate.jq \
#      docs/data/orch/orch-state.json
# atomic temp -> [ -s ] -> jq empty -> conservation -> placement -> rename; commit orch-state
# by EXPLICIT PATH; PUSH HELD (PO out-of-band; origin frozen behind FIX-CI-RED-STANDING).

def has_id($id):
  ([.task_board.ready[]?, .task_board.in_progress[]?, .task_board.review[]?,
    .task_board.done[]?, .task_board.done_verified[]?, .task_board.backlog[]?]
   | map(select(type=="object") | .id) | index($id)) != null;

def arch_task($now): {
  id: "ARCH-OHLCV-WRITER-SSOT-DURABLE",
  type: "FIX",
  title: "ARCH-OHLCV-WRITER-SSOT-DURABLE — route the LAST bypassing daily_ohlcv writer (writeForeignFlowToOhlcv all-zero stub) through writeOhlcvBatch SSOT; close the writer-bypass class so no writer can re-seed a fake C=0/scale-wrong current-day bar at market open (4th recurrence of the single-digit-RSI / gia-0 MARKET-spam class)",
  zone: "apps/mcp-server/",
  owner: "architect",
  status: "READY",
  priority: "P0",
  blocking: true,
  size: "M",
  recon_first: true,
  recurring_bug_escalation: true,
  recurrence_count: 4,
  next_agent: "architect",
  root_cause: "writeForeignFlowToOhlcv (apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts L58-69) BYPASSES the writeOhlcvBatch SSOT and INSERTs a stub row open/high/low/close=0,volume=0 ON CONFLICT(code,date) when the foreign-flow fetch (gated to VN market open 02:00Z, foreignFlowFetcherJob L145) arrives BEFORE the real OHLCV bar. The migrated-writer set (FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0: aggregator/taOhlcvBackfill/pushPrices) MISSED this writer, so writeOhlcvBatch's FR-S1 seed-rejection + scale-norm + C=0-reject never apply to it. The alert scan jobs read that C=0 stub as today's latest candle (CANDLE_SQL date>=-60d ORDER BY day ASC) -> single-digit RSI universe-wide + gia-0-duoi-BB spam (msg 783-790); the real bar UPSERTs over the stub later so canonical reads clean by ~04:30Z (self-healing repair window masks it from steady-state probes).",
  fix_spec: "ARCHITECT DESIGN (recon first — do NOT hand straight to dev). Durable producer-root fix: writeForeignFlowToOhlcv must NEVER write a fake 0-OHLCV bar. Options to rule on: (A) when the (code,date) row is absent, INSERT a row with OHLCV columns NULL (honest gap) + only foreign-flow columns populated — requires daily_ohlcv OHLCV cols to be nullable OR a separate foreign-flow staging path; downstream OHLCV readers/scan jobs already (or must) treat NULL/0 OHLCV as no-bar. (B) route the foreign-flow write through writeOhlcvBatch / a shared single write boundary so FR-S1 + C=0-reject is the ONLY door into daily_ohlcv (single-writer SSOT) — close the bypass class for ALL writers, not just this one. (C) audit the remaining RAW-INSERT bypass writers found (server.ts L1247 secondary push path, ohlcvBackfill.ts, priceBackfillService.ts) and bring every one under the SSOT or prove it cannot write a current-day fake bar. GENERIC across ALL tickers (/goal#2, no per-ticker hardcode); illiquid/no-trade -> honest GAP, never a 0 or scale-wrong seed (/goal#1 no-fake-data). Also address the ÷1000 majors leak (VHM 136 = 136500/1000) — coordinate with backlog FIX-OHLCV-SCALE-X1000-AUTO-REPAIR; the validateOhlcvUnit guard at server.ts L1274 lets a half-scale band slip. Output: architect brief listing each writer + its disposition, then agent-father/dev-mcp-server implements.",
  generic_mandate: "Fix must hold for ALL watchlist tickers AND any future writer into daily_ohlcv (close the class), not patch one writer. No per-ticker logic. Illiquid -> honest NULL gap.",
  verification_gate: "NEXT VN market open 2026-06-18 (briefing 01:00Z + first TA scan 02:15Z, RAW-read get_unreviewed_market_messages): alert-engine TA-Alert RSI matches canonical get_technical_indicators within 0.1pt, NO single-digit RSI, NO RSI=100.0, NO 'gia 0 duoi BB' / scale-wrong band, GENERIC all tickers. PLUS live DB probe at the SAME market-open window (02:00-03:30Z, named-volume daily_ohlcv via keinos/sqlite3): 0 rows with close=0 AND any foreign-flow col populated (no C=0 stub poisoning the latest bar), 0 ÷1000 leaks vs prior real close.",
  recurrence_history: "FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (MIN_CANDLES guard c9892200, review-RED) -> FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 (dv 06-16) -> FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 (dv) -> FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 (dv 06-16); each fixed a DIFFERENT writer but none covered writeForeignFlowToOhlcv. po-s85 data_source_fixed:true claim CONTRADICTED by the 2026-06-17 open.",
  source: "USER BUG report on MARKET channel 2026-06-17T04:2xZ ('actual RSI and BB calcul on report is false'); router RAW-verified first-hand (msg 783-790, 02:15-03:15Z single-digit RSI universe-wide + gia-0-BB; canonical clean by 04:30Z). PO code-traced the exact writer.",
  created_at: $now,
  created_by: "po",
  triaged_by: "po-s96",
  dispatch_note: "dev-team :07 tick 2026-06-17T04:36Z — live USER bug, /goal#1 highest-value (false RSI/BB to the user's MARKET channel every 15min at every market open). Recurring-bug-escalation -> architect for the durable writer-SSOT root. PO-authorized WIP exception: board in_progress=1 but it (ARCH-CRON) is an architect-design/gate-held lane, not an active dev coding lane; this P0 leads."
};

def scan_guard_task($now): {
  id: "FIX-ALERT-SCAN-REJECT-STUB-BAR-P0",
  type: "FIX",
  title: "FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 — taAlertScanJob + bbAlertScanJob must reject a latest daily_ohlcv bar with close<=0 OR volume<=0 (stub/seed) BEFORE computing RSI/BB; guards the VALUE not just the candle count (consumer defense-in-depth for the C=0 foreign-flow stub)",
  zone: "apps/mcp-server/",
  owner: "dev-mcp-server",
  status: "READY",
  priority: "P0",
  blocking: true,
  size: "S",
  next_agent: "dev-mcp-server",
  root_cause: "taAlertScanJob.ts (L182-188) only guards closes.length < MIN_CANDLES(35) — it does NOT inspect the latest close VALUE, so a C=0 foreign-flow stub at the tail of the 60-day window flows into the RSI closes[] and collapses Wilder RSI to single-digit. bbAlertScanJob.ts (L173-182) has a 'not from today -> skip stale' guard but NO close<=0/volume<=0 reject, so close=Math.round(0)=0 -> 'gia 0 duoi BB' breakout spam. This is the EXACT gap the existing FIX-ALERT-ENGINE-RSI-SINGLEDIGIT status_note named: 'guards COUNT not the corrupt latest VALUE'.",
  fix_spec: "In BOTH taAlertScanJob and bbAlertScanJob, after fetching candleRows, fail-closed (skip the ticker, log.info pending, NO alert) when the LATEST in-window bar has close<=0 OR volume<=0 — same fail-closed posture as the report path (FIX-RSI-REPORT-FAILCLOSED, done_verified). Prefer reading volume in CANDLE_SQL (currently SELECTs only date+close) so the guard can see vol=0 stubs. Optionally drop any interior close<=0 bar from the closes[] passed to the Go TA svc (a 0 anywhere in the window corrupts Wilder smoothing), or skip if any in-window close<=0. GENERIC all tickers (/goal#2). This is the consumer half — paired with ARCH-OHLCV-WRITER-SSOT-DURABLE which stops the producer writing the stub; ship BOTH so a future writer regression cannot re-spam MARKET.",
  generic_mandate: "Guard applies to every ticker uniformly, no per-ticker logic; fail-closed (skip) is the correct posture for a thin/illiquid/no-trade ticker — better an honest gap than a fabricated single-digit RSI or gia-0 breakout.",
  verification_gate: "NEXT VN market open 2026-06-18 (first TA scan 02:15Z + briefing 01:00Z, RAW-read get_unreviewed_market_messages): NO single-digit RSI, NO 'gia 0 duoi BB' on MARKET even if a C=0 stub exists transiently in daily_ohlcv; tickers with a stub/zero latest bar are SILENTLY skipped (no alert), not spammed. Unit: a test seeding a C=0 latest bar after N real bars asserts the ticker is skipped (no alert emitted).",
  depends: ["ARCH-OHLCV-WRITER-SSOT-DURABLE"],
  depends_note: "Independent fix (can ship in parallel) but its gate is shared with the producer root; together they form the two-layer durable fix. Defense-in-depth: this guard alone stops the SPAM even if a producer regression re-seeds a stub.",
  source: "USER BUG report MARKET 2026-06-17; PO code-traced the missing latest-value guard in both scan jobs.",
  created_at: $now,
  created_by: "po",
  triaged_by: "po-s96",
  rebuild_required: "mcp-server",
  dispatch_note: "dev-team :07 tick 2026-06-17T04:36Z — consumer defense-in-depth, paired with the architect producer root; runtime scheduler change -> mcp-server rebuild required."
};

# --- M1+M2: id-guarded mints, unshift so the P0s lead ready[] ---
(if has_id("ARCH-OHLCV-WRITER-SSOT-DURABLE") then .
 else .task_board.ready = ([arch_task($now)] + .task_board.ready) end)
| (if has_id("FIX-ALERT-SCAN-REJECT-STUB-BAR-P0") then .
 else .task_board.ready = ([scan_guard_task($now)] + .task_board.ready) end)
# --- metadata bump ---
| ._updated_at = $now
| ._updated_by = "po-s96"
