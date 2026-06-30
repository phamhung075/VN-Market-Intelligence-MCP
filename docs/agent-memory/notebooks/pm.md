# PM — Notebook

## Archive (pre-2026-06-28)

[21 cycles archived: 2026-06-27 — 2026-06-23. Recent cycles retained above for active context.]

**Key PM decisions:**
1. Accepted architect atomization as-written (no renegotiation; CONF-1..CONF-4 all ratified)
2. Blocked TASK-CONF-2 explicitly to enforce sequential deployment (frontend AC requires backend DB state)
3. Set done_verified gates on LIVE probe, not build-green (self-confirming test failure mode lesson applies)
4. Left legacy 3316 confidence=50 rows untouched (FR-5: no backfill, honest honesty posture)

**DISPATCH WAVE SEQUENCING:**
- **NOW (WIP available):** TASK-CONF-1 → dev-mcp-server (1/2 WIP)
- **After TASK-CONF-1 done_verified + rebuild:** TASK-CONF-2 → dev-frontend (2/2 WIP)
- **Both done_verified:** Parent task marked COMPLETE; sprint S2-DATA-HONESTY ready for next phase (if any)

---

## c319 EVENING_SUMMARY QUALITY 5-TASK SPRINT SEQUENCING · 2026-06-21T000000Z

**PARENT:** Architect brief + PO triage: FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE + 4 quality fixes from 2026-06-19 evening cycle review

**INPUT:** 5 raw_verified:true tasks from orch-state backlog (TASK-RSIFIX-1/2, FIX-MACRO-FX-SIGMA, FIX-DIGEST-FOREIGN-FLOW, FIX-DIGEST-BB-ALERT), architect brief docs/architecture-briefs/2026-06-21-digest-rsi-dual-engine-diverge.md, PM init

**OUTPUT:** 5 handoff files + orch-state.json board update (backlog → ready, wave/blocking metadata). Developers ready to dispatch Wave 1.

**Handoffs created:**
1. docs/handoffs/TASK-RSIFIX-1-ta-engine-contract.md (dev-technical-analysis, no rebuild)
2. docs/handoffs/TASK-RSIFIX-2-digest-go-engine-rewire.md (dev-mcp-server, rebuild, blocked_by RSIFIX-1)
3. docs/handoffs/FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME.md (dev-macro-indicators, rebuild)
4. docs/handoffs/FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.md (dev-mcp-server, rebuild, file conflict with RSIFIX-2)
5. docs/handoffs/FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR.md (dev-technical-analysis, rebuild, file conflict with RSIFIX-1)

**Board mutation (atomic):**
- **Before:** ready=N, backlog includes TASK-RSIFIX-1/2 + 3 FIX tasks (all TODO)
- **After:** ready=N+5, backlog -= 5 tasks. All moved tasks status=TODO, with wave/blocked_by/blocks metadata

**DISPATCH WAVE SEQUENCING (WIP=2 max concurrent coding):**

**Wave 1 (READY NOW, parallel, independent zones + files):**
- **dev-technical-analysis:** TASK-RSIFIX-1 (docs only, ~1h, unblocks RSIFIX-2)
- **dev-macro-indicators:** FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME (code fix, ~1.5h, independent)

**Wave 2 (after Wave 1 done_verified; WIP=2):**
- **dev-mcp-server:** TASK-RSIFIX-2 (code fix, ~3h, blocked_by TASK-RSIFIX-1, rebuild)
- **dev-mcp-server:** FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN (code fix, ~1h, rebuild)
- **Conflict:** both edit assembleEveningSummary.ts + eveningSummaryJob.ts → SERIALIZE. Dispatch RSIFIX-2 first, then FOREIGN-FLOW.

**Wave 3 (after Wave 2 WIP clears; P3):**
- **dev-technical-analysis:** FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR (code fix, ~1h, rebuild)

**Verification gates (live evening-cycle before done_verified):**
- **RSIFIX-1:** Contract doc exists + verified against Go source (rsi.go)
- **RSIFIX-2:** RSI agreement ≤0.1 between Go + TS digest for ≥3 tickers; <35-candle → null; no synthetic fallback
- **FX-SIGMA:** 0.25% USD/VND move → INFO/WARN not CRITICAL; 0.6% move → CRITICAL/HIGH
- **FOREIGN-FLOW:** No 0.000k padding lines in digest; only nonzero movers rendered
- **BB-ALERT:** Sub-100K-volume tickers emit no BB alert; liquid tickers still do

**Key PM decisions:**
1. Moved RSIFIX-1 as doc-first task to unblock architecture
2. Serialized RSIFIX-2 + FOREIGN-FLOW due to assembleEveningSummary.ts overlap
3. Queued P3 BB-ALERT for Wave 3 (lower urgency)
4. Set blocking_by/blocks metadata explicitly
5. Wave 1 sized for immediate parallel start

**Follow-ons (queued backlog):**
- CLEAN: remove unused computeRSILocal (after RSIFIX-2 done_verified)
- OBSERVABILITY: add RSI divergence detector to system-auditor
- BACKLOG: FIX-FOREIGN-FLOW-COVERAGE (source data gaps, lower priority)

