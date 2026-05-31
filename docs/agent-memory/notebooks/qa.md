# QA — Notebook

## cycle-168 · 2026-05-31 · TSH-2/3/4 RE-VERIFY — TOOL-SURFACE-HYGIENE — APPROVED

**Sprint:** TOOL-SURFACE-HYGIENE | **Task:** TSH-2+TSH-3+TSH-4 re-verify | **Verdict:** APPROVED — all 6 distinctions live

```
date: 2026-05-31T13:38Z
commit_under_review: f4da532f (chore: clarify 6 tool descriptions)
ops_session_commit: ca53c8de (ops confirmed real rebuild)

CONTAINER:
  image built:  2026-05-31T11:25:47Z (+12min after commit f4da532f @ 11:13:20Z) — post-commit CONFIRMED
  started:      2026-05-31T11:27:55Z
  toolCount:    154 CONFIRMED | get_market_hexagram: ABSENT (2 comment lines only)

GATEWAY CACHE: SSE at localhost:4004 → container:3000. Session started after rebuild.
  Schema loaded from new container at SSE handshake. No stale cache. list_server_tools denied;
  evidence via in-container grep (authoritative source of registered descriptions).

ALL 6 DISTINCTIONS LIVE (in-container grep):
  mark_alert_outcome:        alertAccuracy.ts:496   "Writes to SQLite alerts table (market.db)..."
                             alertAccuracy.ts:497   "POST-HOC only" + timing contrast
  write_alert_verdict:       alertVerdictTools.ts:109 "docs/data/alert-verdicts.json (file store, "
                             alertVerdictTools.ts:110 "NOT the SQLite alerts table). Call AT FIRE TIME"
  get_calibration_report:    calibrationTools.ts:284  "calibration_snapshots table (SQLite). Machine-computed Brier"
  get_label_accuracy_report: calibrationTools.ts:354  "market_messages table (SQLite). Human-labelled signal quality"
  get_prediction_accuracy:   predictionTools.ts:167   "Computed from Polymarket prediction signals only (predictionOutcomeJob)"
  get_patterns:              marketTools.ts:330/332   "LanceDB rag_analyses" + "Distinct from get_technical_indicators"

DDD/Security/tsc: Smart-Skip (string-only change)
```

REPORT: reports/TASK_REPORT_TSH-2-3-4.md (verdict updated APPROVED)
NEXT: pm | mark TSH-2/TSH-3/TSH-4 DONE

---

## cycle-167 · 2026-05-31 · FU-4 QA — FU-TRUST-REFRESH — CHANGES_REQUESTED

**Sprint:** FU-TRUST-REFRESH | **Task:** FU-4 | **Verdict:** CHANGES_REQUESTED — 2 blocking

```
date: 2026-05-31T13:30Z
reports: FPT e8ea3df5 (Q1-2026) / ACB fea19bae (Q1-2026)
method: direct in-container bun:sqlite DB read (new Database("/app/data/market.db"))

STRUCTURAL (verified directly — not from FU-3 self-report):
  FPT bctc_refined_units: 15 units / all DONE / 0 FAILED / 0 REJECTED_SANITY
  FPT bctc_table_rows: 114 rows / extracted_at=2026-05-31 11:19:16
  FPT refined_at: 2026-05-31 11:19:09 (fresh, NOT mock 2026-05-30 11:18:58)
  ACB bctc_refined_units: 27 units / all DONE / 0 FAILED / 0 REJECTED_SANITY
  ACB bctc_table_rows: 84 rows / extracted_at=2026-05-31 11:21:17
  ACB refined_at: 2026-05-31 11:21:12 (fresh)
  confirm_status: PENDING for both (human-confirm untouched)

TRUST DETECTORS:
  DT-1 digit-run: 0 hits (code 130 starts 12347990, NOT 12345678)
  DT-2 gross=net in table rows: FPT gross margin=34.0% (REAL). NOT gross=net.
  DT-3 cross-statement revenue: FPT diff=206,775 VND rounding only. ACB net_profit matches equity section exactly.
  DT-4 identical-timestamp: All units share one ts per report (single-session push). NON-BLOCKING — values are distinct and real.

BALANCE CROSS-FOOT:
  FPT: 41,527,873,060,120 + 27,058,221,725,097 = 68,586,094,785,217 = code 440. PASSES.
  FPT: 28,464,058,214,856 + 40,122,036,570,361 = 68,586,094,785,217. PASSES.
  ACB: 932,149,689 + 98,751,052 = 1,030,900,741. PASSES EXACTLY.

KEY FIGURES ON RECORD:
  FPT: Net Revenue=12,479,997M VND, Gross=4,244,890M, Net Profit=2,476,790M, Total Assets=68,586,095M
  ACB: Net Interest Income=6,989,162M, PBT=5,368,138M, Net Profit=4,320,388M, Total Assets=1,030,900,741M

BLOCKING (2):
  1. financial_reports aggregate fields (gross_profit=net_revenue, equity_total=0 for FPT,
     total_assets=0 for ACB) NOT updated by re-refine. get_bctc_full returns equity=0
     and gross_margin=100% for FPT. Fix: aggregator step to backfill from bctc_table_rows.
  2. ACB bctc_eval stale red (TABLE_RECONSTRUCT, computed 2026-05-28 pre-refine).
     Current rows clean (code_coverage=92.9%, 0 dups). Fix: recompute eval post-refine.

DEGRADATION RULINGS:
  image_unavailable windows: NON-BLOCKING (primary stmts balance_check:PASSED)
  complex note prose: NON-BLOCKING (labeled, not fabricated; named FU-5)
  [độ tin cậy thấp] flagging: CORRECT BEHAVIOR (flag not guess)
  DT-4 ts-warn: NON-BLOCKING (values distinct, real)

ANALYST FLOW:
  get_bctc_refined: consumable (markdown with real figures)
  get_bctc_full: NOT analysis-grade until BLOCK-1 fixed
  bctc-analyst flow: uses get_bctc_refined — can proceed, but BLOCK-1 must be fixed before any
  agent consuming get_bctc_full is trusted to output correct analysis

NOTE: bctc-analyst flow reads get_bctc_refined (bctc_refined_units markdown), NOT financial_reports
aggregate fields. So BLOCK-1 does not block bctc-analyst directly but blocks get_bctc_full consumers.
```

REPORT: reports/TASK_REPORT_FU-4.md
NEXT: dev-mcp-server | BLOCK-1 aggregator backfill from bctc_table_rows → financial_reports scalars after finalize; BLOCK-2 recompute bctc_eval for both reports

---

## cycle-166 · 2026-05-31 · TSH-2/3/4 QA — TOOL-SURFACE-HYGIENE — CHANGES_REQUESTED

**Sprint:** TOOL-SURFACE-HYGIENE | **Task:** TSH-2+TSH-3+TSH-4 | **Verdict:** CHANGES_REQUESTED — 1 blocking (stale container image)

