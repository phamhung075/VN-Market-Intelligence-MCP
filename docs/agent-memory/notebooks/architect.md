# Architect — Notebook

**Last updated:** 2026-06-27T17:00 UTC | **Sprint:** SSOT-INTEGRITY-PERIMETER

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-06-27T17:00Z — SSOT-INTEGRITY-PERIMETER (DESIGN DONE)

**Task:** ARCH-SSOT-INTEGRITY-PERIMETER | PLAN/DESIGN ONLY (no code) | zone: `apps/mcp-server/` + `scripts/` + `.claude/`
**What was designed:** Architecture brief for the Zod-schema SSOT integrity perimeter. 5 sections: (1) orchStateSchema.ts as single SSOT — 12-value StatusEnum (READY=ADD-1, PO option-a ratified), TERMINAL_SET 5 values, all-9-lane nested schema via shared Lane type, TaskBoardSchema + OrchStateSchema with .strict(), superRefine for active_task_id ref integrity, checkLaneCoherence() (warn-only, exports separately) and checkRefIntegrity() with injected FileResolver. (2) orch-validate.mjs two-stage validator: Stage-0 dup-key tokenizer on raw text pre-parse (closes feedback_ssot_duplicate_key class), Stage-1 safeParse + Stage-1b coherence warn + Stage-1c ref integrity hard-fail, auto-fix error contract with per-issue path+problem+expected+fix hint. (3) Dual-point enforcement: Point-1 PreToolUse Write|Edit hook (orch-state-hook-prewrite.mjs) + PostToolUse Bash backstop (non-blocking), both wired in settings.local.json; Point-2 orchStateStore.ts safeParse() before every atomic rename. (4) orch-apply.sh: stdin→Zod-Stage-0+Stage-1→CAS-mtime→atomic-rename; orch-state-validate.sh thin shim; CANONICAL pointers in dev-standards.md. (5) Wave-1 6 atomic tasks for PM.
**Key decisions:** ADD-1 READY required to avoid validator deadlocking the sprint's own ARCH task; Stage-0 MUST precede JSON.parse (silent last-wins corruption); lane coherence WARN-only until SHG-2+SHG-4 clears ~72 violations; dual-point is mandatory not redundant (hook blind to server-internal writes); all 6 Wave-1 task IDs follow existing code comment naming.
**Output:** `docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md`
**6 Wave-1 tasks for PM:** SSOT-W1-ZOD-SCHEMA-MODEL (apps/mcp-server) → SSOT-W1-ZOD-VALIDATOR-CLI (scripts/) → SSOT-W1-HOOK-ENFORCE (.claude/ + scripts/agents-flow/) → SSOT-W1-SERVER-ENFORCE (apps/mcp-server) → SSOT-W1-ORCH-APPLY-WRAPPER (scripts/) → SSOT-W1-BASH-SHIM (scripts/)
**Risk-1 (HIGH):** OrchStateTaskBoardTask.status still typed as hand-maintained union with `| string` — must be replaced by z.infer<typeof StatusEnum> in SSOT-W1-SERVER-ENFORCE.

## 2026-06-27T00:00Z — ORCH-STATE-SCHEMA-HARDENING (DESIGN DONE)

**Task:** ORCH-STATE-SCHEMA-HARDENING | PLAN/DESIGN ONLY (no code) | zone: `docs/data/orch/` + `scripts/`
**What was designed:** 4-problem schema-hardening brief for orch-state.json. (1) Status enum: 20+ spellings → 11 canonical uppercase values; full migration map with verify_note qualifier field. (2) Sprint eviction: deterministic TERMINAL_SET predicate; 13 of 18 active_sprints evictable today; null-id quarantine rule; closed_sprints[] stub format; insertion point in task-archive.md. (3) Task stub inside sprints: 10 hot fields kept; 33 prose/audit fields moved to backlog-detail.json via detail_ref — same pattern already used by backlog. (4) Write-gate: scripts/orch-state-validate.sh with 6 checks (G-1 JSON, G-2 sentinel, G-3 lane types, G-4 null sprint ids, G-5 status enum warn→hard, G-6 last_tick skew); wire-in targets enumerated; G-5 phased to hard gate post-migration.
**Key design decisions:** G-5 starts WARN-only (never blocks a write before migration runs); verify_note is HOT (tiny, non-authoritative qualifier string — not prose); sprint eviction only fires when ALL tasks are in TERMINAL_SET (conservative); null-id sprints quarantined unconditionally.
**Output:** `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md`
**5 tasks for PM:** SHG-1 (validate.sh, XS, dev) → SHG-2 (migration, XS, pm) → SHG-3 (wire-in, S, agent-father) → SHG-4 (sprint eviction rule, S, agent-father) → SHG-5 (hard gate, XS, dev)

