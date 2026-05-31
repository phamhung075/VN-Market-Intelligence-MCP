# BA — Notebook

**Last updated:** 2026-05-31 | **Sprint:** DWF-PHASE1 (P1-BA)

## DWF-PHASE1-BA · 2026-05-31

Sprint DWF-PHASE1 spec complete. REQ file: `docs/REQ_DYN-WF-PHASE1.md`. Three PO-level open questions (OQ-P1-1..3). Four architect blockers (BLOCKER-1..4). NEXT: architect (P1-ARCH).

Key decisions encoded:
- FR-P1-1: Cadence policy table in `docs/data/cadence-policy.json`. Pure deterministic look-up `(policy_id, calendar_status, signal_backlog_tier, volatility_tier) → interval_minutes`. First-match-wins, `*` wildcard. No LLM classifier (CLAUDE.md §3 hard constraint). Null result = suppress (non-guaranteed only).
- FR-P1-2: `policy_id` + `last_fired` fields additive to cowork-schedule.json slots. Absent/null = legacy cron fallback (backward-compatible). `guaranteed=true` slots use cron floor regardless of policy.
- FR-P1-3: `cowork-match-slots.js` gains `--mode=adaptive` path. Legacy cron for null-policy slots, due-based for policy slots. `last_fired=null` → always due (first-run). Output schema unchanged except two new observability fields.
- FR-P1-4: Calendar suppression — single `is_trading_day` call per tick (not per slot). Holiday/weekend suppresses all non-guaranteed slots. Tool failure → unknown → no suppression (conservative). CRITICAL: suppression must happen BEFORE per-work-item claim OR suppression path must call task_release. This is BLOCKER-1 for architect.
- FR-P1-5: Three-condition freshness downgrade for gatherers: last_regime=unknown AND signal_backlog=0 AND holiday/weekend. Advisory, non-guaranteed only.
- FR-P1-6: Pressure-state staleness gate (30 min / stale_warning) → legacy cron fallback. Degradation is never worse than today.
- FR-P1-7: `last_fired` write after successful spawn only (not on failure). Atomic write pattern. BLOCKER-3: must be single batched patch for all WON_SLOTS (not per-slot parallel — lost-update risk).

Phase-2 regression surface explicitly encoded in NFR-P1-1: leader lock + suffix-free token + published-marker belt must not be touched. Every new insertion point is additive between "leader won" and "fan-out."

Zone: cross-service only (`cowork-match-slots.js`, `cowork-team/flow/main.md`, `docs/data/cowork-schedule.json`, `docs/data/cadence-policy.json`). Zero diff on `apps/mcp-server/`.

TASKS.md updated: P1-BA ✅ + P1-ARCH 🔄 added. Files left unstaged per commit-discipline. NEXT: architect (P1-ARCH).

---

**Last updated:** 2026-05-30 | **Sprint:** BCTC-TRUST-RED (TR-BA)

## BCTC-TRUST-RED-BA · 2026-05-30

Sprint BCTC-TRUST-RED spec complete. REQ file: `docs/REQ_BCTC-TRUST-RED.md`. Blocker B-1 (ACB UUID) is a dev-time blocker, not a PO blocker. Zero PO blockers. NEXT: pm (TR-PM).

Key decisions encoded as requirements:

- FR-TR0-1 (purge): One-time in-container SQL only — NOT committed to migration. ACB UUID must be resolved by dev before running. Pattern: `SELECT id FROM financial_reports WHERE action_code='ACB' ORDER BY sort_key DESC LIMIT 1`.
- FR-TR0-2 (enum): `REJECTED_SANITY` added to `window_status` Zod enum in `pushBctcRefinedUnitTool.ts` + DDL comment in schema. No ALTER TABLE.
- FR-TR0-3 (ingest gate): validateBctcUnit called in push handler before INSERT. BLOCK → write with `window_status='REJECTED_SANITY'`, return `{ok:false, rejected_reason}`. WARN → write with adjusted_confidence, ok:true.
- FR-TR0-4 (publish guard): `checkPublishability(db, reportId)` private helper in `bctcFullTools.ts`. Evaluates PUB-1..PUB-4 in sequence. `refine_status` and `id` must be in `ReportRow` SELECT (already present per code read).
- FR-TR1-1 (DT-1): `bctcSanityValidator.ts` new domain service. Pure function. Cyclic-substring check via doubled ascending/descending cycles. ≥ 2 distinct hits = BLOCK; 1 hit = WARN.
- FR-TR1-2 (DT-2+DT-3): `bctcMagnitudeValidator.ts` new domain service. DT-2 income check + forced-zero balance check. DT-3 revenue contradiction (≥ 3 distinct values with >20% pairwise divergence). Label-match ambiguity → WARN not BLOCK (RISK-3 mitigation).
- FR-TR1-3 (finalize wiring): DT-2/DT-3 called after applyCorrections, before transaction. BLOCK → skip INSERT, set refine_status='REJECTED_SANITY'. CONFIRMED guard (Layer 1) takes precedence.
- FR-TR1-4 (DT-4): logger.warn only. No DB write. No block.
- TR-2: Routed to BCTC-LAYOUT-FIRST as LF-QA acceptance criteria (EC-1/3/4/5/1b). PM must add.

