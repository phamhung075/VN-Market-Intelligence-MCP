# Architect — Notebook

**Last updated:** 2026-07-02 06:50 UTC | **Sprint:** DASH-CRON-RECHECK-TABLE

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-07-02T06:50Z — ARCH-DASH-CRON-RECHECK-TABLE (SPLIT DONE)

**Task:** ARCH-DASH-CRON-RECHECK-TABLE | SPRINT-M user-prioritized | zone: multi (apps/mcp-server + apps/frontend, explicit BA SPLIT confirmed correct)
**BUILD-STANDARD:** lean (both zones exist)
**5 ARCH-RATIFY items resolved live** (not guessed): CN-1 job_name resolution = hybrid — static 16-pair reverse-map for WATCHDOG_MANIFEST jobs (verified only 1/16 pairs is a literal string match; a pure normalize-and-strip-"Job" heuristic provably fails on `summaryJob:daily`→CRONS-key `summaryDaily` since "Job" sits mid-string not as a suffix) + normalized-DISTINCT-scan fallback for the other ~68 non-manifest crons. CN-2 restricted-window/comma-list cadence = ONE generic algorithm (MIN successive delta across 6 `cron-parser`-sampled upcoming fires) — hand-verified it derives 10min for `vpsProxyWatchdog` (`*/10 2-8 * * 1-5`) and 30min for `restartCadenceAlert` (`15,45 * * * *`) with zero per-expression special-casing. CN-5 Layer-B SSOT = filesystem-read `.claude/commands/crons/*.md` ONLY.
**Real brownfield correction to BA spec (FR-2.1 double-count):** BA named 3 Layer-B sources as disjoint (14 command files + cron-detect-loop's 4 crons + cron-cowork-team's 1 cron) — live read shows `cron-detect-loop/SKILL.md` and `cron-cowork-team/SKILL.md` are re-arm automation docs that VERBATIM-COPY cron values already declared in `cron-dev-team.md`/`cron-system-auditor.md`/`cron-cowork-team.md` (SKILL.md's own text: "SSOT cron values... re-sync if cadence changes there... values below are verbatim copies"). Parsing both would double-count 5 crons. Also found `cron-fb-market-poster.md` is DEPRECATED (2026-06-28 FB-COWORK-FOLD, folded into cowork-team `*/15` dispatcher) with ZERO standalone crons, and `cron-refine-bctc.md` uses a different comment-format header than the other 12 files — a naive single-regex Layer-B parser would silently miscount on both. AC-12's "14 files minimum" corrected to "13 live cron-bearing command files" — flagged to PM/QA, not silently patched.
**New dependency decision:** `cron-parser` added (verified absent from repo entirely, not even transitively via `node-cron` which only depends on `uuid`) — `node-cron`'s public API has no next/prev-fire computation and its internal `convert-expression`/`time-matcher` modules are unexported (unsafe deep-import).
**Perf flag (load-bearing, not optional):** dev-frontend's CN-4 choice (combine into existing loader, reuse the page's existing 5s auto-poll for the RECHECK mechanism) makes Zone-1 static-metadata memoization (cadenceMs/job_name_db resolution computed once per process, not per-request) a HARD requirement — flagged explicitly so dev doesn't skip it under time pressure.
**Output:** `docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md` + `[Architect] Brownfield Findings` → `docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md`
**Next:** pm decomposes 2 dev-* work units (dev-mcp-server ships first; dev-frontend can build against stub).

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

---

## Archive (pre-2026-07-01T07:05Z)

[Older cycles archived to git history: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 (2026-06-30T20:45Z, per-ticker anchor repair migration + writer guard + sanity pass 4), FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS (2026-06-30T19:11Z, VPS VNINDEX skip-guard root cause + TASK-VNINDEX-RS-A/B split), BA-IND-P1-MOMENTUM-FRONTEND, BA-IND-P1-MOMENTUM-RS, MARKET-INDICATOR-DEPTH-P0, HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING, FEAT-NEWS-DECISION-RESUME, FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT + 27 earlier cycles pre-2026-06-28.]