---

## Archive

Cycles c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived. See git history commits 675891163d...5d121989 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).

## c327 P1 MOMENTUM & RELATIVE-STRENGTH DECOMPOSITION · 2026-06-30T030000Z

**PARENT:** BA-IND-P1-MOMENTUM-RS (architect blueprint complete, ready for PM decomposition). Architect identified 2 zones + 1 MCP layer, 5 ARCH-RATIFY items (all resolved via code probe).

**CRITICAL CORRECTIONS CARRIED VERBATIM** (architect caught as BA errors; dev must NOT miss):
1. **RISK-1 [HIGH]:** Foreign flow data source is **`daily_ohlcv`** (foreign_buy_vol, foreign_sell_vol, foreign_net_vol), NOT `vnstock_trading_stats` (has no per-day buy/sell). ADTV unit = shares; response MUST include `adtv_unit: "shares"`.
2. **RISK-2 [HIGH]:** `foreign_room_events.event_type` enum = ('ROOM_FULL', 'ROOM_REOPEN'), NOT ROOM_LOCKED/FULL_ROOM_SELL. `room_exhaustion = true` iff latest event = ROOM_FULL (no subsequent ROOM_REOPEN); no event row → `room_exhaustion: null` + `null_reason: "room_event_not_found"` (NEVER false — that is fabrication).
3. **RISK-3 [HIGH]:** `apps/technical-analysis/src/` (TypeScript) is DEAD CODE; Dockerfile builds ONLY from `pkg/` + `cmd/`. Dev MUST work exclusively in Go under `pkg/`/`cmd/`.

**OUTPUT:** 3 comprehensive handoff files + board decomposition + 2 commits:
1. **IND-P1-TECHNICAL-ANALYSIS-SUITE.md** (dev-technical-analysis): Bundled 3 tools (ROC/RS/52W) in one zone task; domain/application/infra/interface architecture; honest-null discipline; feed-forward scalars (momentum_factor_z, market_rs_composite, net_new_highs); test strategy; 15 files touched (11 new + 2 modified).
2. **IND-P1-FOREIGN-ACCUM-SUITE.md** (dev-stock-price): 1 tool (foreign-accum-rank); CRITICAL: reads `daily_ohlcv` (NOT vnstock_trading_stats); room_exhaustion from foreign_room_events; ADTV normalization (shares); feed-forward scalar foreign_accum_z_market; 9 files touched.
3. **IND-P1-MCP-PROXY-INDICATORS.md** (dev-mcp-server): MCP proxy layer; BACKLOG status (serial dependency on both Go zones LIVE); 4 tool registrations + 4 client functions; 6 files touched.

**Board mutation (via orch-apply.sh):**
- BA-IND-P1-MOMENTUM-RS: READY → IN_PROGRESS (next_agent: qa, pm_decomposed_at: 2026-06-30T03:00:00Z)
- IND-P1-ROC-MOMENTUM: backlog → ready, status: IN_PROGRESS, owner/next_agent: dev-technical-analysis
- IND-P1-RELATIVE-STRENGTH: backlog → ready, status: IN_PROGRESS, owner/next_agent: dev-technical-analysis
- IND-P1-52W-HIGH-PROXIMITY: backlog → ready, status: IN_PROGRESS, owner/next_agent: dev-technical-analysis
- IND-P1-FOREIGN-ACCUM-RANK: backlog → ready, status: IN_PROGRESS, owner/next_agent: dev-stock-price
- IND-P1-MCP-PROXY-INDICATORS: new backlog entry, status: BACKLOG, owner: dev-mcp-server

**Decomposition strategy:**
- **Zone 1 (apps/technical-analysis, Go):** Bundled 3 TA tools (ROC, RS, 52W) in SINGLE zone task (one dev-technical-analysis team; shared MultiTickerOHLCVRepository port; reuse TACalculator for MA200; parallel domain/application/infra development).
- **Zone 2 (apps/stock-price, Go):** 1 tool (foreign-accum-rank) isolated to its own task (distinct dev-stock-price team; reads daily_ohlcv + foreign_room_events).
- **Zone 3 (apps/mcp-server, TypeScript):** MCP proxy layer (dev-mcp-server) BACKLOG (serial dependency: wait for both Go zones LIVE).

**Delivery sequence (WIP limit enforcement):**
1. dev-technical-analysis ships IND-P1-TECHNICAL-ANALYSIS-SUITE (3 tools, 1 HTTP endpoint path) + QA sign-off
2. dev-stock-price ships IND-P1-FOREIGN-ACCUM-RANK (1 tool, 1 HTTP endpoint path) + QA sign-off
3. dev-mcp-server wires IND-P1-MCP-PROXY-INDICATORS (all 4 tools go LIVE) → QA sign-off → Fear & Greed layer consumes scalars

**Commits:** c06b09a1 (pm: DECOMPOSED into atomic dev tasks) + notebook entry