Zone: `apps/mcp-server/src/` only. Zero diff on: HCM-DISAMBIG-extraction.test.ts, pdf-extractor/*, docs/agents/refine_bctc_md/*.

TASKS.md updated: TR-BA ✅ + TR-PM 🔄 added. Files left unstaged per commit-discipline. NEXT: pm (task breakdown).

---

**Last updated (prior):** 2026-05-30 | **Sprint:** BCTC-HUMAN-CONFIRM (HC-BA)

## BCTC-HUMAN-CONFIRM-BA · 2026-05-30

Sprint HC spec complete. REQ file: `docs/REQ_BCTC-HUMAN-CONFIRM.md`. Zero PO blockers. NEXT: architect (HC-ARCH).

Zone: `apps/mcp-server/` only (additive). No pdf-extractor, no Remix, no PEK subtree.

Key decisions resolved as requirements:
- D1 (flag enumeration): scan `bctc_refined_units.markdown` at request time using existing `parseTrustFlag` regex — no separate flags index; join to `bctc_table_rows` by `(report_id, page_number, label)` for `row_id` anchor.
- D2 (corrections table): new `bctc_human_corrections` with `UNIQUE(report_id, row_id)` — INSERT OR REPLACE for idempotency; `old_value` snapshot captured; per-cell pin survives cron re-run.
- D3 (flow-back): re-parse-with-overrides is the requirement; `refinedMarkdownParser.ts` stays single point. ARCH-DECIDE A = override injection mechanism (post-pass patch vs in-parser parameter). Direct row patch forbidden.
- D4 (lock semantics): report-level lock in `financial_reports.confirm_status` skips entire cron refine. Per-cell pin = Layer 2 safety for partial confirmations. Reset button required in viewer.
- D5 (status dimension): new columns `confirm_status / final_confirmed_at / confirmed_by` on `financial_reports` — separate from `refine_status`, idempotent ALTER TABLE migration.
- D6 (ESC-5): write-back sets `bctc_table_rows.source_confidence = 1.0` for corrected rows. `bctc_table_rows` needs new `source_confidence` column (additive migration, default 1.0).

Critical schema gap identified: `bctc_table_rows` has no `source_confidence` column today — must be added in this sprint (FR-4). Existing rows default to 1.0 (non-breaking).

ARCH-DECIDE B (row re-anchoring): after a full re-parse deletes + re-inserts `bctc_table_rows`, correction records become stale by `row_id`; stable re-anchor key = `(report_id, label, page_number, statement_section)` — Option B2 recommended.

10 DV tests specified (DV-HC-1..DV-HC-10), all bun:sqlite in-memory. RED before/GREEN after same commit mandatory.

HC-BA → DONE. TASKS.md updated (HC-BA ✅ + HC-ARCH added). NEXT: architect (HC-ARCH). PIPELINE: continue.

---

## BCTC-AGENTIC-REFINE-BA · 2026-05-30

Sprint BCTC-AGENTIC-REFINE spec complete. REQ file: `docs/REQ_BCTC-AGENTIC-REFINE.md`. Zero PO blockers. NEXT: architect (AR-ARCH).

Zone split CONFIRMED:
- `apps/pdf-extractor/`: dev-pdf-extractor — `page_rasterizer.py`, `OcrTextSourcePort` interface (Mistral-swappable), remove YOLO+grouper+boundary machine. FR-1/2/14.
- `apps/mcp-server/`: dev-mcp-server — 3 MCP tools (`get_bctc_page_text`, `get_bctc_page_image`, `get_bctc_refined`) + `bctc_refined_units` table + deterministic markdown→rows parser + refine orchestration/cron. FR-3/4/5/9/10/11/12/13.
- `docs/agents/`: agent-father — `refine_bctc_md` agent `.md` (FR-6/7 model tier + caching).

Key decisions encoded:
- FR-5 (selective image loading): measurable rule `classify_page_for_image_load(ocr_text, prev_page_was_image) -> bool` — image required when text contains table structural tokens (`|`, digit sequences, Vietnamese column headers) OR when page is in continuation window. Target image-load ratio < 60% of pages.
- FR-6: Refine model = Haiku or Sonnet (NOT Opus). Architect picks based on FPT bake-off accuracy/cost.
- FR-7: Prompt caching for system prompt across pages within a report session.
- FR-8: `BCTC_RASTER_DPI` env var; architect bake-off at 100/120/150 DPI; lowest reliable becomes default.
- FR-10 (deterministic parser): single point of correctness for expert passes. Vietnamese trust flags `[ĐỘ TIN CẬY THẤP — ...]` → `confidence=0.2`; `[độ tin cậy thấp]` → `confidence=0.4`. DV test AC-FR10-4 mandatory RED-before/GREEN-after.
- FR-13 (refine contract): numbers←OCR text / structure←image / disagreement→FLAG never guess. Balance check is catch-net only — FORBIDDEN as sole gate.
- FR-12 (orchestration): `refine_status` field added to `financial_reports` (PENDING/IN_PROGRESS/DONE/FAILED); readiness gate skips IN_PROGRESS/PARTIAL without error.
- FR-15 (bake-off DoD): QA reports token-per-report (FPT 46pp + ACB 33pp), image-load ratio, continuation correctness FPT[22,23], zero silent discrepancies.

5 architect-deferred decisions (NOT blockers): D1 min DPI, D2 Haiku vs Sonnet, D3 page-image cap, D4 page-window hint survival, D5 `/api/rasterize` contract.

AR-BA → DONE. TASKS.md updated. Files left unstaged. NEXT: architect (AR-ARCH).

---

**Last updated (prior):** 2026-05-30 | **Sprint:** DATA-PIPELINE-INTEGRITY (DPI-BA)

## DATA-PIPELINE-INTEGRITY-BA · 2026-05-30

Sprint DPI spec complete. REQ file: `docs/REQ_DATA-PIPELINE-INTEGRITY.md`. Zero PO blockers. NEXT: architect.

Key technical findings (code-confirmed, not re-diagnosed):

- DPI-1 root seam: `apps/macro-indicators/pkg/infrastructure/repositories.go` — `SBVRateRepository` is fixture-only (returns 24500). `SQLiteCommodityRepository.FetchPrices` reads `commodity_prices WHERE source='yahoo'` for USDVND=26255. `get_cycle_bootstrap` path reads `sbv_rates.usd_vnd_official`=26115 via `marketContextBuilder.ts`. Fix = add `SBVRateSQLiteAdapter` implementing `SBVRatePort` to read `sbv_rates`, wire in `cmd/server/main.go` composition root. NEVER add new HTTP calls from macro-indicators.
- DPI-2 root: `usecases.go` L45 `const fixtureComputedAt = "2026-05-23T00:00:00Z"` — hardcoded constant, no scheduler. 2-line fix: replace with `time.Now().UTC().Format(time.RFC3339)` inline at call site. Tests asserting exact string must be updated to accept any RFC3339 timestamp.
- DPI-3 root: `yahooFinance.ts storeCommoditySnapshot()` L410-415 hardcodes `change_amt=0, change_pct=0` on both INSERT and ON CONFLICT update. `commodity_prices_history` holds hourly history (prev-close source). Fix = read prev-close from history before upsert, compute delta, set both columns. Confined to `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts`.
- DPI-4 root: `ohlcvForeignFlowStore.ts` L31 UPDATE-only, silently skips when OHLCV row not yet created. Fix = INSERT…ON CONFLICT UPSERT, creates stub row with NULL OHLCV cols if needed. Schema already nullable — no migration. Flag for architect: verify OHLCV write path also uses UPSERT to overwrite stub row cleanly.
- Zone split confirmed: DPI-1/DPI-2 dev-macro-indicators only; DPI-3 fix lives in dev-mcp-server (data seam) though surface is macro-indicators; DPI-4 dev-mcp-server only. Parallel dev permitted. Rebuild order preference: mcp-server first, then macro-indicators (DPI-3 data dependency).

DPI-3 ownership clarification: fix file is `yahooFinance.ts` (mcp-server zone) but the visible surface is `get_macro_snapshot` (macro-indicators). Architect must assign DPI-3 to dev-mcp-server, not dev-macro-indicators.

> Archive: `docs/archive/notebooks/ba-2026-05-21.md`

## BCTC-TABLE-BOUNDARY-BA · 2026-05-29

Sprint BCTC-TABLE-BOUNDARY spec complete. REQ file: `docs/REQ_BCTC-TABLE-BOUNDARY.md`. Zero PO blockers. NEXT: architect (BTB-ARCH).

Key decisions encoded:
- FR-1: `_flush_unit` majority-vote dominant_type REPLACED by schema-page-type assignment (first non-blank page type). A unit that opens as table stays table only until first D-2 page — that page triggers END.
- FR-2: Intervening-prose break added to `build_document_map` loop: a D-2 page between two D-1 pages forces a unit break even when the two table pages are geometrically identical.
- FR-3: Title-band break added to `_fingerprints_continuous`: a standalone title in top 20% of page text (non-numeric, followed by D-1 fingerprint) forces `False` return. "(tiếp theo)" is the INVERSE signal (continuation, not new).
- FR-4: Blank-page bridge (~L2664) gated: blank bridges into current unit ONLY when next non-blank page satisfies D-4. Blank followed by D-2 or D-5 does NOT bridge into the table unit.
- FR-5: Output contract — every `page_type="table"` unit in `bctc_layout_units` must have only D-1 pages in `page_numbers_json`. Verified by direct DB read, never viewer.

Acceptance gate: two real-data sentinels (FPT Q4 `e71f845d-ffa5-48f9-8f09-30ac2cd09c65` + second corpus doc) + DV-1/DV-2 deliberate-violation tests (must go RED pre-fix, GREEN post-fix). FPT Q4 continuation p7-9 must survive as single unit (regression guard for the fix that broke continuation).

Constraints for handoff: edits confined to `generic_md_table_extractor.py` + `extract_layout_first_usecase.py`; PDF-Extract-Kit PRISTINE; `text_table_extractor.py` 0-byte-diff; main branch; off-hours re-extract only.

## VNH-SECTOR-FIX-BA · 2026-05-29T17:00Z

Sprint VNH-SECTOR-FIX spec complete. REQ file: `docs/REQ_VNH-SECTOR-FIX.md`. Zero PO blockers. NEXT: dev-mcp-server.

Key decisions encoded:
- FR-1: VNH `domain` value corrected `real_estate` → `agriculture` (DomainType union member; SECTOR_NAME_VI = "Nông nghiệp & Thủy sản"; peers VHC/ANV confirmed in sectorPeers.ts:118-126).
- FR-2: Three comment-only fixes (TCH = Hoang Huy NOT Techcombank; DPM = Đạm Phú Mỹ fertilizer NOT Daphaco; DAG = Đông Á Plastic NOT Da Nang Rubber). Values stay unchanged.
- FR-3: Explicit idempotent `UPDATE watchlist SET domain='agriculture' WHERE code='VNH' AND domain != 'agriculture'` required for live DB — UPSERT-alone false-green path explicitly forbidden.
- FR-4: `WatchlistSeedEntry.domain` type-tightened from `string` to `DomainType` (import from `../../../bctc-schema.js`). Compile guard prevents future wrong-enum insertions.
- FR-5: Guard test `VNH-sector-fix.test.ts` — 5 cases including fleet-wide "every seed domain in DomainType union" regression guard (derive allowed values from DomainType, NOT static string array).
- FR-6: Container rebuild required post-code-change; direct DB query verification mandatory.
- Edge case: DPM appears in sectorPeers.ts agriculture array (line 119) as a peer — that is PEER list, not seed domain. DPM seed domain `chemicals` is correct, leave it.
- Edge case: VNH is in the `// Real Estate (high-vol)` block comment region — developer must either move entry to agriculture section or update section note.

## MACRO-LIVE-PRICES-BA · 2026-05-28T00:00Z

Sprint MACRO-LIVE-PRICES spec complete. REQ file: `docs/REQ_MACRO-LIVE-PRICES.md`. Root cause code-confirmed against live Go source.

Key findings:
- `HTTPCommodityFetcher.FetchPrices()` in `pkg/infrastructure/repositories.go` returns hardcoded `{OIL:82.5, GOLD:2350, USDVND:24500}` unconditionally — deliberate sandbox security contract comment, not a bug-in-waiting. Never fires live network calls.
- `resolveMarketPrices()` in `usecases.go` calls the port; fixture fallback only fires on zero/error. Since the fixture fetcher always succeeds, fixture values pass as "live."
- Live commodity data already written to `commodity_prices` table (source=yahoo, cols: brent_crude_usd, gold_usd_per_oz, usd_vnd_rate) by mcp-server's `commodityTrackerRefreshJob` (Yahoo Finance, daily 06:00 UTC). market_data named volume is shared. macro-indicators is NOT reading it.
- VN-Index precedent (MACRO-SEED-WIRING): `SQLiteMarketIndexRepository` reads `market_prices WHERE code='VNINDEX'` from shared market.db. Same pattern is the recommended solution for oil/gold/usdvnd (Option A).

Data-source options A/B/C laid out for architect. Option A (DB read) is recommended — no new network calls, no geo-block risk, reuses Yahoo data already in DB. Option B (direct Yahoo HTTP from macro-indicators) triggers SPRINT-M re-size if geo-block confirmed. Option C (SBV XML for usdvnd only) is deferred scope.

HARD requirements: env gate `COMMODITY_LIVE_MODE` (fixture/live selector); QA-GATE-1 mandates E2E verification through `get_macro_snapshot` MCP tool (not direct curl to :5004). 12 test cases specified (T-MLP-1..T-MLP-12). All existing Go tests must remain green with `COMMODITY_LIVE_MODE` unset.

Sprint size: SPRINT-S conditional on architect choosing Option A. Re-size to SPRINT-M if Option B + geo-block confirmed. TASKS.md updated with MLP-BA/ARCH/DEV/OPS/QA/EXIT tasks. NEXT: architect. PIPELINE: continue.

## RECAP-CMD-BA · 2026-05-28

Sprint RECAP-CMD spec complete. REQ file: `docs/REQ_RECAP-CMD.md`. Three commands decomposed: `/recap` (7 sections from `EveningSummary` — VN-Index, movers, news, alerts, portfolio P/L, foreign flow, header), `/recapw`+`/recapm` (5 sections from `PeriodicSummary` — header, totals, key events, stock moves, alert breakdown). All Vietnamese section labels locked. `summaryText` / `recommendation` / numeric `impact` BANNED from output. `stripHtml` coordinated with NEWS-FULLDAY — reuse, do not duplicate. Handler signatures async, returning `{ texts: string[] }`, router wiring mirrors `/news` branch. Test matrix: T-RECAP-1..7, T-RECAPW-1..4, T-RECAPM-1..3, T-RECAP-RT-1..4. Two architect-deferred items: B1 (section-block overflow split for blocks > 4096 chars), B2 (test injection strategy: wrapper fn vs real assembly with in-memory DB). No PO blockers. TASKS.md RECAP-BA → DONE/REVIEW. Files left UNSTAGED. NEXT: po (spec-review gate). PIPELINE: continue.

## NEWS-FULLDAY-BA · 2026-05-27

Sprint NEWS-FULLDAY spec complete. REQ file: `docs/REQ_NEWS-FULLDAY.md`. Three defects decomposed into testable ACs: FR-1 (full-day coverage — remove silent DEFAULT_LIMIT=20), FR-2 (dedup key = normalized source_title, 5-step normalization, highest-impact survivor), FR-3 (stripHtml — module-level export, dependency-free, called before dedup and before 200-char truncation). Test matrix T-NEWS-9..12 + T-STRIP-1..7 added to spec. Two architect-deferred items: B1 (LIMIT removal vs large ceiling), B2 (fallback cap value). stripHtml scoped as shared helper for RECAP-CMD convergence. No PO blockers. TASKS.md NEWS-FD-BA → DONE/REVIEW. Files left UNSTAGED. NEXT: po (spec-review gate). PIPELINE: continue.

## SIG-IMPL-GATE-BA · 2026-05-27T21:30Z

Sprint SELF-IMPROVE-GATE Phase 2 decomposition complete. REQ file: `docs/REQ_SIG-IMPL-GATE.md`. 5 dev tasks + 1 QA task, 36 minimum new unit tests. Files left UNSTAGED per commit-discipline. NEXT = architect technical blueprint (SIG-IMPL-GATE unblocked).

Key decisions encoded:
- TASK-5 (C-4 per-path kill-switch) is standalone with explicit REJECT clause for single-global-flag anti-pattern in AC-T5-4.
- TASK-4 (D-IMPROVE bridge) fail-loud-skip isolation from TASK-3 pipeline is AC-T4-6 (C-5 hard requirement).
- TASK-6 (QA gate-proof) has AC-T6-5: if gate doesn't go red → lane demotion to lane-A, must be recorded explicitly (feedback_fence_false_green).
- C-1 structured `target_agent`/`target_files[]` in AC-T4-1..3 with UNRESOLVED fallback for `_default` entries.
- SPIKE §12 AC-1..AC-8 fully mapped to TASK-2/TASK-3 ACs.
- Cron collision detail for architect: `bctcOverdueCheck='0 9 * * 1-5'` (weekdays) vs new `'0 9 * * *'` (daily) — same minute. Surfaced as detail; not a blocker.
- Two open design points for architect: (i) per-path kill-switch keying scheme with a TypeScript suggestion; (ii) proposal-doc slug derivation + fix_area→target_agent mapping. Neither requires PO input.
- Zero PO blockers.

## NEWS-CMD-BA · 2026-05-27T20:00Z

Sprint NEWS-CMD decomposition complete. REQ file: `docs/REQ_NEWS-CMD.md`. Files left UNSTAGED per commit-discipline. NEXT = PO approval gate; architect NEWS-CMD-DESIGN BLOCKED until PO approves.

Key findings from codebase verification:
- `handleTelegramCommand` switch in `telegramCommands.ts` is the correct and only insertion point. `/news` grep-clean confirmed.
- `webhookHandler.ts` reply path confirmed: sends ONE `CommandResult` per command — chunking mechanism is a real design decision for architect (B1).
- `rag_analyses` table has `summary` column (NOT exposed by `newsFetchLiveHandler.ts` — that handler only exposes `source_title`, not `summary`). The BA spec explicitly includes `summary` as the one-line gist field.
- `midnightVietnamAsUtc()` pattern exists in `assembleEveningSummary.ts` — replicable inline in `telegramCommands.ts`; must NOT be imported (infrastructure file must not import from application layer).
- `newsFetchLiveHandler.ts` orders by `created_at DESC`; the correct order for `/news` is `impact_score DESC, created_at DESC` (established by `assembleEveningSummary.ts`).

Two architect-deferred design points (B1 = chunking mechanism: Option A multi-text CommandResult vs Option B single-message conservative cap; B2 = fallback window definition + header wording). No PO blockers.

## PEK-BA · 2026-05-26T21:00Z

Sprint PEK-INTEGRATE decomposition complete. REQ file: `docs/REQ_PEK-INTEGRATE.md`. Handoff appended: `docs/handoffs/TASK_PEK-INTEGRATE.md`. Files left UNSTAGED per commit-discipline. NEXT = PO approval gate; architect PEK-DESIGN BLOCKED until PO approves.

Key decisions encoded as requirements:
- REQ-PEK-0: Pristine invariant baked in as a hard CRITICAL requirement — 3 git-diff ACs so QA can prove it at close.
- REQ-PEK-1: Trimmed task set (layout+table+ocr, no formula) + table model pick flagged as architect-deferred (a); StructEqTable = biggest RAM risk, explicitly named.
- REQ-PEK-2: 8GB hard ceiling + CPU-only + no-kernel-panic encoded as testable ACs (RSS capture by ops, fleet running simultaneously). Topology decision flagged as architect-deferred (b).
- REQ-PEK-3: Docker hygiene gap explicitly named (COPY . . + missing .dockerignore entry) — architect decision (c) must fix; weight-cache lifecycle AC included.
- REQ-PEK-4: Lazy-load + per-process RSS cap encoded as 4 ACs; architect decision (d) must specify the init pattern and cap value.
- REQ-PEK-7: Scale-pilot done-bar applied — 5 prior false-greens; direct market.db arbiter clause, NOT-RUN ≠ green, corpus pass-rate (not one doc). FPT Q4 2025 sentinel values baked in as a regression anchor.
- REQ-PEK-8: LF-OVERLAY reuse flagged as a PRESERVATION requirement — architect must reference the §3 contract from the LF-DESIGN brief and not reinvent a parallel overlay schema.
- 4 architect-deferred decisions correctly left open with RAM-number gate. No PO blockers.

## LF-BA · 2026-05-26T18:30Z

Sprint BCTC-LAYOUT-FIRST decomposition complete. REQ file: `docs/REQ_BCTC-LAYOUT-FIRST.md`. Handoff appended: `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md`. Files left UNSTAGED per commit-discipline. NEXT = PO approval gate; architect LF-DESIGN BLOCKED until PO approves.

Key decisions encoded as requirements:
- REQ-LF-0: AC-0 generic-by-construction — geometry is the spine, anchors are hints only; grep-proof clause baked into ACs.
- REQ-LF-1: Root-cause fix named requirement — FPT Q1 2026 page 5 scramble fixed by Tier-0 logical-unit grouping (schema inheritance path). Page 41 anchor-overload case encoded as a testable AC.
- REQ-LF-4: Tier-3 invariant gate as anti-false-green mechanism; DIRECT market.db arbiter clause (never the endpoint); quarantine path required.
- REQ-LF-7/8: Deliverable 2 split at service boundary — pdf-extractor emits JSON, mcp-server renders toggle. 3 architect-open questions flagged (schema, JSON contract, quarantine storage).
- No PO blockers. All 6 PO decisions (A-F) pre-resolved.
- Done-bar encoded as 7-point gate including user verbal G9.

## c250 · 2026-05-22T05:10Z

Sprint 1968d decomposition complete. 3 handoff files emitted (P01/P02/P03). 3 TASKS.md rows added. Signal: `docs/signals/ba-1968d-spec-ready.json`. NEXT: po spec review.

Key decisions:
- P01 (L-10 delta-read): 2-file scope (skill + qa/developer flows). Backward compat via full-read fallback on missing anchor or >24h stale. Anchor format `## §N-slug`.
- P02 (L-12 notebook diff-write): 1-file scope (skill only). 3-cycle retention, prune oldest via Edit, blank-state fallback. 200L file bound post-write.
- P03 (L-14 zone caveman): 1-file scope (caveman skill only). Additive-only, no base-tier modification. BCTC zone entry marked FROZEN-NFR3. Gated on P01+P02 QA APPROVED — anchor convention from P01 may appear in P03 examples.
- All 3 tasks: owner=agent-father, zone=`.claude/` only, no apps/* collision with active 1971/1970/1972. WIP cap honored.
- No PO blockers identified.

## c1 · 2026-05-21T20:20Z

Sprint 1967 orchestration audit decomp. REQ_1967.md written. 7 atomic REQs, NFR-1..5, 0 PO blockers.
Signal: `docs/signals/ba-1967a-spec-ready.json`.

Key decisions:
- Surface 4f + 6b flagged as cross-sprint with 1968 L-3/L-1/L-2 — evidence input only.
- Superseded architect brief treated as supplementary evidence.
- Glossary section added (race, idempotency, recursive spawn, dispatcher-wrap, CAS, dead-handoff, stale-race).

## Known patterns / preferences

- Always read strategyRegistry.ts + backtestEngine.ts together (tightly coupled).
- globalSourceTracker is globalThis singleton — test isolation: check _resetGlobalSourceTracker() in beforeEach.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- SBV portal DOWN; rates from VCB XML proxy — tier 2.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- TASKS.md: always check wc -l before adding rows. Current ~150L post-1968d rows.

## Carry-over (next session)

- 1968d agent-father wave 1 in flight after PO approval — watch for qa-1968d-p01-done.json + qa-1968d-p02-done.json to gate P03 dispatch
- 1967b architect brief — surfaces confirmed, awaiting PO approval signal
- 1948e-fix: `"legal_risk"` to SignalTypeSchema enum + stage-signals.md dispatch block (6h dedup guard)
- 1909b (get_bctc_ocf): sequence AFTER 1890a-B — shared agentBootstrap/SKILL_MANIFEST merge risk
