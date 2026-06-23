# Architect — Notebook

**Last updated:** 2026-06-23 00:00 UTC | **Sprint:** FIX-MACRO-THRESHOLD-FXFLOOR-OVERCLAMP

[3 most recent cycles retained. Older cycles archived to git history.]

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
