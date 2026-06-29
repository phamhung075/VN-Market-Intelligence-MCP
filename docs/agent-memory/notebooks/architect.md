# Architect — Notebook

**Last updated:** 2026-06-29 16:21 UTC | **Sprint:** FEAT-NEWS-DECISION-RESUME

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-06-29T16:21Z — FEAT-NEWS-DECISION-RESUME (DESIGN DONE)

**Task:** ARCH-FEAT-NEWS-DECISION-RESUME | NEW-FEATURE (lean) | zone: `apps/mcp-server/` + `apps/frontend/` (multi)
**BUILD-STANDARD:** lean (brownfield — both services exist; no new microservice)
**5 FRs resolved across 2 hops:**
- FR-1 (domain): `buildDecisionResume()` pure helper added to newsNormalizer.ts (~L820 helpers section). Inputs: `sentiment`, `level`, `affectedActions`, `affectedDomains`, `bullishMatched`, `bearishMatched` — all in scope at normalizeNews() return site (L958). `DOMAIN_VN_LABEL` const map (17 entries, `Partial<Record<string, string>>`) co-located. Neutral→null; hard-cap 120 via `truncateAt120()` helper.
- FR-2 (infra): schema-news.ts ADD COLUMN pattern: `try { db.exec("ALTER TABLE rag_analyses ADD COLUMN decision_resume TEXT"); } catch {}` after existing `body_text` block (~L65). No UNIQUE. analysis.ts INSERT grows 19→20 params.
- FR-3 (interface): newsSentimentHandler.ts — `RagAnalysisRow` + `NewsSentimentItem` + SELECT + mapper + header comment updated. No new imports.
- FR-4 (interface): dashboard.news.tsx `Sentiment` type `positive/negative` → `bullish/bearish`; `SentimentPill` remap.
- FR-5 (interface): dashboard.news.tsx `NewsCard` résumé strip before title row; `impact_summary` wrapped in Radix `Collapsible` (default collapsed, "Xem thêm"/"Thu gọn").
**Key risks:** RISK-3 (MEDIUM — TASK-17 test `insertRow()` must be extended with optional `decision_resume` param for AC-NEW passthrough tests). RISK-4 (LOW — truncation off-by-one; test exactly-120 + 121+ cases).
**Test deliverables:** NEW `FEAT-NEWS-DR-builder.test.ts` (10 unit tests: 5 BA examples + 5 edge cases). TASK-17 test extended with AC-NEW-1+AC-NEW-2.
**Verify gate (Hop1):** `curl /api/news-sentiment | jq '[.items[] | select(.sentiment=="bullish")] | first | .decision_resume'` → non-null VN string ≤ 120 chars for new rows.
**Output:** `[Architect] Brownfield Findings` appended to `docs/handoffs/BA-FEAT-NEWS-DECISION-RESUME.md`; decision journal: `docs/agent-memory/decisions/sprint-FEAT-NEWS-DECISION-RESUME-architect.md`
**Next:** pm atomizes into TASK-FEAT-NEWS-DR-HOP1 (dev-mcp-server, ~2h) + TASK-FEAT-NEWS-DR-HOP2 (dev-frontend, ~1h, blocks_on HOP1).

## 2026-06-28T07:30Z — FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT (DESIGN DONE)