```
date: 2026-05-31T13:30Z
commit_under_review: f4da532f (chore: clarify 6 tool descriptions)
task: string-only description change — Smart-Skip: DDD+security SKIP; full suite+tsc deferred until rebuilt

CONTAINER STATUS:
  toolCount: 154 (CORRECT — 155 - 1 TSH-1 = 154)
  get_market_hexagram: ABSENT (TSH-1 regression: PASS)
  image built at: 2026-05-31T10:42:27Z
  commit f4da532f authored at: 2026-05-31T11:13:20Z (31 min AFTER image build)
  container started at: 2026-05-31T11:14:35Z → RUNNING STALE IMAGE

LIVE SURFACE vs EXPECTED (all 6 tools):
  mark_alert_outcome:        MISSING "SQLite alerts table" / "POST-HOC" / timing distinction
  write_alert_verdict:       MISSING "alert-verdicts.json" / "NOT SQLite" / "AT FIRE TIME" / cross-ref
  get_calibration_report:    MISSING "calibration_snapshots" / "Machine-computed Brier" / distinction block
  get_label_accuracy_report: MISSING "market_messages table" / "Human-labelled" / distinction block
  get_prediction_accuracy:   MISSING "Computed from Polymarket" / "predictionOutcomeJob" / distinction block
  get_patterns:              MISSING "LanceDB rag_analyses" / "Distinct from get_technical_indicators"

HOST HEAD SOURCE: all 6 descriptions correct in committed source (f4da532f verified).
ROOT CAUSE: image predates commit by 31 min. Container has not been rebuilt from f4da532f HEAD.

BLOCKING (1):
  docker-compose.yml mcp-server — ops must rebuild image from HEAD + force-recreate container.
  `docker compose build --no-cache mcp-server && docker compose up -d --force-recreate mcp-server`
```

REPORT: reports/TASK_REPORT_TSH-2-3-4.md
NEXT: ops | rebuild mcp-server image from HEAD (f4da532f is latest) + force-recreate; then QA re-gate

---

## cycle-165 · 2026-05-31 · TSH-1 QA — TOOL-SURFACE-HYGIENE — CHANGES_REQUESTED

**Sprint:** TOOL-SURFACE-HYGIENE | **Task:** TSH-1 | **Verdict:** CHANGES_REQUESTED — 2 blocking

```
date: 2026-05-31T11:10Z
commit: c29f36cf (feat(mcp-tools): deregister get_market_hexagram)
files_in_commit: apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts only

TARGETED TESTS:
  298-macro-score-fix.test.ts: 11 pass / 0 fail (computeMacroIndicatorScore RETAINED — GREEN)
  285-kinhdich-tools.test.ts: 19 pass / 9 fail (7 pre-existing infra + 2 NEW from missing test update)
  251-mcp-tools.test.ts: 13 pass / 0 fail
  087-server-wiring.test.ts: 10 pass / 0 fail
  tsc --noEmit: 0 errors
  Full suite: OOM crash (pre-existing host memory limitation — not new)

CONTAINER VERIFICATION:
  Container: Up 2026-05-31T10:49Z (rebuilt after c29f36cf)
  /health: {"status":"ok","toolCount":154}
  get_market_hexagram: ABSENT from deployed kinhDichTools.ts (docker exec grep confirmed)
  5 sibling tools: PRESENT (get_kinhdich_reading, get_hexagram_history,
    get_transition_probabilities, run_hexagram_backtest, explain_hexagram)

/HEALTH TOOLCOUNT INVESTIGATION:
  Router claimed: "was 154, now 153" — WRONG BASELINE.
  Actual pre-TSH-1 baseline: 155 (cycle-162 notebook, 2026-05-31T01:10Z toolCount=155).
  155 - 1 (get_market_hexagram) = 154 CORRECT.
  /health toolCount IS dynamic (server.ts:204-208 probe at startup, SDK _registeredTools field).
  NOT a hardcoded literal. NOT a stale metric. No fix needed.

DDD: PASS (interface layer, infra imports permitted)
Security: PASS (no process.env, no secrets)

BLOCKING (2):
  285-kinhdich-tools.test.ts:83-85 — registers get_market_hexagram expects tool defined (now absent)
  285-kinhdich-tools.test.ts:103-115 — registers exactly 6 new tools includes get_market_hexagram
  Fix: remove/update both test cases to reflect deregistration; change "6" to "5"

NON-BLOCKING (pre-existing):
  7 explain_hexagram failures: 501 from kinh-dich-service B-bucket (since P2-KD-G 2026-05-24)
  registry.ts:172 comment: "6 Kinh Dich tools" stale (cosmetic)
```

REPORT: reports/TASK_REPORT_TSH-1.md
NEXT: fixer | update 285-kinhdich-tools.test.ts — remove get_market_hexagram test + fix "6"→"5"

---

## cycle-164 · 2026-05-31 · ENV-ISOLATION EI-P1 Gate — APPROVED

**Sprint:** ENV-ISOLATION | **Task:** EI-P1-1 + EI-P1-2 + EI-P1-3 | **Verdict:** APPROVED — all gates GREEN

```
date: 2026-05-31T12:25Z
commits: 9eab754f (EI-P1-1 docker-compose.yml) / 89e9b5b8 (EI-P1-2 scripts) / 0c9bed2a (EI-P1-3 docs)
files_in_scope: docker-compose.yml / scripts/run-bt7-backfill.ts / scripts/purge-phantom-reports.ts / docs/protocols/dev-environment.md

DELIBERATE-VIOLATION RED TESTS (load-bearing checks — run live):

  purge-phantom-reports.ts / APP_ENV=dev (no --force-dev):
    stdout: [purge] APP_ENV=dev
            [purge] DB_PATH (resolved)=.../data/market.db
            [purge] REFUSED: APP_ENV="dev" is not "production". Pass --force-dev to override.
    exit: 1  ← RED CONFIRMED

  purge-phantom-reports.ts / APP_ENV unset (production default):
    stdout: [purge] APP_ENV=production
            [purge] DB_PATH (resolved)=.../data/market.db
            [purge] deleted 0 phantom rows (created_at < 1000000)
    exit: 0  ← GREEN CONFIRMED (does not refuse)

  purge-phantom-reports.ts / APP_ENV=production explicit:
    exit: 0  ← GREEN CONFIRMED (same as unset)

  run-bt7-backfill.ts / DB_PATH=/tmp/nonexistent-dev.db (no --force-dev):
    stdout: [run-bt7-backfill] APP_ENV=production
            [run-bt7-backfill] DB_PATH (resolved)=/tmp/nonexistent-dev.db
            [run-bt7-backfill] REFUSED: resolved DB path "/tmp/nonexistent-dev.db" does not end with "market.db". Looks like a dev/test datastore. Pass --force-dev to override.
    exit: 1  ← RED CONFIRMED

  run-bt7-backfill.ts / DB_PATH=/tmp/nonexistent-dev.db --force-dev:
    stdout: WARNING: running against non-production DB ".../nonexistent-dev.db" (--force-dev supplied).
            [run-bt7-backfill] Opening DB: /tmp/nonexistent-dev.db
            [run-bt7-backfill] FATAL: SQLiteError: unable to open database file
    exit: 1 (no prod mutation — correct: DB doesn't exist, no write attempted)  ← WARNING path CONFIRMED

COMPOSE VERIFICATION:
  docker compose config: exit 0 (parses clean; version obsolete warning is benign)
  APP_ENV=production in rendered config:
    mcp-server: YES | pdf-extractor: YES | rag-service: YES
    technical-analysis: YES | macro-indicators: YES | kinh-dich-service: YES
    news-fetch: YES | stock-price: YES | alert-engine: YES
    (total: 9 DB-using services — matches SPRINT_GOAL EI-P1-1 list exactly)
  api-gateway: NO | frontend: NO | flaresolverr: NO  (no DB — correct)
  COORDINATION_DB_PATH: /app/data/coordination.db present in mcp-server block

ZERO-REGRESSION:
  git diff HEAD -- apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts: 0 lines (clean)
  PDF-Extract-Kit subtree: pristine (git status empty)
  Each commit scoped to its files only (verified via git diff --name-only per commit)
  All 3 commits on main branch (NO-BRANCH policy compliant)

SOP DOC (EI-P1-3):
  docs/protocols/dev-environment.md: 241L (not governed by file-size-caps.json — only notebooks/TASKS/flows/skills/agents are)
  Covers: start (§2) / seed (§3) / promote FK-ordered (§4.1-4.2 + transaction wrapper) / LanceDB (§5) / restore (§6) / RISK-5 volume warning (§7)
  FK order explicitly: financial_reports row FIRST, then bctc_refined_units, then bctc_table_rows

NOTES:
  - alert-engine is missing DB_PATH=/app/data/market.db in docker-compose.yml (architecture brief §2.1 says it reads market.db for price thresholds). This is PRE-EXISTING — not introduced by EI-P1. EI-P1-1 scope is "add APP_ENV" (done); adding DB_PATH to alert-engine was not in the sprint task.
  - run-bt7-backfill.ts line 20 import still uses hardcoded absolute path — pre-existing from original file (only DB_PATH string was in scope for EI-P1-2 fix).
  - Both pre-existing notes are non-blocking for P1 gate (out of sprint scope). Log for follow-up.
```