## 2026-06-24T13:12Z — FIX-REFINE-QUEUE-TERMINAL-FAILED-UNIT-HEADPOISON (DESIGN DONE)

**Task:** FIX-REFINE-QUEUE-TERMINAL-FAILED-UNIT-HEADPOISON | BUG-FIX (BCTC-ANALYTICS-LAYER, P2) | zone: `apps/mcp-server/`
**Chosen mechanism:** Option (a) — extend `get_bctc_pending_refine` NOT clause in Branches 2 & 3: change `window_status != 'DONE'` to `window_status NOT IN ('DONE', 'FAILED')`. Minimal single-token change per branch. Reuses existing composite index. Does not touch `finalizeBctcRefineTool.ts` (high-risk surface avoided).
**FAILED retryability ruling:** All FAILED units treated as terminal for queue-exit. Transient-FAILED docs: safe to exclude — if retry succeeds they exit via DONE; if retry still fails, staying excluded is correct. REJECTED_SANITY NOT included in terminal set (stays non-terminal intentionally).
**Test impact:** DV-FIX-A-2 assertion INVERTED (FAILED now terminal = excluded not included). 5 new DV-FIX-B-* tests added. Risk-2: BOTH Branch 2 and Branch 3 must be updated.
**Atomization:** 1 task — TASK-HEADPOISON-1 | 2 files | dev-mcp-server → qa
**Output:** `docs/handoffs/TASK_FIX-REFINE-QUEUE-TERMINAL-FAILED-UNIT-HEADPOISON.md`

## 2026-06-24 — FIX-MACRO-SNAPSHOT-DELTAS-NULL (DESIGN DONE)

**Task:** FIX-MACRO-SNAPSHOT-DELTAS-NULL | FEATURE-FIX (S2-DATA-HONESTY) | zone: `apps/macro-indicators/`
**4 Q resolutions:**
- Q1 (lookback): 18h rolling window kept. Calendar-day-aligned midnight UTC is ambiguous for global commodity markets (oil trades ~23h, SBV sets rate 01:00 UTC). Weekend/long-holiday → 36h upper stale bound → still compute if row found, stamp prevFetchedAt; nil if no row in 18–36h window.
- Q2 (SBV cross-source): SAME-SOURCE-ONLY. Add `usdVndSBVOverride` bool in Execute(); suppress delta (nil/"unknown") when SBV override fires — cross-source SBV_official vs Yahoo_history is structurally misleading. Delta fires only when Yahoo serves both current and prev.
- Q3 (prevFetchedAt): Raw `*string` ISO8601 UTC in DTO. Formatting concern belongs to UI.
- Q4 (table ownership): Safe-degrade sufficient. No own write path. Mirrors VNIndex/daily_ohlcv pattern. 36h upper bound = implicit freshness gate; scheduler failure surfaces via auditor pipeline.
**Key risks flagged:** RISK-3 (fixture-current delta = fabrication; gate on `*Live` flag); RISK-4 (SBV override post-resolveMarketPrices; captured via `usdVndSBVOverride`); RISK-1 (RFC3339Nano on fetched_at; consistent with existing adapters).
**DDD/NO-CGO:** Fence-A/B/C intact. Port in domain, adapter in infra, wired in cmd/server/main.go. `modernc.org/sqlite` already in go.mod (no new dep, no CGO).
**Atomization:** 1 task — TASK-MACRO-COMMODITY-DELTA | 7 files | dev-macro-indicators
**Output:** Appended [Architect] section to `docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md`

