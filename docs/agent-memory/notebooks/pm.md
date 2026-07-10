# PM — Notebook

## c323 FIX-BCTC-D2-ENSURE-SHELL-ROW PROMOTION + newsChainFallback TASK MINT · 2026-07-10T10:47Z

**MANDATE:** D1 (FIX-BCTC-D1-STABILIZE-REPORT-ID) landed DONE_VERIFIED — promote its dependent D2 to ready[], and mint a follow-up task for a second `INSERT OR REPLACE INTO financial_reports` id-orphaning site QA found outside D1's scope.

**OUTPUT:** `FIX-BCTC-D2-ENSURE-SHELL-ROW` moved backlog[]→ready[] (status=READY, owner=dev-mcp-server, dependency D1 satisfied). New task `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN` minted into backlog[] (status=BACKLOG, priority=high, zone=apps/mcp-server/) for `newsChainFallback.ts:348`'s `tryNewsChainFallback()` — same DELETE-then-INSERT/id-mint bug D1 fixed, same `ON CONFLICT DO UPDATE` fix pattern applies. D3A/D3B/D3C/R-HIGH-1/R-HIGH-2 left untouched in backlog[], correctly still blocked on their own unmet dependencies.

**NOTE (router-appended 2026-07-10T11:05Z):** this entry was reconstructed by the router TWICE — the first attempt (via the Edit tool) reported success, but a follow-up `git diff --stat` showed the file completely unchanged (byte-identical to HEAD). Root-cause investigation ruled out all 3 registered Write|Edit hooks in this repo (`orch-state-hook-prewrite.mjs` — orch-state.json only; `notebook-auto-prune.sh` — gated on >200L, file was 192L so it would no-op; `context-bloat-backstop.sh` — never writes back to the target file, only emits signals elsewhere) plus the global `~/.claude/settings.json` hooks (UserPromptSubmit/PostToolUse-on-TaskUpdate/Stop only) and `orch-state-hook-bash-backstop.sh` (orch-state.json-scoped only) — none can explain a full silent revert. Mechanism still NOT root-caused; landed this time via raw bash write + atomic mv (bypasses the Edit tool entirely), per the established workaround in `feedback_edit_tool_hook_silently_strips_multiline`. This is now the 3rd+ confirmed occurrence of that hazard (2x on `po` 2026-07-09, now on the router itself 2026-07-10) — raises real doubt about whether pm's own two "false" notebook-write claims this session (this entry's original c323, and the earlier c322 below) were confabulation at all, versus this same environmental bug silently eating a genuine Edit-tool write both times. See [[feedback_agent_selfreport_metalayer_confabulation]].

**NEXT:** dispatch dev-mcp-server on FIX-BCTC-D2-ENSURE-SHELL-ROW.

---

## c322 FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION DECOMPOSITION · 2026-07-10T12:00Z

**MANDATE:** Decompose architect's D1/D2/D3 design (`docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md`) into atomic dev-mcp-server tasks, D1 sequenced first per architect's explicit ordering (data-integrity fix that D2/D3 depend on).

**OUTPUT:** 7 atomic tasks minted into `.task_board.backlog[]`, zone `apps/mcp-server/`, owner `dev-mcp-server`: FIX-BCTC-D1-STABILIZE-REPORT-ID (no deps), FIX-BCTC-D2-ENSURE-SHELL-ROW (dep: D1), FIX-BCTC-D3A-PEK-TRIGGER-HELPER (dep: D2), FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS (dep: D3A), FIX-BCTC-D3C-RECONCILE-JOB + FIX-BCTC-R-HIGH-1-STATUS-ENUM-UPDATE + FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD (all dep: D3B). Parent moved ready→in_progress with decomposed_into metadata. Journal: STEP pm-S5.

**NOTE (router-appended 2026-07-10T12:05Z):** this entry was reconstructed by the router — pm's own notebook write did not land on disk (agent claimed a "c322" entry in its return summary; file had no such content). Journal entry (pm-S5) and board mutations DID land correctly. Router also caught+fixed a 3rd occurrence of the status-flip≠lane-move bug here: all 7 new rows were minted status=READY but left in backlog[] lane (coherence-validator mismatch, invisible to BOUNDED-1). Fixed: D1 moved to ready[] (genuinely unblocked); D2..R-HIGH-2 relabeled READY→BACKLOG in place (blocked on unmet depends[]). See FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE (bumped to P1).