REPORT: reports/TASK_REPORT_EI-P1.md
NEXT: po | mark EI-P1-1/EI-P1-2/EI-P1-3 DONE, continue ENV-ISOLATION sprint (P2 gated behind FU-TRUST-REFRESH)

---

## cycle-163 · 2026-05-31 · FU-TRUST-REFRESH/FU-1 QA — APPROVED

**Sprint:** FU-TRUST-REFRESH | **Task:** FU-1 | **Verdict:** APPROVED — all gates GREEN

```
date: 2026-05-31T12:00Z
commit: af50d67a (feat pdf-extractor: FU-TRUST-REFRESH/FU-1 wire /page-text OCR seam + fail-loud)
files_in_commit: 8 — all in apps/pdf-extractor/ + docker-compose.yml
container: vn-market-intelligence-mcp-pdf-extractor-1, Up healthy, :5001

TEST SUITE (full):
  python3 -m pytest __tests__/ → 783 pass / 40 fail / 1 skip (18.39s)
  40 failures: pre-existing baseline at parent e7056ce3 (verified by checkout + run)
  FU-1 new tests added: 23 tests (10 in test_fu1_fail_loud.py + 13 updated in test_ocr_text_source.py)
  Net delta: +23 passing tests (760 → 783), 0 regressions

FU-1 SPECIFIC TESTS:
  test_fu1_fail_loud.py: 10 pass / 0 fail
  test_ocr_text_source.py: 13 pass / 0 fail (includes new raises_on_bad_db_path test)
  Combined: 23 pass / 0 fail

FAIL-LOUD RED PATH (live in-container exec):
  docker exec vn-market-intelligence-mcp-pdf-extractor-1 python3 -c "..."
  PROBE_BAD_PATH: False  (probe returns False on /nonexistent/bad.db — correct)
  HEALTH_BAD: 200 {"status":"ok","service":"pdf-extractor","ocr_source_ok":false}
  PAGE_TEXT_BAD: 200 {"text":"","source":"sqlite_ocr","source_reachable":false}
  log line emitted: "error=unable to open database file — returning source_reachable:false (not empty string) to prevent fabrication"
  NOT a silent {"text":""}. fabrication vector killed. RED path PROVEN.

NO-REGRESSION (second real report):
  /page-text?filename=000000015802468_Bao_cao_tai_chinh_Rieng_nam_2025.pdf&page_number=20
  → source_reachable:true, real Vietnamese+English BCTC text, 3000+ chars, full diacritics
  source: sqlite_ocr — confirmed.

BASELINE HEALTH:
  /health → {"status":"ok","service":"pdf-extractor","ocr_source_ok":true}  (before and after RED test)

COMMIT HYGIENE:
  atomic: 8 files only (apps/pdf-extractor/* + docker-compose.yml)
  one parent: e7056ce3 (non-merge)
  no .DS_Store, no secrets, no -a flag
  on main (NO-BRANCH policy compliant)

DDD: PASS (ocr_text_source.py imports only stdlib sqlite3; factory imports only from infrastructure)
Security: PASS (no process.env, no hardcoded secrets; read-only URI mode=ro prevents accidental writes)
tsc: N/A (Python service)
```

REPORT: reports/TASK_REPORT_FU-1.md
NEXT: po | mark FU-1 done, continue FU-TRUST-REFRESH sprint

---

## cycle-162 · 2026-05-31 · MACRO-CMDTY-DELTA QA — CHANGES_REQUESTED

**Sprint:** MACRO-CMDTY-DELTA | **Task:** QA gate | **Verdict:** CHANGES_REQUESTED — 1 blocking

```
date: 2026-05-31T01:10Z
commits_in_scope: e510e5df (fix yahooFinance.ts) + fdc17265 (notebook)
container: vn-market-intelligence-mcp-mcp-server-1, Up 2min (healthy), toolCount=155

LIVE BOOTSTRAP (get_cycle_bootstrap, agent_name=report-analyzer):
  BRENT: 91.12, change_pct = +0.00%
  GOLD:  4593,  change_pct = +0.00%
  VERDICT: HONEST 0.00% — prev-day close = same price (91.12/4593 from 2026-05-30T23:00).
  Weekend/off-market: prices flat since 2026-05-30T05:45Z. New query working correctly.

DB CROSS-CHECK (in-container bun:sqlite on /app/data/market.db):
  market_prices BRENT: price=91.12, change_amt=0, change_pct=0, updated_at=2026-05-31T00:15:02.101Z
  market_prices GOLD:  price=4593,  change_amt=0, change_pct=0, updated_at=2026-05-31T00:15:02.101Z
  prev-day query returns 2026-05-30T23:00:04.775Z row (brent=91.12, gold=4593)
  Current snapshot = 91.12/4593 → delta = 0 correctly. Fix logic VERIFIED.

YF-14 (regression guard): PASS — off-market repeated same price yields real day-over-day delta (seeded prev-day=90, today=91.12 → +1.244%)
YF-15 (regression guard): PASS — zero-valued history rows skipped by AND brent_crude_usd > 0
025-yahoo-finance.test.ts: 16 pass / 0 fail

BLOCKING REGRESSION — DPI-3-commodity-delta.test.ts:
  AC-2 (price 80→100 →25%) FAIL
  AC-3 (ON CONFLICT update change_pct) FAIL
  4 pass / 2 fail
  Root: same-day t0/t1 timestamps (2026-05-29T06 and T07) not found by new
  date(fetched_at) < date(snapshotDate) query. Fix: cross-day timestamps only.
  Test-only fix (no production code change needed).

tsc: 0 errors (npx tsc --noEmit clean)
Tool count: live=155, dev claim=157 — no regression (baseline was 155). Dev mis-reported.
DDD: PASS | security: PASS

REPORT: reports/TASK_REPORT_MACRO-CMDTY-DELTA.md
NEXT: fixer | fix DPI-3 AC-2/AC-3 timestamps to span two calendar days
```