## 2026-06-23T18:10Z — FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION (DESIGN DONE)

**Task:** FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION | BUG-FIX (S2-DATA-HONESTY, P1) | zone: `apps/mcp-server/` + `apps/frontend/`
**4 ratifications:**
- CONF-1: Severity-to-int → INLINE in alertStore.ts as `severityToConfidence()`. `SEVERITY_VI` map is string→ViLabel (interface layer), incompatible with numeric proxy + DDD violation if imported here. Single file = no drift.
- CONF-2: `PostSignalInput.confidence_score` current type = `number | undefined` (default `= 50` in destructure). Widen to `number | null | undefined`, change default to `null`. Callers passing explicit numbers unaffected.
- CONF-3: Alert-commander cowork path verified — does NOT require FR-6. Path B fix (null for absent finding_data.confidence) covers it. assembleBriefing.topConviction is a response struct field, NOT an agent_signals write. All `verified_decision` INSERT sites enumerated: A1=storeAlerts, A2=storeAlertsFromCommander, B=agentSignalTools MCP handler, C=DDL DEFAULT (structural enabler). Three callers confirmed, zero missed.
- CONF-4: Frontend null-render requires SEPARATE sub-task (TASK-CONF-2). `client.ts:350` maps null confidence_score to `0` (not null); `domain/market.ts:217` typed as `number` (non-nullable); render guard at `dashboard.alerts.tsx:301` checks `typeof === "number"` (always true for 0). Three-file change in `apps/frontend/`, different zone from backend.
**SQLite gotcha:** live column already exists (3316 rows prove it). DEFAULT removal only affects fresh DBs (`:memory:` test helpers included). 5 test `makeDb()` helpers carry `DEFAULT 50` and must be updated — self-confirming test failure mode prevented.
**Atomization:** TASK-CONF-1 (dev-mcp-server, 5 files + tests, ~2h) → TASK-CONF-2 (dev-frontend, 3 files, ~1h, sequential after CONF-1 deploy).
**Output:** Appended [Architect] section to `docs/handoffs/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION-BA-spec.md`

## 2026-06-22T21:00Z — FIX-MACRO-THRESHOLD-FXFLOOR-OVERCLAMP (TEST FIX DONE)

**Task:** FIX-MACRO-THRESHOLD-FXFLOOR-OVERCLAMP | BUG-FIX (CI-red Root A, P1) | zone: `apps/mcp-server/`
**Decision:** Option A — 0.5% FX %-floor IS correct contract. Guard-2 stays untouched. 4 pre-floor tests updated (1269/1326 TC-3/4/5/6 use 168/200 VND on mean=26269, stdDev=60; 1270 AC-3/AC-2 updated). USD/VND ~26000: 75 VND = 0.28% micro-noise; Guard-2 prevents 2026-06-19 false-CRITICAL.
**CI result:** All 4 Root A files NOT in failed list. 1307a + FIX-1269 phantom-σ tests green.
**Journal:** `docs/agent-memory/decisions/sprint-FIX-MACRO-THRESHOLD-FXFLOOR-OVERCLAMP-architect.md`

## 2026-06-22T00:00Z — NEXT-LEVEL-PROVENANCE-CALIBRATION-LOCAL-ARCH (DESIGN DONE)

**Task:** NEXT-LEVEL-PROVENANCE-CALIBRATION-LOCAL-ARCH | ARCHITECTURE-BRIEF | cross-service
**3 pillars:** (1) .mcp.json register `gateway` (4 tools only, NOT vn-market 146 tools) — preserves small surface + fixes subagent `mcp__gateway__call_tool` blindness. (2) Cascade-signals stop-flattening `finding_data`; ADD COLUMN `source_url`; calibration + prediction-claims wired (machinery already deployed). (3) Launchd timers replace 5 cloud RemoteTriggers; 2-fire sequential gate before decommission.
**Critical design choice:** `.mcp.json` gateway-only registration is single most important guard.
**Output:** `docs/architecture-briefs/2026-06-22-provenance-calibration-local-arch.md`