**Task:** ARCH-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT | BUG-FIX (P1, SPRINT-M) | zone: `apps/pdf-extractor/` (single zone)
**BUILD-STANDARD:** not-applicable (bug-fix/refactor, no new primitives)
**7 FRs resolved:**
- FR-1 (infra): `_CODE_VALUE_COL_RE` code group narrowed `\d{2,3}` → `\d{3}` — rejects 2-digit note-ref captured as code (Layout 3 false-positive). FPT non-regression: all FPT codes are 3-digit.
- FR-2 (infra): post-parse label clean `re.sub(r'\s+\d{1,3}$', '', label)` with ≥5-char guard in `_parse_lines_to_rows`. "Chứng khoán kinh doanh 4" → "Chứng khoán kinh doanh".
- FR-3 (infra): `_ROMAN_OCR_NORMALIZE` dict (Il→II, Ill→III, IIl→III, lV→IV, VlI→VII, VIl→VII, VIll→VIII, VlII→VIII) applied to line-start token in `_try_parse_roman_code_row` BEFORE `_ROMAN_CODE_RE.match()`.
- FR-4 (application): NEW `_detect_section_start(page_text) → Optional[str]` + `_filter_pages_to_section(pages, section)` in `extract_tables_usecase.py`. Replaces direct `select_balance_sheet_section()` call with generalized section filter for all 3 section types. TextTableExtractor unchanged. Vietnamese section-title keywords, no issuer branches.
- FR-5 (infra): NEW `_dedup_rows_within_section(rows)` in `assemble()` post-stitch (before positional cutoff). First-wins; identical (code, value_current) → drop + WARNING; different values → emit both + WARNING. Clears HPG/VNM exact_dup_count=0.
- FR-6 (domain): RISK-1 — vn_number_normalize ALREADY handles "(1.992.671)" correctly via existing _VN_INT_RE path. The FM-VCB-4 bug is UPSTREAM in value-cell splitting. Defensive fix: apply poppler-artifact space handler `re.sub(r"(\(\d[\d.]*)\.\s+(\d[\d.]*\))", r"\1.\2", cleaned)` in `_parse_value` (mirrors existing handler at _find_code_in_line L250). Trace-first mandatory before dev ships.
- FR-7 (infra): `_is_notes_section_boundary()` + `_in_notes_section` flag in `_parse_lines_to_rows`. Stops on standalone integer ≥15 with trailing period ("26.") or "Thuyết minh"/"Ghi chú" header.
**Key risks:** RISK-1 HIGH (FR-6 fix target is upstream not vn_number_normalize — trace first); RISK-4 MEDIUM (FR-4 section keywords may over-filter if they appear in page footers — scope detection to first 30 lines); RISK-6 MEDIUM (FR-4 only covers Path A pre-supplied; Path B auto-locate unaffected).
**Output:** `[Architect] Brownfield Findings` appended to `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md`; decision journal: `docs/agent-memory/decisions/sprint-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT-architect.md`
**Recommended PM sequencing:** FR-3 → FR-1 → FR-2 → FR-7 → FR-5 → FR-4 → FR-6 (trace-first). All single zone, sequential dispatch (shared file text_table_extractor.py).

## 2026-06-27T20:00Z — FRONTEND-FRESHNESS-TRANSPARENCY (DESIGN DONE)

**Task:** ARCH-FRONTEND-FRESHNESS-TRANSPARENCY | NEW-FEATURE (lean) | zone: `apps/frontend/` + `apps/mcp-server/`
**4 ratifications:** (FFT-1) FreshnessBadge → `apps/frontend/app/components/FreshnessBadge.tsx` RATIFIED (mirrors InfoCardExpand.tsx; product-domain component, not UI primitive). (FFT-2) useFreshnessRevalidator → `apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts` RATIFIED with FLAG (dev must create `lib/hooks/` dir — does not exist yet). (FFT-3) coverageMapFreshnessChecker → `apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts` RATIFIED with DDD OVERRIDE: injectable is `injectedRows?: CoverageMapRow[]` NOT `coverageMapPath?: string` (domain must not do I/O; file-read stays in scheduler layer). (FFT-4) `data_asof` canonical key RATIFIED (single surface key regardless of internal DB column).
**Key design decisions:** D1=SLA tier constants baked into FreshnessBadge (no runtime fetch). D2=null guard before ClientTimeString (ClientTimeString.iso is non-nullable; guard on dataAsof===null). D3=sector-rotation EC-8: use `generatedAt` (ISO 8601) as dataAsof, not `tradingDate` (date string). D4=qualityChecklist compute-time asof is correct by design; document in handler. D5=`runFreshnessSlaMonitor` gains `injectedCoverageMapRows?` param — backward-compatible. D6=sla_tiers expanded to named-field objects in TS constants.
**Risk flags:** RISK-1 (MEDIUM, DDD override on FFT-3). RISK-2 (MEDIUM, qualityChecklist always-green by design). RISK-3 (LOW, sector-rotation generatedAt vs tradingDate). RISK-4 (LOW, lib/hooks dir missing). RISK-5 (MEDIUM, ClientTimeString null guard). RISK-6 (LOW, L4 perf negligible).
**Multi-zone confirmed:** dev-mcp-server (L2+L4) + dev-frontend (L3A+L3B); PM atomizes into 4 tasks per BA chain.
**Output:** `[Architect] Brownfield Findings` appended to `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md`; decision journal: `docs/agent-memory/decisions/sprint-FRONTEND-FRESHNESS-TRANSPARENCY-architect.md`
**Next:** pm atomizes TASK-FFT-L2/L3A/L3B/L4 and creates developer handoffs.

## 2026-06-27T19:38Z — BCTC-REFINE-STALL-RETRIGGER (THROUGHPUT-DRAIN RE-SCOPE DONE)