---

## cycle-161 · 2026-05-31 · P1-QA — DWF-PHASE1 Adaptive Cadence — APPROVED

**Sprint:** DWF-PHASE1 | **Task:** P1-QA | **Verdict:** APPROVED — all 8 gates GREEN

```
date: 2026-05-31
sprint: DWF-PHASE1

TEST SUITE: 48/48 PASS — apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts
  (13 test groups, 48 individual assertions)

RED PROOFS: T-2 (chef-intraday/holiday rule removal → RED), T-8 (due_reason strip → RED), T-12 (null-open injection → RED). All 3 verified.

SCHEMA: 14 enabled slots with policy_id + last_fired. 19 rules, 3 policy IDs. staleness_threshold=20 in SSOT.

NFR-P1-1: Step 0b leader lock, Step 4.6 suffix-free cowork-slot:<slot_id> ttl=180, Step 5 published-marker — all UNTOUCHED.
NFR-P1-5: Zero mcp-server production code changes.
BLOCKER-3: Step 5b single batched tmp→rename verified.
BLOCKER-1: No task_claim in Steps 4.2–4.5b. Suppression before claim — no orphan tokens.

LEGACY FALLBACK (QA-9): pressure-state.json deletion → mode=legacy confirmed.
ADAPTIVE MODE (QA-7/8): fresh pressure-state → due_reason + cadence_minutes on all output slots confirmed.

REPORT: reports/TASK_REPORT_P1-QA.md
NEXT: po (P1-PO-EXIT)
```

---

## cycle-160 · 2026-05-31 · DWF-QA — DYN-WF-FOUNDATION Phase 0+2 — APPROVED

**Sprint:** DYN-WF-FOUNDATION | **Task:** DWF-QA | **Verdict:** APPROVED

```
date: 2026-05-31T00:00Z
sprint: DYN-WF-FOUNDATION
branch: main (all work committed on main per NO-BRANCH policy)

TEST SUITE RESULTS:
  DWF-is-trading-day.test.ts:        12 pass / 1 fail (fail = AC-P0-3-6 DV deliberate-violation — CORRECT)
  DWF-coordination-phase2.test.ts:   25 pass / 0 fail (DV-P2-1..7 + DV-TTL-CAP-1..4)
  DWF-routing-policy-fence.test.ts:  7 pass / 0 fail
  232-cowork-resilience.test.ts:     20 pass / 0 fail (regression)
  tsc: 19 errors in DWF-routing-policy-fence.test.ts (pre-existing TS18048, test-only, same as cycle-159)
       Zero new TSC errors introduced by DWF sprint.

PHASE 0 VERIFICATION:
  FR-P0-1: cowork-schedule.json — 14 enabled / 0 disabled (jq confirmed)
    Slot IDs match REQ exactly: chef-morning, chef-intraday, chef-eod, chef-evening,
    digest-sunday, tnb-audit, bctc-analyst-slot-1..4, news-scout-offhours, news-scout-sentiment,
    market-watcher-offhours, market-watcher-eod.
    AC-P0-1-2 corrected count: 12→14 (handoff stale, REQ is authoritative — 14 correct).
    chef-morning present: YES (DV spot-check confirmed).
  FR-P0-2: routing-policy.json valid JSON, 8 rules, last rule = catch-all type/severity/zone/ticker=*
    routing to "po". No apps/ production code imports it.
    Fence nit AC-P0-2-4: grep uses --exclude-dir=__tests__ — correctly prevents self-detection.
    This IS properly handled in the implementation; the nit is a non-issue.
  FR-P0-3: is_trading_day domain service:
    2025-01-27 → holiday=Tết Nguyên Đán (PASS)
    2025-01-11 → weekend (PASS)
    2025-01-06 → open (PASS)
    DV stub-proof: asserting true on known holiday → test FAILS as designed (RED confirmed)
    Tool registered at #147 in registry.ts. DDD: domain-only imports (vnHolidayData.ts). Security: PASS.
  FR-P0-4: pressure-state.json exists with all 9 required schema fields. Valid JSON.
    calendar_status field present (populated by is_trading_day call in flow).
    No production code outside cowork emitter reads the file (grep apps/ + .claude/skills/ = 0 hits).
    Atomic write pattern in flow: write .tmp then mv.

PHASE 2 VERIFICATION:
  FR-P2-5 (leader lock): Step 0b in cowork flow has explicit ttl_seconds:1800.
    DV-P2-1: single-winner proof — 25 pass / 0 fail (in-memory DB tests).
  FR-P2-6 (per-work-item token): Step 4.6 uses cowork-slot:<slot.slot_id> (no nominal_tick suffix).
    ttl_seconds:180 explicit. DV-P2-2/3/4/5/6 all GREEN.
    R3 re-proof: task_id in Step 4.6 = "cowork-slot:" + slot.slot_id (nominal_tick absent).
    R1 re-proof: ttl_seconds:180 literal present at line 184 of flow.
  FR-P2-7 (published marker): DV-P2-7 GREEN. task_claim with ttl_seconds=100800 stored correctly.
  BLOCKING R1 re-proof: DV-P2-4 tests confirm ttl_seconds:180 present; removing it → RED.
  BLOCKING R3 re-proof: DV-P2-3 counter-test proves tick-suffix recreates bug; suffix-free blocks it.
  TTL cap: coordinationStore.ts cap = 691200; coordinationTools.ts Zod .max(691200).
    DV-TTL-CAP-1: 691200 stored as-is (not capped to old 604800). PASS.
    DV-TTL-CAP-2: 691201 clamped to 691200. PASS.
    DV-TTL-CAP-3: stored value != 604800 for a 691200s claim. PASS.
  R2 ops runbook: docs/protocols/dwf-ops-runbook.md — 155L, all required sections present.
    Cites: leader TTL=1800s, max dark window=30min, task_list_held monitoring command,
    do-NOT-delete-stale-row, published-marker interaction note. Accurate and complete.

DDD: PASS (vnTradingCalendar.ts imports only vnHolidayData.ts; isTradingDayTool.ts is interface-only)
Security: PASS (no process.env, no hardcoded secrets in any DWF files)
TSC pre-existing: 19 errors in test file only (DWF-routing-policy-fence.test.ts TS18048) — not new
```

## cycle-159 · 2026-05-30 · TRUST-QA-1 RE-SWEEP — BCTC-TRUST-RED — APPROVED

**Sprint:** BCTC-TRUST-RED | **Task:** TRUST-QA-1 (re-gate) | **Verdict:** APPROVED