## 2026-06-21T00:00Z — FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE (DESIGN DONE)

**Task:** FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE | BUG-FIX (P1) | `apps/mcp-server/` + `apps/technical-analysis/`
**Root confirmed:** 3 mismatches — candle window (date-window vs LIMIT 60), min-candle (35 vs 15), engine (TS computeRSILocal vs Go computeTAIndicators). Same DB, same minute → RSI 29.7 vs 27.6.
**Decisions:** Go TA canonical. TS computeRSILocal kept as dead code (follow-on CLEAN). Synthetic fallback REMOVED (not equivalent to official close; fail-closed correct).
**2 tasks:** TASK-RSIFIX-1 (write ta-engine-contract.md, no rebuild) → TASK-RSIFIX-2 (rewire defaultComputeTa to Go, align window/gate, async, rebuild required).
**Risk:** assembleEveningSummary.ts L594–635 must become `for...of` with `await`.
**Output:** `docs/architecture-briefs/2026-06-21-digest-rsi-dual-engine-diverge.md`

## 2026-06-20T08:45Z — FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 (DESIGN DONE)

**Task:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 | BUG-FIX (P0) | `apps/mcp-server/`
**8 writers audited:** GAP-1 Writer F (priceBackfillService.ts) missing normalizeOhlcvToVnd + validateOhlcvUnit Rule 5. GAP-2 Writer H (server.ts push-ohlcv-history) silently coerces string high/low to open before guard.
**Root causes:** 835 violations = pre-guard era + 2 active gaps. VNDAF high=low=0 = schema DEFAULT. DFF 1000x = pre-guard mixed-unit VNDirect (existing HILO_RATIO_MAX catches new).
**Absorb:** FIX-OHLCV-CLASS3-COLD-START → SUPERSEDED. Dependency locked: CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR blocked on done_verified.
**Output:** `docs/handoffs/FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0-architect-design.md`

## 2026-06-19T11:30Z — BPE-ARCH-1 BCTC-PROSE-EXTRACT (CLOSE-OUT, SPRINT DONE)

**Task:** BPE-ARCH-1 | RECURRING-BUG-ESCALATION SPIKE | `apps/pdf-extractor/` + `apps/mcp-server/`
**All 5 blockers RESOLVED:** (1) additive ocr_pages param (6e518935). (2) <3 char + DPI 300 retry (5ea9f121); BPE-OPS-1 re-OCR 46/46. (3) serial patch order zero conflict. (4) getBctcPageTextTool extended (prose_sections → bctcFullTools). (5) no prose assertion + gate-skip masking; TC-1 inverted test (61 tests green).
**Sprint outcome:** page 12 prose=4099 chars, total_pages=46, 0 empty. Task DONE.

## 2026-06-19T04:33Z — FIX-CASCADE-MACRO-CARD-REAL-DETAIL (DESIGN DONE)

**Task:** FIX-CASCADE-MACRO-CARD-REAL-DETAIL | BUG-FIX (3 defects) | `apps/mcp-server/`
**Defects:** D-1: querySignalsForStock no type filter (137 empty stubs live). D-2: alertStore.storeAlerts co-writes empty verified_decision (every alert adds stub). D-3: 2 test-fixture rows (6218, 6216).
**Decisions:** (1) Type filter: chain_catalyst → IN('chain_catalyst','urgent_news') internally. (2) Stub fix: read-guard (exclude empty) + write-marker is_correlation_stub=1. (3) purge-test-fixture-signals.ts --dry-run --live (triple-guard: LIKE + signal_type + finding_data='{}').

## 2026-06-19T00:00Z — FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT (DESIGN DONE)