**Task:** BCTC-REFINE-STALL-RETRIGGER | Option-B re-scope | zone: `docs/agents/refine_bctc_md/` + `docs/data/cowork-schedule.json` + `apps/mcp-server/`
**T0 (P0 reset-guard, agent-father):** RAW-confirmed clobber — GVR 49 DONE units → 7 after ad-hoc reset=true mis-fire. Fix: after `get_bctc_refined`, if ANY unit has window_status=DONE, force `is_first=false` unconditionally. `is_first = (pushed_ids.size == 0 AND NOT has_done_units)`. Route via agent-md-factory. GVR needs re-drain from unit-0007. T0 MUST ship before T1+T2.
**T1 (P1 chunk size, agent-father):** Safe ceiling = **12** (token-bound: 12×8.9k=107k < Haiku 200k at 75% budget; timeout: 12×39s=468s << 1800s TTL). Edit `slice(0,7)→slice(0,12)` in `flow/main.md` L8+L48 + `init.md` L55+L60.
**T2 (P1 slots, ops):** Add `refine-bctc-slot-3` at 11:00 UTC + `refine-bctc-slot-4` at 16:30 UTC. Both off-market, clear of all existing conflicts. Combined T1+T2: 4×12=48 windows/day (~36-day drain vs 124-day current).
**T3 (P2 watchdog, dev-mcp-server, backlog):** Folds A2+C1. bctcRefineStalenessJob — MUST distinguish deep-but-draining from stalled (compare counts across consecutive 2h checks). Build after T1+T2 verified draining.
**Board hygiene DONE:** Collapsed duplicate BCTC-REFINE-STALL-RETRIGGER from ready[] + active_sprints[] → single active_sprints[] entry with T0/T1/T2/T3 tasks. Both validators exit 0. `head.active_task_id` = BCTC-REFINE-T0-RESET-GUARD.
**Output:** `docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md` (refreshed with THROUGHPUT-DRAIN section); `docs/data/orch/orch-state.json` (applied via orch-apply.sh)
**Next:** pm dispatches T0 → agent-father (via agent-md-factory) as P0 unblocking gate.

## 2026-06-27T19:15Z — BCTC-REFINE-STALL-RETRIGGER (DESIGN DONE)

**Task:** BCTC-REFINE-STALL-RETRIGGER | RECON-FIRST BLUEPRINT | zone: `apps/mcp-server/` + `vps-scripts/` + `.claude/`
**3-track decomposition:**
- Track (a) REFINE-STALL: Option-Y deleted `runBctcRefineJob()` (no Claude CLI in container). Production drain is `refine_bctc_md` cowork agent at 09:00+14:00 UTC via cowork CronCreate. Session restart ~2026-06-07 killed the CronCreate → both slots stopped firing → 47 docs silently accumulated. Immediate fix: `/cron-cowork-team` re-arm (ops, 30s). Structural: new `bctcRefineStalenessJob` server-side watchdog (dev-mcp-server, SPRINT-S).
- Track (b) VIC DISCOVERY-GAP: VIC HOSE-listed (SSC pathway, same as VHM). Root cause not confirmed — 3 candidates: C-1 late filing exhausted 5 enrichment attempts before PDF available; C-2 batch-size cap (20/run) pushed VIC below cutoff; C-3 SSC title-match regex miss. RAW-probe `bctc_vps_queue WHERE action_code='VIC'` required before fix. B1 = manual reset to pending; B2 = structural re-discovery sweep + optional regex fix. Route: dev-mcp-server (B1) + dev-vps-crawls (B2).
- Track (c) OBSERVABILITY-HOLE: `freshnessSlaMonitorJob` has no `refine_pending` signal. No watchdog checks OCR-done-but-refine-stuck count. Definitif fix: new `bctcRefineStalenessJob` (interface/scheduler/financial-reports/) with 2-hourly check on `text_status='COMPLETE' AND refine_status IN ('PENDING','PARTIAL') AND parsed_at < now-24h`; WORK alert on >0 count, escalate at >5. Check 2: probe `cron_job_runs` for last refine_bctc_md run (requires additive wrapRun in agent flow). Route: dev-mcp-server.
**First track under WIP=1:** BCTC-REFINE-A1 (ops re-arm, immediate). Followed by BCTC-REFINE-A2 + BCTC-REFINE-B1.
**Output:** `docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md`
**5 tasks for PM:** BCTC-REFINE-A1 (ops, XS) → BCTC-REFINE-A2 (dev-mcp-server, S) → BCTC-REFINE-B1 (dev-mcp-server, XS) → BCTC-REFINE-B2 (dev-vps-crawls, S) → BCTC-REFINE-C1 (dev-mcp-server, S)
**Risk-1 (HIGH):** Cowork-only drain = single point of failure; Track (c) watchdog is the definitif close on the 20-day blindness class.

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
