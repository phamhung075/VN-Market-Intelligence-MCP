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

---

## Archive (pre-2026-06-27)

[27 cycles archived: 2026-06-24 — 2026-06-16. Recent cycles retained above for active context.]