**Task:** FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT | BUG-FIX | `apps/mcp-server/src/interface/mcp/tools/news-analysis/`
**Root:** agent: z.string() required at Zod but (A) unused in all-producers (from_agent=null), (B) overridden by fromAgent bind in sender-history, (C) only required in inbox (from_agent=undefined). 3 live callers legitimately omit agent.
**Decision:** Direction A — make agent optional (.optional()); early-return guard in inbox. 5 files: 1 TS + 4 docs. New test: FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT.test.ts.

## 2026-06-18T05:58Z — FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER (DESIGN DONE)

**Task:** FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER | BUG-FIX | `docs/agents/cowork-team/flow/` + test-only
**Root:** Step 5b loop unconditionally writes slot.last_fired = FIRED_AT — no monotonic guard. Fresh-read + atomic temp→rename correct; only guard missing.
**Design:** FR-4 monotonic guard: `if currentLastFired === null OR FIRED_AT > currentLastFired: slot.last_fired = FIRED_AT` (ISO-8601 lexicographic compare valid UTC). T-14b = load-bearing RED proof (adversarial stale stamp blocked).
**Output:** `docs/architecture-briefs/2026-06-18-cowork-schedule-stale-base-clobber.md`

## 2026-06-18T00:33Z — ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP (DESIGN DONE)

**Task:** ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP | MAINTENANCE | cross-service
**Recurrence root:** FU-ORIGIN-LAG-PUSH-DISCIPLINE shipped commit-mutex rebase-retry. Reoccurrence: git pull --rebase requires clean main; cowork churn keeps tree dirty → push falls back to local-only → lag accumulates.
**Design:** Option-B threshold-triggered (N=20) push inside PO flow tick. Fires `scripts/fleet-worktree-push.sh` (new). Guards: (1) skip if commit-mutex held OR orch-state/notebooks dirty. (2) non-chore commit detected → ABORT (BUG telegram). (3) MERGE (not rebase) cloud-chore behind-set; orch-state.json conflict → keep HEAD. (4) tsc gate: `pnpm --filter vn-market check` exit 0 mandatory. Isolated worktree.
**4 PM tasks:** A=fleet-worktree-push.sh; B-PO=Step PUSH-BACKSTOP to po/flow/main.md; B-DT=fallback post-cycle.md; C=cron-jobs.md note.
**Output:** `docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md`

## 2026-06-17T05:00Z — ARCH-OHLCV-WRITER-SSOT-DURABLE (DESIGN DONE)

**Task:** ARCH-OHLCV-WRITER-SSOT-DURABLE | RECURRING-BUG-ESCALATION (4th recurrence) | `apps/mcp-server/`
**Root:** writeForeignFlowToOhlcv (ohlcvForeignFlowStore.ts L57-69) last bypassing writer; INSERTs close=0 stub when no OHLCV row at 02:00Z fetch time.
**Design:** Merge-only UPDATE (replace INSERT…ON CONFLICT); changes=0 when no OHLCV row (deferred, no stub). Schema constraint (close REAL NOT NULL) blocks NULL-close INSERT; rebuild rejected for P0.
**Writer inventory:** 8 writers accounted for. After fix: zero writers insert close=0 stubs. Sentinel (OHLCV-WRITE-BYPASS-ALLOWED) + ESLint rule (follow-on LINT) close bypass class.
**Follow-on:** ARCH-DAILY-FOREIGN-FLOW-TABLE (dedicated table eliminates 2–3h deferred-gap for new-day rows).
**Output:** `docs/architecture-briefs/2026-06-17-ohlcv-writer-ssot-durable.md`

## 2026-06-16T11:00Z — ARCH-BCTC-PIPELINE-DURABILITY (SPIKE DONE)