**NEXT:** dev-mcp-server on FIX-BCTC-D1-STABILIZE-REPORT-ID only — D2 onward stay BACKLOG until D1 lands DONE_VERIFIED.

---

## c321 SPIKE-BCTC-CTG-BS-REALDATA-ROOT ARCHITECT DISPOSITION APPLICATION · 2026-07-03T07:45Z

**MANDATE:** Apply architect disposition for SPIKE-BCTC-CTG-BS-REALDATA-ROOT (architect complete, committed 2026-07-03) — mint 2 new composite tasks, mark 1 superseded, stub 1 backlog, re-parent 2 W5 blocked rows.

**ARCHITECT BRIEF:** docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md — Full root-cause recon (3 stacking bugs in apps/mcp-server: parser column-order, classifier bold-tolerance, section-vocabulary) + fix design split by layer. Verdict: FIX-BCTC-BANK-BS-SECTION-CLASSIFIER undersell—root cause is DOMINANTLY parser + section-detection, not primarily classifier.

**INPUT:**
- Architect disposition field in .task_board.review[FIX-BCTC-BANK-BS-SECTION-CLASSIFIER]
- Current orch-state.json .task_board lanes (review, backlog, active_sprints, done)
- Blocking W5 tasks (TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST in review, W5-FU-CTG-REFINE-96e36139 in active_sprints)

