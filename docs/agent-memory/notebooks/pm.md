# PM — Notebook

## c321 BCTC-REFINE-STALL-RETRIGGER TASK ATOMIZATION · 2026-06-27T210000Z

**PARENT:** Architect recon-first complete (docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md), PO dispatch context with cowork ownership guard, WIP=1 active sprint

**INPUT:** Architect 5-task blueprint (A1 ops + A2 watchdog + B1 vic-probe + B2 discovery-fix + C1 staleness-wiring), orch-state.json board (BCTC-REFINE-STALL-RETRIGGER parent in .head), critical cowork-ownership constraint from memory feedback_router_cowork_defer_to_live_leader

**OUTPUT:** 5 atomic tasks atomized on task_board, all 5 TASK_NNN.md handoff files created (BCTC-REFINE-{A1,A2,B1,B2,C1}.md), orch-state updated atomically via orch-apply.sh, .head set to A1 (next_agent=po), decision journal recorded. WIP=1 constraint enforced (only A1 in active dispatch).

**Atomization rationale:**
- **Track (a) — Refine-Stall:** 47 docs stuck PENDING/PARTIAL. Root: cowork CronCreate not re-armed after session restart 2026-06-07. **A1 (XS ops)** unblocks TODAY via /cron-cowork-team skill (PO must verify no parallel cowork dispatcher — non-delegable to dev-team per memory feedback_router_cowork_defer_to_live_leader).
- **Track (c) — Observability:** 20-day stall went silent (zero watchdog). **A2 (S watchdog)** + **C1 (S wiring)** add server-side staleness detection + cron_job_runs logging. Definitif closes observability gap.
- **Track (b) — VIC Discovery-Gap:** VIC absent from financial_reports (parked as url_not_found after MAX_ENRICH_ATTEMPTS=5). **B1 (XS probe)** confirms hypothesis via RAW SQL query + manual reset. **B2 (S fix)** implements structural fix (re-discovery sweep OR regex patch per B1 findings).
- **Sequencing:** Seq-1 A1 unblocks all; Seq-2 (A2||B1 parallel, disjoint zones/files); Seq-3 (C1 after A2 scaffolds signals, B2 after B1 confirms hypothesis).
- **WIP=1:** .head.active_task_id = BCTC-REFINE-A1, next_agent = po. No parallel dev-team over-dispatch. Router will sequence A2+B1 wave after A1 completion.

**Critical PM decision — Cowork Ownership Guard:**
- A1 routed to `owner: "po"` (NOT dev-team). PO must verify (1) check cron_job_runs for recent refine_bctc_md runs, (2) check WORK channel logs, (3) confirm no parallel session owns cowork dispatcher (double-fire risk), (4) execute /cron-cowork-team skill.
- This guard is CANONICAL per memory. Dev-team router MUST NOT blind-arm cowork crons.

**Handoffs created:**
1. **BCTC-REFINE-A1.md** (PO action, cowork re-arm, AC-1..AC-5: verify ownership + re-arm + enable + wait slot + probe refine_status flipping)
2. **BCTC-REFINE-A2.md** (dev-mcp-server, staleness watchdog job, Check 1 queue depth + Check 2 drain-lapse, alert thresholds, unit tests)
3. **BCTC-REFINE-B1.md** (dev-mcp-server, VIC RAW-probe + manual reset, 1 SQL query, hypothesis confirmation)
4. **BCTC-REFINE-B2.md** (dev-vps-crawls, conditional structural fix per B1 findings: C-1 re-discovery sweep OR C-3 regex fix)
5. **BCTC-REFINE-C1.md** (dev-mcp-server, staleness wiring: wrapRun logging + signal-type extension, depends on A2)

**Board mutation (atomic via orch-apply.sh):**
- Created BCTC-REFINE-STALL-RETRIGGER sprint in active_sprints with 5 tasks (status=TODO)
- .head updated: active_task_id=BCTC-REFINE-A1, next_agent=po, next_action describes cowork verification + re-arm
- Validators PASS (74 pre-existing SHG warnings only, non-blocking)

**Decision journal:** docs/agent-memory/decisions/sprint-BCTC-REFINE-STALL-RETRIGGER-pm-decomposition.md (DJ-GATE-1..6: cowork guard enforcement, architect ratification, board mutation, handoff creation, WIP compliance, risk encoding)

**Risks documented:**
- **Risk-1 (HIGH):** Re-arm alone is band-aid. Without A2+C1 watchdog, future session restart re-stalls silently. A2+C1 are definitif closes.
- **Risk-2 (MEDIUM):** VIC url_not_found is terminal/no-auto-retry. B1 reset is only same-day unblock. B2 structural fix required.
- **Risk-3 (MEDIUM):** A2 Check 2 (drain-lapse detect) requires C1 landed. Interim: use heuristic if C1 delays.
- **Risk-4 (LOW):** 47 docs drain speed ~23 days (2 slots/day). Router can accelerate with manual refine invocations (idempotent).

**Done-verified gates (LIVE probe):**
- **A1:** AC-1..AC-5 checked (verified no cowork conflict, re-armed, enabled, cron_job_runs shows refine, live probe shows refine_status flipping)
- **A2:** AC-1..AC-5 verified (unit tests pass, live rebuild, WORK alert fires on test data)
- **B1:** AC-1..AC-5 verified (probe executed, reset confirmed in DB, enricher re-attempted, findings documented)
- **B2:** AC-1..AC-5 verified per confirmed hypothesis (sweep OR regex tests pass, live deployment verified)
- **C1:** AC-1..AC-5 verified (wrapRun merged + compile clean, unit tests pass, live alert fires on old cron_job_runs)

**Key PM decisions:**
1. Enforced COWORK OWNERSHIP GUARD non-negotiably. A1 routed to PO, not dev-team.
2. Accepted 5-task split as architect wrote it (no renegotiation, all ratified).
3. WIP=1 constraint enforced (only A1 in active dispatch loop).
4. Done-verified gates are LIVE-PROBE, not build-green (raw DB queries, cron_job_runs inspection, live alert verification).
5. Risks documented for visibility (no surprises post-deployment).

**Dispatch readiness:** ✅ BOARD COHERENT (orch-validate PASS). ✅ ALL 5 HANDOFFS CREATED. ✅ .head SET TO A1 (next_agent=po). ✅ PO READY TO EXECUTE A1 AFTER OWNERSHIP VERIFICATION. Router will sequence A2+B1 wave after A1 completion.

---

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