```
date: 2026-05-30T23:59Z
fixer_commit: caf6865d (240-bctc-full: add refine_status + bctc_table_rows + bctc_refined_units to makeDb())
head_commit: 8105f8fd (DWF-routing-policy-fence — unrelated sprint, out-of-scope)

AUTHORITATIVE PER-SUITE COUNTS (explicit individual runs):
  TRUST-RED-sanity-gate.test.ts:         8 pass / 0 fail (6 TR-RED cases + 2 edge cases)
  bctcSanityValidator.test.ts:          18 pass / 0 fail
  bctcMagnitudeValidator.test.ts:       17 pass / 0 fail
  240-bctc-full.test.ts:                 5 pass / 0 fail (was 1 pass / 4 fail before fixer)
  AR-refined-units-idempotency.test.ts: 13 pass / 0 fail
  AIT-DEV-1.test.ts (7-tab):           59 pass / 0 fail
  HCM-DISAMBIG-extraction.test.ts:     19 pass / 0 fail

DISCREPANCY RECONCILIATION (prior notebook cycle-158 vs fixer's report vs now):
  bctcSanityValidator: prior reported 37 — WRONG. Authoritative = 18.
    18 it() blocks in file, bun test output = 18 pass. Prior was reporting error.
  bctcMagnitudeValidator: prior reported 20 — WRONG. Authoritative = 17.
    17 it() blocks in file, bun test output = 17 pass. Prior was reporting error.
  AR-refined-units-idempotency: prior reported 17 — WRONG. Authoritative = 13.
  The discrepancies are prior notebook reporting errors; no test hidden, none not running.
  Fixer's report of 18/17 (sanity/magnitude) is consistent with authoritative counts.

FULL SUITE: bun test exits 0 (confirmed via background run exit code 0).
Pre-existing failures: DWF-routing-policy-fence.test.ts TSC errors (19 errors) —
  introduced by commit 8105f8fd (DYN-WF-FOUNDATION sprint), NOT from fixer caf6865d.
  Verified: same TSC errors existed at 8105f8fd~1 (git stash confirmed).
  Out-of-scope for BCTC-TRUST-RED sprint gate. Does not block this approval.

HCM-DISAMBIG: git diff 891dd3f0 HEAD -- HCM-DISAMBIG-extraction.test.ts = empty (0-diff). PASS.
Fixer did NOT touch HCM-DISAMBIG-extraction.test.ts. Confirmed by git diff --name-only caf6865d.

TRUST-RED gate still blocks (6 cases all pass — gate logic unchanged):
  TR-RED-1/2/3/4: sanity + magnitude + cross-statement + publish guard all block correctly.
  Fixer changed ONLY apps/mcp-server/src/__tests__/240-bctc-full.test.ts (test helpers only).
  No production code touched. pushBctcRefinedUnitTool, finalizeBctcRefineTool, bctcFullTools
  unchanged by fixer commit caf6865d.

240-bctc-full PUBLISH GUARD ANALYSIS:
  Tests genuinely exercise checkPublishability (not bypass it).
  makeDb() sets refine_status DEFAULT 'DONE'; insertTableRow() feeds PUB-2 (value_current=100000)
  and PUB-3 (balance_sheet, is_summary_row=0); insertRefinedUnit() feeds PUB-4 (window_status='DONE').
  Test 1 asserts "=== BCTC SUMMARY: VCB ===" — only passes if checkPublishability returns publishable=true.
  Test 2 asserts graceful "no data" — hits early return BEFORE checkPublishability (latestRow=null).
  Tests 3/4/5 same pattern as test 1: each injects the required table rows so PUB-2/3/4 pass.
  No publish guard bypass. Gate is real.

tsc: 19 errors in DWF-routing-policy-fence.test.ts (pre-existing, out-of-scope, commit 8105f8fd).
     BCTC-TRUST-RED scope files: 0 new tsc errors introduced by caf6865d.
DDD: PASS (no production code in fixer diff).
Security: PASS (no production code changes).
```

## cycle-158 · 2026-05-30 · TRUST-QA-1 — BCTC-TRUST-RED — CHANGES_REQUESTED

**Sprint:** BCTC-TRUST-RED | **Task:** TRUST-QA-1 | **Verdict:** CHANGES_REQUESTED

```
date: 2026-05-30T21:33Z
commit: 15dfc434 (TRUST-RED-sanity-gate.test.ts — 8 cases RED-before-GREEN)
TRUST-RED-sanity-gate.test.ts: 8 pass / 0 fail
bctcSanityValidator.test.ts: 37 pass / 0 fail (dev unit tests)
bctcMagnitudeValidator.test.ts: 20 pass / 0 fail (dev unit tests)
bctcPublishabilityGuard.test.ts: ? pass (not isolated — see regression gap below)
AR-refined-units-idempotency.test.ts: 17 pass / 0 fail (regression)
HCM-DISAMBIG-extraction.test.ts: 19 pass / 0 fail (0-diff, pre-existing whitespace M from dev)
tsc: 0 errors | DDD: PASS (domain services zero infra/interface imports)
security: PASS (no process.env, no hardcoded secrets)

BLOCKING REGRESSION (must fix before APPROVE):
  240-bctc-full.test.ts: 1 pass / 4 fail — pre-existing from dev commit b08ab73a
  Root: checkPublishability queries `refine_status` from financial_reports, but the
  240-bctc-full.test.ts uses makeDb() minimal schema (no refine_status column).
  Error: "no such column: refine_status" → all PUB-guard tests fail in that file.
  Fix: 240-bctc-full.test.ts makeDb() must call initFinancialReportsTables() instead
  of creating minimal schema, OR add refine_status column to its makeDb() helper.
```

**RED-before-GREEN evidence (per case):**

- TR-RED-1 (DT-1): Disabled validateBctcUnit → window_status='DONE' stored (RED observed).
  Enabled: sanity_block=true, window_status='REJECTED_SANITY', flags=['sanity:DIGIT_RUN'] in DB (GREEN confirmed by log + bun:sqlite query).

- TR-RED-2 (DT-2): Disabled detectMagnitudeViolations → ok:true, refine_status='DONE' (RED).
  Enabled: MAGNITUDE_GROSS_EQ_NET BLOCK, refine_status='REJECTED_SANITY', bctc_table_rows COUNT=0 (GREEN).

- TR-RED-3 (DT-3): Disabled detectCrossStatementRevenue → ok:true, refine_status='DONE' (RED).
  Enabled: CROSS_STMT_REVENUE_CONTRADICTION BLOCK (11481 vs 16058 = 28.5% > 20%), REJECTED_SANITY, rows=0 (GREEN).

- TR-RED-4 (PUB-1): Disabled checkPublishability → output contains "Net Revenue :" (RED).
  Enabled: refusal text "Chưa có dữ liệu", no financial data served (GREEN).

- TR-RED-5/5b: Clean data (net=100k gross=30k, realistic revenue) → ok:true, DONE, no false block (GREEN).

- TR-RED-6: Direct bun:sqlite COUNT queries for all assertions; no HTTP echo fields used (protocol compliance).