**OUTPUT:** 4 orch-state rows created/modified:
1. **FIX-BCTC-BANK-BS-COLUMN-ORDER** (NEW backlog, type=FIX, zone=apps/mcp-server/, priority=high, size=L) — composite FIX-A+FIX-D+FIX-C: parser column-order + section-vocabulary + real-markdown regression fixture
2. **FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP** (NEW backlog, type=FIX, zone=apps/mcp-server/, priority=high, size=S) — independent FIX-B: strip markdown emphasis from anchors
3. **FIX-BCTC-BANK-BS-SECTION-CLASSIFIER** (superseded, moved review→done, superseded_by=FIX-BCTC-BANK-BS-COLUMN-ORDER, retain 3 shipped RC fixes)
4. **FIX-BCTC-BANK-SUMMARY-MAPPING** (marked DONE/superseded, scope fully owned by #1)

**BOARD MUTATIONS:**
- .task_board.backlog += [FIX-BCTC-BANK-BS-COLUMN-ORDER, FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP] (2 new)
- .task_board.review -= [FIX-BCTC-BANK-BS-SECTION-CLASSIFIER] (remove from review)
- .task_board.done += [FIX-BCTC-BANK-BS-SECTION-CLASSIFIER with superseded_by + status_note] (add to done)
- .task_board.backlog[FIX-BCTC-BANK-SUMMARY-MAPPING].status = "DONE", superseded_by = "FIX-BCTC-BANK-BS-COLUMN-ORDER"
- .task_board.review[TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST].blocked_on = "FIX-BCTC-BANK-BS-COLUMN-ORDER — <root cause rationale>"
- .task_board.active_sprints[W5-FU-CTG-REFINE-96e36139].blocked_on = "FIX-BCTC-BANK-BS-COLUMN-ORDER — <root cause rationale>"

**CRITICAL TRACKING (INSIGHT):**
- Architect probe unmasked 3 independent bugs stacking: parser positional assumption (DOMINANT, drops 0/56 CTG units pre-DB) + classifier bold-intolerance + section-vocabulary gap. Prior cycles (W1-W4) failed because root cause was incorrectly localized to the classifier alone → narrow patches failed.
- **Real-data mandate enforced:** FIX-C regression fixture MUST capture live unit-0002/0003/0038 from `get_bctc_refined(96e36139-5dac-414d-8e4d-20a4725890d1)` verbatim. Hand-written fixtures diverging from reality is the exact anti-pattern that produced 2 DoD-cycle failures.
- FIX-A + FIX-D are prerequisites (§5 of brief: aggregator section-fallback depends on BOTH); both must ship with FIX-C regression gate in ONE PR. Do NOT split further.
- FIX-B independent, can ship in parallel — generic defect (affects any bank ticker with bold-wrapped codes).

**HANDOFFS CREATED:**
1. docs/handoffs/FIX-BCTC-BANK-BS-COLUMN-ORDER.md (L, composite FIX-A+FIX-D+FIX-C, unblocks W5)
2. docs/handoffs/FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP.md (S, independent FIX-B, parallel-safe)

**NEXT AGENT:** dev-mcp-server (both tasks route to same zone; no dispatch ordering constraint between them — PO-triage determines which dev spawns first). Head.next_agent remains `pm` (no dispatch occurs in this cycle, backlog populated for later triage).

**KEY PM DECISIONS:**
1. Accepted architect disposition as-written — no renegotiation
2. Re-scoped FIX-BCTC-BANK-BS-SECTION-CLASSIFIER as SUPERSEDED, NOT re-open for 4th narrow patch (recurring-bug bar, 2+ failed cycles → block)
3. Preserved all 3 RC fixes (commit 2c7fb5b0) as real non-regressions; FIX-A/FIX-D do NOT revert them
4. Enforced real-data gate: FIX-C fixture from live `get_bctc_refined` verbatim, NOT synthetic
5. Minted both tasks to backlog (NOT ready) — they are ready for dispatch, but head remains idle per flow mandate (pm never dispatches directly)

---

## c320 BA-PREDICTION-EVIDENCE-REVIVAL SPRINT DECOMPOSITION · 2026-07-01T05:37Z

**PARENT:** BA-PREDICTION-EVIDENCE-REVIVAL (SPRINT-M, high, zone=multi, active)
**ARCHITECT:** Completed SPLIT into 2 parallel-safe hops; architecture brief docs/architecture-briefs/2026-07-01-BA-PREDICTION-EVIDENCE-REVIVAL.md
**INPUT:** Brief + handoff + PO-approved scope reshape (B1-B4 resolved); corrected 4 load-bearing BA/PO spec errors live-verified during brief

**DECOMPOSITION PLAN:**
- **Hop 1 (dev-mcp-server):** FR-1.1 (get_evidence_summary direction+horizon bug, surfaces live n=18 TRUSTED row) + FR-2.2 (insider-accumulation watchdog extension, probe done, verdict=SILENT BUG) + FR-1.2 (baseRateComputationJob cadence weekly→daily, CRITICAL two-file coupling: cronConfig.ts:62 + baseRateComputationJob.ts:299 must move together)
- **Hop 2 (agent-father):** FR-2.1 (wire record_evidence_fragment into news-scout/bctc-analyst/market-watcher flows + corrected tools_package docs, use REAL seeded evidence_type set per brief §0 C3) + FR-3 (strip false Sharpe>1.0 hard-gate language from digest-predict/init.md, B1=Design B PO-approved)
- **Backlog (decoupled):** FIX-VPS-SSC-INSIDER-502 (VPS upstream diagnosis async; FR-2.2 watchdog extends observability, root-cause chase deferred outside sprint scope per B2)

**OUTPUT:** 3 orch-state rows created:
1. TASK-EVIDENCE-HOP1-MCP (READY, specialist=dev-mcp-server, next_agent=dev-mcp-server, zone=apps/mcp-server/)
2. TASK-EVIDENCE-HOP2-AGENTS (READY, specialist=agent-father, next_agent=agent-father, zone=docs/agents/)
3. FIX-VPS-SSC-INSIDER-502 (TODO backlog, specialist=developer, parent_sprint=BA-PREDICTION-EVIDENCE-REVIVAL)

**BOARD MUTATION:** Parent row status=READY (held for dispatch routing), decomposed_tasks=[hop1, hop2], decomposed_backlog=[fix], parallel_dispatch={mode:simultaneous, agents:[dev-mcp-server, agent-father], tasks:[hop1, hop2]}. Head updated: next_agent=dev-mcp-server, parallel_dispatch active. WIP after dispatch = 2 (within limit).

**CRITICAL TRACKING (RISK-1 HIGH):** Hop1 FR-1.2 two-file coupling — cronConfig.ts:62 + baseRateComputationJob.ts:299 must land in same commit (missing either defeats cadence upgrade). Developer must annotate commit message with this coupling.

**DISPATCH WAVE:** Parallel simultaneous: both hop1 + hop2 ready for dispatch NOW. Zero file overlap verified. Sequential constraint: none (parallel-safe). Parent row held, router/dispatcher will claim per-task + spawn both agents. Backlog row (FIX-VPS-SSC-INSIDER-502) status=TODO, awaits VPS live diagnosis.

---

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
