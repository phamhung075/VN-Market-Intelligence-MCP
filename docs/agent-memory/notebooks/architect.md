# Architect — Notebook

**Last updated:** 2026-07-01 18:20 UTC | **Sprint:** FIX-BCTC-BANK-SUMMARY-MAPPING

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-07-01T18:20Z — ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING (AC-1 SPIKE DONE, zone re-pinned)

**Task:** ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING | 3rd re-fire recurrence-escalation | zone: apps/mcp-server/ (revised from sprint default `dev-pdf-extractor`)
**BUILD-STANDARD:** not-applicable (bug-fix, in-zone, no new primitives)
**Method:** `mcp__gateway__call_tool` unreachable this session — substituted `docker exec` against the SAME named-volume market.db + direct serve-path source read (equally RAW, more code-verified).
**§3.2 REVISED (not simple-confirm):** extended probe found "Tổng tài sản" grand-total row absent from `bctc_table_rows` for BOTH CTG (20/55 null-code) AND VCB (0/57 null-code, held up as "clean") — bank-form-generic gap, not CTG-only. VCB's currently-correct total_assets traced NOT to the row-based bank mapper but to a lucky match in the separate non-bank-aware initial flat-text extractor (`balanceSheetExtractor.ts`), frozen in place by `finalizeBctcRefineTool.ts`'s documented Case-2 "skip-when-null, preserve prior" logic. `bctcScalarAggregator.ts` (the sprint's named suspect) is sound but upstream-starved, not broken.
**§3.3 CONFIRMED** — guard exists only in `get_financial_summary`; zero guard code in `get_bctc_full`/`compare_financials`, ratifies BA's never-fired classification.
**Zone re-pin:** `bctc_md_tables` (pdf-extractor→mcp-server bridge table) is NULL for both CTG/VCB current report_ids — rows arrived via the in-repo agentic-refine pipeline (`bctcRefineJob.ts` + `refinedMarkdownParser.ts`), not pdf-extractor's OCR. Overrides sprint's `route_to: dev-pdf-extractor` default — no dev-pdf-extractor task should be minted.
**SPLIT — 5 units, dev-mcp-server only, W1∥W2∥W3∥W4 → W5:** W1 identity-serve-guard coverage (ships first, independent) · W2 generic markdown row-repair (pattern-based on ROMAN_SECTION + trailing-number signature) · W3 section-boundary-contamination guard (reuse FM-VCB-1 fix) · W4 bctcScalarAggregator fixtures incl. synthetic 3rd bank (AC-9) · W5 truthful validation_status + **operational re-ingest of CTG report_id 96e36139…** (code fix alone won't unfreeze total_assets=0).
**Output:** `docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md` + `[Architect] Brownfield Findings` → `docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md`
**Next:** pm decomposes W1-W5, no dev-pdf-extractor task.

## 2026-07-01T07:05Z — BA-PREDICTION-EVIDENCE-REVIVAL (SPLIT DONE)

**Task:** BA-PREDICTION-EVIDENCE-REVIVAL | SPRINT-M | zone: multi (apps/mcp-server + docs/agents)
**BUILD-STANDARD:** not-applicable (bug-fix/refactor + docs-only flow wiring, no new microservice)
**4 live corrections to BA/PO spec:** `detectAccumulationStreaks` lives in `insiderCheckJob.ts` not `leadershipSignal.ts`; tools_package filenames are `<agent-id>.md` (news-scout/bctc-analyst/market-watcher) not news-analysis/financial-analysis/report-analysis/market-analysis.md (don't exist); real seeded evidence_type set is bctc_roe_ratio/roe_strong/valuation_premium/regulatory_compliance/report_overdue + price_momentum_5d + news_sentiment_stock/macro — NOT bctc_revenue_growth/pe_ratio/debt_equity (never seeded, tool-docstring examples only); FR-2.2 probe DONE live at design time (not deferred to dev).
**FR-2.2 live-verified verdict:** SILENT BUG confirmed — `insider_transactions`=0 rows ever, `insiderCheckJob` reports status=success/rows_written=0 every run for ~2mo, root cause = VPS proxy 502 (congbothongtin.ssc.gov.vn upstream failing from the VPS itself). Fix scoped IN-ZONE per PO no-scope-balloon: extend `vpsProxyWatchdogJob.ts` with a 5th insider-freshness reader (makes the failure visible); decouple the actual VPS/SSC connectivity chase to a new BACKLOG item (needs live VPS SSH, may be an unfixable external-portal outage).
**SPLIT — 2 parallel-safe hops, no file overlap:** Hop1 `apps/mcp-server` (dev-mcp-server): FR-1.1 `get_evidence_summary` direction+horizon fix (reuse `getLikelihoodRatios`, no interpolation) + FR-2.2 watchdog extension + FR-1.2 cadence weekly→daily (2-file coupling: `cronConfig.ts` + `WEEKLY_CADENCE_MS`/`shouldSkipRecoveryReplay` must move together or the upgrade silently no-ops). Hop2 `docs/agents` (agent-father, NOT dev-* — zone absent from system-map.json): FR-2.1 producer wiring (corrected seeded types) + FR-3 strip false Sharpe hard-gate language from `digest-predict/init.md`.
**Output:** `docs/architecture-briefs/2026-07-01-BA-PREDICTION-EVIDENCE-REVIVAL.md` + `[Architect] Brownfield Findings` → `docs/handoffs/BA-PREDICTION-EVIDENCE-REVIVAL.md`
**Next:** pm decomposes into TASK hop1 (dev-mcp-server) + TASK hop2 (agent-father), no `blocks_on`.

## 2026-06-30T20:45Z — OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 (DESIGN DONE)

**Task:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM | BUG-FIX | zone: apps/mcp-server/ + scripts/migrations/
**BUILD-STANDARD:** not-applicable (bug-fix, no new microservice)
**Root cause confirmed:** CONTAM-6 predicate `(open<100 OR low<100) AND close>=1000` misses whole-row class where ALL fields < 1000. `normalizeOhlcvToVnd` only fires at max(OHLC)<100; `detectAndNormalizeScaleFromPrevClose` blind when entire series contaminated (prevClose also dirty → ratio≈1).
**A (repair migration):** per-ticker anchor (most recent clean bar close>=1000 in last 180d). Candidate: `anchor/row.close >= 100 AND row.close < 1000 AND close > 0`. Exclude INDEX_TICKERS. Dry-run + human-confirm + BEGIN IMMEDIATE txn. New file: `scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts`.
**B (reflow):** NONE needed. RS/ROC/52w = computed-on-read by Go TA microservice (source_tier=3 confirmed in tool code + schema has zero materialized RS cols). Post-repair gateway probe only.
**C.1 (writer guard):** Add `fetchCleanReferenceCloseMap` (full-history `close>=1000` batched query) in `ohlcvWriteService.ts`. Use as `effectivePrevClose` when standard prevClose < 1000. Domain function `normalizeOhlcvToVnd` unchanged (stays pure). C.2: Pass 4 in `ohlcvSanityCheckJob.ts` — per-ticker anchor divergence scan flagging whole-row close<1000 class; index tickers excluded; joins existing hits[]/BUG Telegram path.
**PM decomposition:** 4 tasks: CONTAM-10-MIGRATION / CONTAM-10-WRITER / CONTAM-10-SANITY (parallel) + CONTAM-10-EXEC (sequential: blocks on MIGRATION QA-PASS).
**Key risk:** RISK-1 [HIGH] anchor picks contaminated bar if recent 180d window entirely contaminated — mitigated by dry-run per-ticker report showing anchor_close values for human review.
**Output:** `docs/architecture-briefs/2026-06-30-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000.md` + `docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md`

---

## Archive (pre-2026-06-30T20:45Z)

[Older cycles archived to git history: FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS (2026-06-30T19:11Z, VPS VNINDEX skip-guard root cause + TASK-VNINDEX-RS-A/B split), BA-IND-P1-MOMENTUM-FRONTEND, BA-IND-P1-MOMENTUM-RS, MARKET-INDICATOR-DEPTH-P0, HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING, FEAT-NEWS-DECISION-RESUME, FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT + 27 earlier cycles pre-2026-06-28.]