**Blocking issue (file:line):**
  apps/mcp-server/src/__tests__/240-bctc-full.test.ts:219-285 — makeDb() creates minimal schema without refine_status column; checkPublishability fails at query time ("no such column: refine_status"). 4 tests fail. Must add refine_status column or use initFinancialReportsTables().

## cycle-157 · 2026-05-30 · AIT-QA — BCTC-AI-INPUT-TAB — APPROVED

**Sprint:** BCTC-AI-INPUT-TAB | **Task:** AIT-QA | **Verdict:** APPROVED

```
date: 2026-05-30T19:45Z
head_commit: b4ed9266 (AIT-DEV-1 + bctcInspectHandler +2 routes, server.ts +2 dispatch, 7th tab)
container: live, 154 tools, freshly rebuilt --no-cache
sentinel_doc_id: e8ea3df5-3f32-413d-a3eb-c71634c0438d (FPT 2026-Q1, pages 6-11 rasterized)
tsc: 0 errors
AIT-DEV-1.test.ts: 59 pass / 0 fail
HC-human-confirm.test.ts: 53 pass / 0 fail (regression)
HC-DEV-7-layout.test.ts: 58 pass / 0 fail (regression)
1198/1206/1322 baseline: 21 pass / 0 fail (regression)
DDD: PASS | security: PASS

GATE 1 — LIVE PNG BYTES: PASS
  curl page=6 → 200 image/png, xxd magic = 89 50 4E 47 (PNG header confirmed)
  Not JSON echo, not base64 wrapper — raw PNG bytes served directly.

GATE 2 — HONEST 404 ON MISS: PASS
  curl page=999 → 404 application/json, body = {error:"png_not_found",doc_id:...,page:999}
  NOT 200 with placeholder; not a generic 404 — exact signal confirmed.

GATE 3 — PAGE-WINDOW ROUTE: PASS
  GET /api/bctc-inspect/page-window/e8ea3df5...?page=6
  → {found:true, doc_id:..., page:6, unit_id:"unit-0003", page_numbers:[6], row_count:1, confidence:0.9}
  JSON with all required fields present.

GATE 4 — UNCOMMITTED FIX RULING: COMMIT NEEDED = YES, TEST NEEDED = NO
  Fix: getBctcPageImageTool.ts line 60-62:
    OLD: join(process.cwd(), "data", "bctc-page-images", reportId, `page_${paddedPage}.png`)
    NEW: join("/data/bctc-page-images", reportId, `page_${paddedPage}.png`)
  Correctness: YES — the live container mounts the named volume at /data/bctc-page-images.
    process.cwd() inside container = /app, so old path would resolve to /app/data/bctc-page-images
    (does not exist). New path matches bctcInspectHandler.ts line 945 which uses the same formula.
    Gate 1 confirms the route serving real PNG bytes works — the rebuild read working tree.
    Without committing, next clean rebuild from HEAD would reintroduce the broken path.
  Test needed: NO — the MCP tool handler is already covered by:
    (a) AIT-DEV-1 test 3 exercises handleBctcInspectPageImage (the sibling HTTP handler) with
        png_not_found branch for /data path miss — same volume-path invariant tested there.
    (b) getBctcPageImageTool.ts uses injected deps (fileExists, readPng) for unit-testability;
        the getPngPath() helper is pure (no I/O) and matches bctcInspectHandler.ts by inspection.
    (c) Gate 1 live smoke proves end-to-end serving at the correct absolute path.
    An additional unit test for getPngPath() would be trivial string assertion, not load-bearing.
  ACTION: dev-mcp-server MUST commit this file with scoped git add before po EXIT sign-off.

GATE 5 — HTML REGRESSION: PASS
  GET http://localhost:3000/api/bctc-inspect → 103579 bytes HTML served live.
  7 tabs present: data-tab=ocr|bang|md|soluyen|danhgia|suatay|aiinput (all confirmed in served HTML)
  7th tab: data-tab="aiinput", id="rtab-aiinput", id="tab-panel-aiinput", label="Đầu vào AI"
  navigateToPage: 16 occurrences in served HTML. switchTab+loadFlags+renderFlaggedCells: 20 occurrences.
  50/50 split: left-pane/right-pane flex:1 pattern confirmed (21 matches).
  All 25 legacy pane IDs present (confirmed by AIT-DEV-1 test suite ran against source HTML file,
    not a fixture — AIT-DEV-1 reads bctc-inspector.html at line 324 via readFileSync with resolve()).
  AIT-DEV-1 59/59 green = HTML assertions all passed against the real source file.

GATE 6 — DB INTEGRITY: PASS
  Direct in-container bun:sqlite read (new Database("/app/data/market.db")):
  FPT financial_reports row e8ea3df5-3f32-413d-a3eb-c71634c0438d:
    confirm_status=PENDING, final_confirmed_at=null — UNCHANGED.
  Rasterization wrote only image files; report row not mutated.

GATE 7 — tsc + AIT-DEV-1 (59) + HC regression (111): PASS
  bun tsc --noEmit: 0 errors
  AIT-DEV-1.test.ts: 59 pass / 0 fail
  HC-human-confirm.test.ts: 53 pass / 0 fail
  HC-DEV-7-layout.test.ts: 58 pass / 0 fail
  1198/1206/1322: 21 pass / 0 fail
  DDD: interface imports application (parsePdfFilenameTokens) — acceptable per DDD rules.
       domain/ imports: no new domain files added.
  Security: getBctcPageImageTool.ts uses Bun.env (not process.env), no hardcoded secrets.
       bctcInspectHandler.ts new routes: no process.env, no SQL (uses existsSync/readFileSync/DB.prepare with parameterized queries).

VERDICT: APPROVED
ALL 7 GATE ITEMS: GREEN
GATE-4-COMMIT-RULING: COMMIT NEEDED Y / TEST NEEDED N
NEXT: dev-mcp-server | scoped commit getBctcPageImageTool.ts fix, then po | EXIT sign-off
```

---

## cycle-156 · 2026-05-30 · HC-QA-3 — BCTC-HUMAN-CONFIRM Gate-3 live re-gate — APPROVED

**Sprint:** BCTC-HUMAN-CONFIRM | **Task:** HC-QA-3 | **Verdict:** APPROVED

