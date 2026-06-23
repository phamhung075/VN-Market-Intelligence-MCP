# PM — Notebook

## c320 FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION TASK ATOMIZATION · 2026-06-23T172813Z

**PARENT:** BA spec finalized + Architect Brownfield Findings ratified (FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION-BA-spec.md § [Architect] Brownfield Findings, 4 RATIFICATIONS resolved)

**INPUT:** Parent task in READY, architect complete with CONF-1..CONF-4 decisions locked, PM init flow

**OUTPUT:** Two atomic subtasks (TASK-CONF-1, TASK-CONF-2) created with explicit sequential dependency. Parent task moved to DECOMPOSED. Board updated atomically. Handoff files generated. Decision journal recorded.

**Atomization rationale:**
- **Zone split:** mcp-server (TASK-CONF-1, backend) + frontend (TASK-CONF-2, frontend) — separate repos, no file conflict
- **Sequential dependency:** Frontend AC-3 (render null as "—") only verifiable after backend deploys null rows to DB. TASK-CONF-2 blocked-by TASK-CONF-1.
- **Architect ratified:** CONF-1 severity-to-int map location (inline in alertStore.ts, DDD-safe), CONF-2 type widening (number|null|undefined, callers safe), CONF-3 cowork path (no FR-6 needed), CONF-4 frontend effort (3 files, separate task). No negotiation.
- **Size accuracy:** TASK-CONF-1 = M (~2h): 5 files + 5 test makeDb() updates + new unit tests. TASK-CONF-2 = S (~1h): 3 files, type + mapper + render guard.

**Task specs created:**
1. **TASK-CONF-1** (dev-mcp-server) — Path A wire (severityToConfidence inline in alertStore.ts, wire both storeAlerts + storeAlertsFromCommander). Path B + C (remove DEFAULT 50, pass null). Path D (read-path ?? null). Test updates (5 makeDb() helpers + new T-1..T-4 unit tests). AC-1..AC-5 live probe (named-vol DB varied values, severity mapping, null-honest). BLOCKS TASK-CONF-2.
2. **TASK-CONF-2** (dev-frontend) — Client mapper null-safe (??null not ??0). Domain type widening (number|null). Render guard null-check. AC-3 live dashboard "—" for null. DEPENDS TASK-CONF-1.

**Board mutation (atomic):**
- **Before:** ready=[FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION, FIX-MACRO-SNAPSHOT-DELTAS-NULL], in_progress=[], backlog=[278]
- **After:** ready=[FIX-MACRO-SNAPSHOT-DELTAS-NULL, TASK-CONF-1], in_progress=[FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION (DECOMPOSED)], backlog=[TASK-CONF-2 (blocked) + 278]

**Handoffs created:**
1. docs/handoffs/TASK-CONF-1.md (backend implementation spec, FR-1..FR-5, test updates, AC-1..AC-5, risk RISK-1..5)
2. docs/handoffs/TASK-CONF-2.md (frontend implementation spec, FR-F-1..FR-F-3, AC-3, risk RISK-F-1..3)

**Decision journal:** docs/agent-memory/decisions/sprint-S2-DATA-HONESTY-conf-task-atomization.md (DJ-GATE-1..6: ratification, board mutation, handoff creation, verification gates, WIP capacity, follow-ons)

**Done_verified gates (LIVE probe, not green build):**
- TASK-CONF-1: AC-1 (named-vol DB ≥2 non-50 values) + AC-2 (API varied confidence) + AC-3 (null-honest) + AC-4 (severity mapping)
- TASK-CONF-2: AC-3 (dashboard "—" for null) — only verifiable after TASK-CONF-1 deployed + DB contains null rows

**WIP state:** Dispatch TASK-CONF-1 immediately (1/2 WIP). TASK-CONF-2 blocked in backlog (unblocks on TASK-CONF-1 done_verified). Max concurrent = 2 lanes, compliant.

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
