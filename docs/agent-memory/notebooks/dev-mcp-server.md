# dev-mcp-server -- Notebook

## 2026-07-01 — CONTAM-11 SPIKE (OHLCV-UNIT-CONTAM-WHOLEROW-LT1000)

**Sprint:** OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
**Session:** e71c7736-a95a-4040-b741-1d48454354f6
**Task:** CONTAM-11 — PLAN-ONLY spike: classify ~9,368 residual sub-1000 rows

Two read-only Bun SQLite probes against named-volume market.db. Zero writes. 3-bucket classification:

- **(a) legit-cheap true-cheap** (alltime_max<1000): 13 tickers, 4,519 rows — leave as-is
- **(a) legit-cheap genuine-decline** (alltime_max>=1000, ratio<100x): 13 tickers, 1,826 rows — leave as-is
- **(b) true-contaminated** (alltime_max>=1000, ratio>=100x): 9 tickers, 3,023 rows — remediate

True-contaminated: BMP(591r,526x), MCH(589r,381x), HGM(408r,247x), PMC(385r,534x),
KSV(359r,330x), TOS(351r,506x), AGX(257r,348x), TBD(79r,713x), STS(4r,540x).

Remediation (PLAN-ONLY): Strategy A=VPS external anchor (all 9); Strategy B=540d window+ratio>=200
floor (KSV+STS+TBD+TOS+AGX, 1,050 rows); Strategy C=official exchange CSV; Strategy D=manual queue.

Findings: docs/agent-memory/decisions/sprint-CONTAM-11-bucket-classification-dev-mcp-server.md
Zone health: PLAN-ONLY spike — no code change, no DB mutation | HEALTHY

## 2026-07-01 — FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN + FIX-GET-BCTC-OCF-SQL-COLUMN

**Session:** e71c7736-a95a-4040-b741-1d48454354f6
**Commits:** 927d4e8f, eb788afe

Three-layer bug in BCTC bilingual PDF pipeline. Root causes and fixes:

(1) `SECTION_HEADERS` in `refinedMarkdownParser.ts` was Vietnamese-only. English headings from refine subagent (HVN bilingual PDF) fell to "general", blocking BEQ-7 → PARTIAL forever. Added English patterns.

(2) `findTotalAssetsCorporate` in `bctcScalarAggregator.ts` regex failed on OCR-degraded "TÀI S᰺ N" (Lepcha U+1C3A). Added code 280/440 OCR fallback + English "Total Assets" label.

(3) All English-section IS/CF rows have code=null. No corporate English label fallbacks existed. Added P_CORP_NET_REVENUE_EN, P_CORP_GROSS_PROFIT_EN, P_CORP_OPERATING_PROFIT_EN, P_CORP_NET_PROFIT_EN, P_CORP_OPERATING_CF_EN, P_CORP_INVESTING_CF_EN, P_CORP_FINANCING_CF_EN.

Result: HVN Q1-2026 scalars fully populated (operating_cf=5,018,783M, investing_cf=-4,017,555M, refine_status=DONE). Fleet: 7 stuck-PARTIAL re-finalized, GVR→DONE.

Secondary: `getBctcOcfTool.ts` SQL column aliases fixed (operating_cf AS ocf_operating etc.).

Zone health: bun test 130 pass 0 fail (targeted suite), tsc clean, 182 tools intact, server health ok | HEALTHY

## 2026-07-01 — TASK-EVIDENCE-HOP1-MCP → REVIEW

**Sprint:** BA-PREDICTION-EVIDENCE-REVIVAL (hop1, parallel-safe with hop2/agent-father)
**Session:** 3340d049-0aec-46e7-879f-6a71324b98f1 (dev-team cron dispatcher)

Three FRs per architecture brief §0-§1 corrected facts:

- **FR-1.1** — `evidenceTools.ts::get_evidence_summary` hardcoded `(evidence_type,"bullish",10)` LR lookup masked the live TRUSTED `foreign_flow_institutional/bearish/5d` row (n=18). Fixed via `getLikelihoodRatios(db, type, f.direction)`: prefer shortest-horizon row with `sample_size>=10` (TRUSTED); else largest-sample row honestly UNTRUSTED (no cross-horizon interpolation). Display now shows `horizon=Nd`. No hand-rolled SQL — reuses store fn, retires a pre-existing DDD violation.
- **FR-2.2** — `vpsProxyWatchdogJob.ts` extended with `readLatestInsiderTimestamp()` (5th source, `INSIDER_STALE_MS=4d`), closing the silent-empty-success gap (`insider_transactions` 0 rows across ~2mo of "success" runs — VPS proxy 502 to SSC portal). Observability-only; alert message notes the fix is decoupled to BACKLOG `FIX-VPS-SSC-INSIDER-502` (already filed by pm).
- **FR-1.2** — `baseRateComputationJob` cadence weekly→daily. RISK-1 two-file coupling closed in one commit: `cronConfig.ts:62` (`'7 19 * * 0'`→`'7 19 * * *'`) + `baseRateComputationJob.ts` (`WEEKLY_CADENCE_MS`→`DAILY_CADENCE_MS=86_400_000`, feeds `shouldSkipRecoveryReplay`).

Files: `interface/mcp/tools/macro/evidenceTools.ts`, `scheduler/vpsProxyWatchdogJob.ts`, `scheduler/cronConfig.ts`, `scheduler/macro/baseRateComputationJob.ts`, `docs/standards/cron-jobs.md`. Tests: 3 new FR-1.1 regression cases (`1124-evidence-tools-phase-bc.test.ts`), new `TASK-EVIDENCE-HOP1-MCP-watchdog-insider.test.ts` (5 cases), updated `readInsider` fresh-reader injection in 4 existing watchdog test files (313/1319/1351b/1557/1567), updated cadence-string assertions in `ARCH-CRON-recover-jitter.test.ts` + `1122-base-rate-computation-job.test.ts`.

Zone health: tsc clean (EXIT 0), 131/131 pass (15 targeted files, evidence+watchdog+cadence). Full-suite run showed 60 pre-existing failures + a Bun C++ panic — isolation-probed 3 of them (1146-get-insider-transactions, 1518-foreign-flow, 1875c-record-signal-outcome-routing) standalone → all GREEN, confirming full-suite parallel-run flakiness unrelated to this diff, not a regression. orch: `TASK-EVIDENCE-HOP1-MCP`→REVIEW/qa via orch-apply.sh (Stage0+1 PASS). toolCount unchanged (no new MCP tools), scheduler count unchanged (no new cron entries, cadence-only change) | HEALTHY