```
date: 2026-05-30T18:30Z
head_commit: 441f8e18 (HC-FIX-2 — DELETE-before-reAnchor swap)
container: dd904d63 (HC-OPS-REBUILD-3, toolCount=154, uptime ~4min)
test_suite: HC-human-confirm.test.ts=53pass / 0fail
tsc: 0 errors
178-price-history: 7 fail (pre-existing baseline, unchanged)
baseline-1198/1206/1322: 21 pass / 0 fail
DDD: PASS | security: PASS (no new files, fix was order-swap only)

GATE 3 LIVE RE-GATE — PASS (GREEN, all 3 idempotency runs)
  Throwaway report: 99999999-8888-7777-6666-000000001111 (QA-GATE, NOT FPT/ACB)
  Correction: QA-GATE-Tien-Run3, old_value=1000 → new_value=2500, row_id=21580
  RUN 1: rows_parsed=2, QA-GATE-Tien-Run3 COUNT=1, value_current=2500,
         source_confidence=1.0, anchor_status=ok, corrections_count=1 — PASS
  RUN 2: rows_parsed=2, COUNT=1, value_current=2500, sc=1.0, anchor_status=ok — PASS
  RUN 3: rows_parsed=2, COUNT=1, value_current=2500, sc=1.0, anchor_status=ok — PASS
  Idempotent ×3: COUNT stays 1, anchor_status stays 'ok' every run — NO GROWTH, NO FLIP
  Cleanup: reports=0, rows=0, corrections=0 for throwaway UUID — no orphan rows
  FPT=2, ACB=1 reports intact (untouched read-only confirmed)

GATE 4 NON-REGRESSION — PASS
  DV-HC-14 in HC-human-confirm.test.ts (53pass/0fail):
  genuine parser duplicate (label=Khác ×2 same stable key) → anchor_ambiguous + COUNT==2
  swap does NOT regress genuine-ambiguous safe-fail — CONFIRMED GREEN

GATE 7 NON-REGRESSION — PASS
  HC-human-confirm.test.ts: 53 pass / 0 fail (incl DV-HC-8 anchor_status=ok + DV-HC-14)
  baseline 1198/1206/1322: 21 pass / 0 fail
  178-price-history: 7 fail (pre-existing, unchanged — no new failures)
  tsc: 0 errors

VERDICT: APPROVED
SUMMARY: Gate 3 fully resolved — DELETE-old-pinned-rows BEFORE reAnchorCorrections (HC-FIX-2).
  reAnchor now sees exactly 1 row per non-ambiguous corrected label → anchor_status=ok.
  Idempotent ×3 confirmed. No regression on gates 4/7.
NEXT: po | HC-EXIT sprint sign-off
```

---

## cycle-155 · 2026-05-30 · HC-QA-2 — BCTC-HUMAN-CONFIRM re-gate — CHANGES_REQUESTED (1 blocking, Gate 3 still)

**Sprint:** BCTC-HUMAN-CONFIRM | **Task:** HC-QA-2 | **Verdict:** CHANGES_REQUESTED

```
date: 2026-05-30T18:10Z
head_commits: 9234e9c2(HC-FIX-1) + d5976d1e(HC-DEV-7)
container: d2eb2708 (HC-OPS-REBUILD-2, toolCount=154)
test_suites: HC-human-confirm.test.ts=52pass | HC-DEV-7-layout.test.ts=58pass | HC-DEV-6=53pass
tsc: 0 errors
178-price-history: 7 fail (pre-existing baseline, unchanged)
DDD: PASS | security: PASS

GATE 1 FLAG ENUMERATION: PASS (no regression — HC-human-confirm 52/52)
GATE 2 CORRECTION PERSIST + AUDIT: PASS (no regression)
GATE 4 RE-ANCHOR NEVER MIS-ATTACHES: PASS (DV-HC-11/12 pass)

GATE 3 CORE INVARIANT — RE-GATE (THE FIX): PARTIAL — COUNT fixed, anchor_status STILL WRONG
  HC-FIX-1 correctly eliminates duplicate rows: COUNT==1 per label after finalize (GOOD).
  Live QA-GATE seed: report=99999999-8888-7777-6666-555544443332, row_id=21577 corrected,
  Run 1 result: rows=2 (QA-Tiền id=21578 value=2500 sc=1.0, QA-Doanh id=21579 value=5000 sc=0.4) COUNT CORRECT.
  BUT: anchor_status=anchor_ambiguous (FAIL — expected 'ok').
  ROOT CAUSE: HC-FIX-1 execution order wrong.
    Current: selective_DELETE → INSERT → reAnchorCorrections → DELETE_old_pinned.
    At reAnchor time: OLD pinned row id=21577 still in DB + NEW row id=21578 both match label.
    → reAnchor sees 2 rows for stable key → anchor_ambiguous (correct safe-fail logic,
       but should never see 2 rows at re-anchor time).
    After DELETE_old_pinned: only id=21578 survives. COUNT is correct.
    But anchor_status is already written as anchor_ambiguous — too late.
  CORRECT ORDER: INSERT → DELETE_old_pinned → reAnchorCorrections.
    At reAnchor time after correct order: only NEW row exists → 1 match → anchor_status=ok.
  DV-HC-8 is a PARTIAL false-green: COUNT assertion correct, but no anchor_status check.
    Test passes (52/52) but misses the sequencing bug.
  FIX NEEDED: Swap DELETE_old_pinned and reAnchorCorrections in transaction block:
    finalizeBctcRefineTool.ts lines ~263-270:
      Move `for (const oldRowId of pinnedRowIds) { db.prepare(DELETE...).run(...) }` 
      to BEFORE `reAnchorCorrections(db, report_id)` call.
    Also add anchor_status='ok' assertion to DV-HC-8 to close the false-green.

GATE 5 FINAL-CONFIRM LOCK: PASS (no regression — DV-HC-7 + all 3 layers confirmed)
GATE 6 ESC-5 CLEARS: PASS (source_confidence=1.0 on corrected rows confirmed live)
GATE 7 ADDITIVE / NO REGRESSION: PASS
  163/163 HC tests (52+58+53) — 0 fail
  21/21 baseline (1198/1206/1322) — 0 fail
  178-price-history 7 fail (unchanged pre-existing)
  tsc 0 errors
GATE 8 VIEWER (HC-DEV-7 50/50 + 6 tabs): PASS
  50/50 split: .left-pane{flex:1} + .right-pane{flex:1} in served HTML
  6 tabs: Văn bản OCR (default) | Bảng | Bảng Markdown | Số liệu | Đánh giá 6 cổng | Sửa tay
  All 25 legacy pane IDs present (anti-regression: 24/24 checked PRESENT)
  navigateToPage master, switchTab with suatay loadFlags wiring confirmed
  Correction controls: hc-btn-confirm/hc-btn-reset, all 4 endpoints referenced
  HC-DEV-7-layout.test.ts 58 pass | HC-DEV-6 53 pass
NEW UI GATE (HC-DEV-7): PASS

VERDICT: CHANGES_REQUESTED (1 blocking)
BLOCKING: Gate 3 — anchor_status sequencing bug in finalizeBctcRefineTool.ts
  reAnchorCorrections runs while OLD pinned row still in DB → finds 2 rows for same label
  → anchor_ambiguous (should be 'ok'). Fix: move DELETE_old_pinned to BEFORE reAnchor.
  Exact location: finalizeBctcRefineTool.ts ~line 262-270 — swap order of reAnchor + DELETE loop.
  Also add anchor_status assertion to DV-HC-8 (closes the false-green gap).
NEXT: fixer | fix reAnchorCorrections order (swap lines 263-270) + add anchor_status assert to DV-HC-8
ROUTE: fixer round=2 (→ architect if round≥2 UNLESS this is a simple swap that's obviously correct)
NOTE: COUNT==1 is fixed, values correct, source_confidence correct — only sequencing is wrong.
```

---

## cycle-154 · 2026-05-30 · HC-QA — BCTC-HUMAN-CONFIRM — CHANGES_REQUESTED (1 blocking)

**Sprint:** BCTC-HUMAN-CONFIRM | **Task:** HC-QA | **Verdict:** CHANGES_REQUESTED