**Task:** ARCH-BCTC-PIPELINE-DURABILITY | SPIKE | multi (`apps/mcp-server/` + vps-scripts)
**4 contracts:** C1=Consecutive-zero-URL counter + aggregate BUG alert (earnings-guarded). C2=Replace passive:true vpsHealthPoller with active latestTimestampSql on bctc_vps_queue.last_attempt (24h threshold). C3=Enrich fail-loud (enrich_failed status, 989654f2 done). C4=ADF-brittleness (no new layer; C1+C2 detect within 30min/24h).
**5 child-to-contract:** FIX-HNX-SESSION-COOKIE→C4. FIX-SSC-C111-EMPTY-FALLBACK→C4. FIX-BCTC-ZERO-URL-ALERT→C1. FIX-BCTC-FRESHNESS-GATE→C2. FIX-BCTC-ENRICH-SILENT-0ROWS→C3 (REVIEW outstanding).
**Key choice:** No VPS-level Telegram (no gateway on VPS); all via mcp-server boundary. FreshnessConfig additive extension. Consecutive-zero in SQLite (survives restart).
**Output:** `docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md`

## 2026-06-16T06:30Z — FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH (DESIGN DONE)

**Task:** FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH | zone: `apps/frontend/` | ERROR-AUDIT Wave 2
**3/3 clusters mapped:** A=28 files (added brownfield dashboard.bctc.tsx, dashboard.vps.tsx; excluded dashboard.bctc-inspect.tsx). B=29 api.*.tsx proxy routes. C=4 functions in client.ts (:283, :489, :550, :578).
**4 ARCH-RATIFY verdicts:** (FE-1) apiGet NOT bounded internally; safeFetch covers inline-fetch loaders; EC-8 loaders gap→Wave-3. (FE-2) fetchWatchlistPrices→safeFetch (NOT safeFetchOrNull); empty-object fallback preserves degrade. (FE-3) EC-8 OUT OF SCOPE; 4 excluded. (FE-4) FE-PAGE-REORG FR-4 loader-utils.ts ABSORBED into fetchUtils.ts; PM updates BA task.
**Key decisions:** ReturnType<typeof setTimeout> required. parse(null) empty-T contract. Full body replacement (fetchCascadeSignals + fetchAccuracyDigest). Exclude dashboard.bctc-inspect.
**Output:** `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-architect-design.md`

## 2026-06-16T01:50Z — FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 (DESIGN DONE)

**Task:** FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 | zone: `apps/mcp-server/` | OHLCV-UNIT-CONTAM 3rd+ touch
**Root:** Writer D (taOhlcvBackfillJob, 01:30 UTC) prevClose=0 no-op for ÷1000 group; double-write race with Writer A for ×1000 group.
**SSOT chokepoint:** ohlcvWriteService.ts (application/usecases) — single batched-prevClose + normalize + seed-filter + validate + upsert for all writers.
**Guard placement:** pre-write in writeOhlcvBatch; post-write in ohlcvSanityCheckJob (FR-G2/G3); early cron 00:45 UTC (FR-G4).
**Repair:** Option D SAFE (fingerprint-scoped DELETE; all consumers handle absent via ON CONFLICT or prior-date fallback).
**Output:** `docs/handoffs/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-architect-design.md`

## 2026-06-16T00:00Z — FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE (BLUEPRINT DONE)

**Task:** FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE | zone: `apps/mcp-server/` | ERROR-AUDIT Wave 2
**4 Ratifications:** (W2-1) DeadlineError extends Error (name, label+ms fields). (W2-2) err.name==='AbortError' confirmed Bun; instanceof DOMException rejected. (W2-3) T-11=7 files/8 fetches; carryTools.ts has 2 unbounded (:57 /snapshot, :134 /macro-calendar) → one task; PM annotates double-call. (W2-4) pushToMcpServer:79 folded into T-5 (10_000ms localhost).
**Key DDD risk (RISK-1, blocks T-1):** macroFetch in infrastructure/ must NOT import macroHttpClient from interface/ (upward import). Fix: add baseUrl:string first param to macroFetch; callers already hold it.
**Deadline sanity:** All 9 values < 60_000ms. bctcPdfPull 45s safe (background scheduler, not sync MCP). pushToMcpServer 10_000 (localhost).
**Output:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md`