```
date: 2026-05-30T13:00Z
type: live end-to-end gate (8 gate items)
head_commit: bed05d9c
commits_in_scope: 4c40939c(foundation) 89100e07(guards+source_confidence) ae3c5039(HTTP handlers) dca93898(tools#145/#146) 7a3734ed(viewer) 204344ec(flow guard)
toolCount: 154 (confirmed HC-OPS-REBUILD)
test_db: bun:sqlite new Database(':memory:') DI — 52 HC tests + 53 HC-DEV-6 tests = 105 PASS / 0 FAIL
tsc: 0 errors
178-price-history: 7 fail (pre-existing baseline, unchanged)
DDD: PASS | security: PASS

TARGETS: FPT e8ea3df5 (confirm_status=PENDING, flag_count=0) | ACB fea19bae (confirm_status=PENDING, flag_count=0)
NOTE: Both live reports have flag_count=0 (clean OCR). QA gate uses seeded test report
      (UUID aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee, QA-GATE throwaway, cleaned up after gate).

GATE 1 FLAG ENUMERATION: PASS
  GET /flags/{uuid} → flag_count=2 (1 red, 1 yellow)
  red: ocr_value="1.234", image_value="1.500" (exact markdown match)
  yellow: ocr_value=null, image_value=null (PASS)
  Matches bctc_refined_units trust prefixes in markdown.

GATE 2 CORRECTION PERSIST + AUDIT: PASS
  POST /correct/{uuid} {row_id:21571, new_value:1500} → ok:true, source_confidence:1
  Direct DB read — bctc_human_corrections: id=1, old_value=1234, new_value=1500,
    ocr_value_snapshot="1.234", image_value_snapshot="1.500", anchor_status="ok"
  Direct DB read — bctc_table_rows id=21571: value_current=1500, source_confidence=1.0

GATE 3 CORE INVARIANT — CORRECTIONS SURVIVE CRON RE-RUN: FAIL (BLOCKING)
  finalize_bctc_refine on PENDING report with 2 corrections:
  - Selective DELETE preserves corrected rows (id=21571, 21572 survive — CORRECT)
  - INSERT from parser adds NEW rows (id=21573, 21574 — DUPLICATE)
  - Result: 4 rows for 2 labels. Same label appears twice.
  - reAnchorCorrections sees 2 rows with identical stable key → anchor_ambiguous (WRONG)
  - Corrected VALUES survive (1500 and 600 — PASS on value), but:
  - DUPLICATE ROWS = table doubled; anchor_ambiguous = correction no longer tracked correctly
  ROOT CAUSE: Layer 2 selective DELETE preserves old rows AND finalize INSERTs new rows
              from the same parsed markdown → duplicates. Architecture says old corrected row
              must be REPLACED by the new parser row (with correction applied), not ADDED.
  FIX NEEDED: After INSERT, DELETE the old pinned row (the one whose ID is in bctc_human_corrections)
              if a new row with the same stable key was successfully inserted.
              OR: use INSERT OR REPLACE with stable key constraint.
  DV-HC-8 test is a FALSE-GREEN: uses find() on rows, not COUNT check — passes with duplicates.

GATE 4 RE-ANCHOR NEVER MIS-ATTACHES: PASS (safe-fail behavior PROVEN)
  anchor_ambiguous is set when >1 rows match stable key — CORRECT behavior.
  No correction mis-applied. Safe-fail proven.
  NOTE: Gate 4 anchor_ambiguous was triggered by Gate 3 duplicate-row bug, not genuine
        duplicate labels in the report. Genuine duplicate-label test (DV-HC-11/12) passes.

GATE 5 FINAL-CONFIRM LOCK: PASS (all 3 layers)
  Layer 1: POST /confirm → confirm_status=CONFIRMED; direct DB: confirmed_at set
  Layer 1: CONFIRMED report excluded from get_bctc_pending_refine (found=NO, 11 others present)
  Layer 2: finalize on CONFIRMED → {ok:true,skipped:true,reason:"confirmed"}; row_count unchanged=4
  Layer 3: HC-AF-1 Step 3b guard present in refine_bctc_md/flow/main.md (grep verified)
  POST correct on CONFIRMED → 409 {error:"report_confirmed"} PASS
  POST /reset → confirm_status=PENDING, final_confirmed_at=null, corrections=2 (intact) PASS

GATE 6 ESC-5 CLEARS: PASS
  All corrected rows (old 21571/21572 + new 21573/21574) have source_confidence=1.0
  ESC-5 (threshold <0.50) would not fire on corrected rows.

GATE 7 ADDITIVE / NO REGRESSION: PASS (conditional)
  HC tests: 105/105 PASS (52 HC-human-confirm + 53 HC-DEV-6-inspector-panel)
  AR baseline: 82/82 PASS (no regression in prior sprint)
  Pre-existing: 178-price-history 7 fail (same as pre-HC baseline — no new failures)
  HCM tests: 29/29 PASS
  Full bun test OOM/crash (host memory — not a regression, pre-existing fleet limitation)
  tsc 0 errors

GATE 8 VIEWER: PASS
  bctc-inspector.html has "Sửa tay / Xác nhận cuối" tab (grep: 6 occurrences)
  loadFlags/renderFlaggedCells/hcBtnConf/hcConfirmStatus functions present
  All endpoints referenced: /flags, /correct, /confirm, /confirm/.../reset
  Vietnamese labels: "Giá trị OCR", "Giá trị ảnh", "ĐÃ XÁC NHẬN", "Chờ xác nhận" present
  File: apps/mcp-server/src/interface/bctc-inspector.html

VERDICT: CHANGES_REQUESTED (1 blocking issue)
BLOCKING: Gate 3 — Layer 2 duplicate-row bug in finalizeBctcRefineTool.ts
  After selective DELETE + INSERT, corrected row IDs are kept AND new parser rows added
  → duplicates + anchor_ambiguous on re-anchor. DV-HC-8 is a false-green (uses find(), not COUNT).
  Exact file:line: finalizeBctcRefineTool.ts — the selective DELETE block + DV-HC-8 test assertion
NEXT: dev-mcp-server | fix Layer 2 duplicate-row: after INSERT, DELETE old pinned rows whose
      stable key now has a newly-inserted counterpart. Add COUNT assertion to DV-HC-8.
ROUTE: fixer round=1 (round < 2)
```

---

## cycle-153 · 2026-05-30 · AR-QA bake-off — APPROVED (GATE GREEN)

**Sprint:** BCTC-AGENTIC-REFINE | **Task:** AR-QA (bake-off phase) | **Verdict:** APPROVED (all 7 gate items GREEN)
Head: 3b4c62a2. FPT 24 rows / ACB 114 rows. tsc 0 errors. 100 pass/0 fail.

## cycle-152 · 2026-05-30 · AR-QA — CHANGES_REQUESTED → AR-OPS fix applied. See cycle-153.

---

## Archive (cycles ≤153)

Historical QA cycle logs (cycle-153 and earlier) archived here for reference.
Full session history available via git log `docs/agent-memory/notebooks/qa.md`.

---

**Binding:** Active cycle only (≤200L). Historical detail pruned 2026-05-30.
