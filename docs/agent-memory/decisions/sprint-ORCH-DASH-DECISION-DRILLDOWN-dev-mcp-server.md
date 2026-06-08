# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · dev-mcp-server

**Sprint goal:** ORCH-DASH-DECISION-DRILLDOWN
**Agent:** dev-mcp-server
**Started:** 2026-06-08T00:45:00Z

---

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-08T09:00:00Z
**task-id:** RE-QUEUE-BCTC-BLOCKED-PDFX-26
**what-done:** Re-queued 26 `blocked_pdf_extractor` rows → `pending`; before: blocked_pdf_extractor=26, pending=0; after: blocked_pdf_extractor=0, pending=26; raw SELECT via API confirmed; pdf-extractor /health=200 pre-checked (A-20 fix commit 62fcc240, qa-PASSED).
**what-considered:**
- Abort if /health != 200 (hard rule — do not re-queue into dead extractor)
- DELETE rows (forbidden — no-silent-deletion hard rule)
- Set to any status other than `pending` (wrong — the cron drains `pending`; any other value leaves rows stuck)
**why-decision:** `pending` is the live drain enum (schema DEFAULT, confirmed from bctc_vps_queue DDL); bound-param prepared statement used (no shell interpolation); status-only change preserves full row history; normal bctc cron will drain pending queue without manual trigger.
**why-change:** no change from spec; UPDATE changes=26 matches classification table from S3

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-08T08:00:00Z
**task-id:** FIX-SBV-REFRESH-SILENT-SWALLOW
**what-done:** Added `throw err` after WORK-channel alert in `runSbvRatesRefreshJob` catch block so `wrapRun/recordJobRun` records `status='error'` on fetch failure; updated TC-3/TC-4 in sbvRatesJob.test.ts to assert re-throw; wrote FIX-SBV-REFRESH-SILENT-SWALLOW.test.ts (6 tests incl. AC-1 DB integration).
**what-considered:**
- Option A: Return a sentinel value from the catch block that wrapRun interprets as error (requires wrapRun API change — out of scope)
- Option B: Re-throw after alert, mirroring commit b7ce338f macro pattern (minimal, zero API change)
**why-decision:** Option B is the exact same pattern shipped for FIX-MACRO-REFRESH-DEAD — lowest risk, zero interface change, wrapRun/recordJobRun already handles throws correctly (line 230-233 of cronJobRunStore.ts).
**why-change:** no change from task spec; AC-1 DB integration test (SBV-SS-05) verified live row = status='error'

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-08T02:07:00Z
**task-id:** FIX-BCTC-VPS-QUEUE-STALE-TRIAGE
**what-done:** Classified 354 non-done bctc_vps_queue rows into two new explicit statuses (deferred_infra, blocked_pdf_extractor); C-16 check now returns 0.
**what-considered:**
- Option A: Delete historical rows (fast, breaks hard-rule "no silent deletion")
- Option B: Mark them `skipped` (would mix with existing skip semantics)
- Option C: Two explicit statuses (`deferred_infra` + `blocked_pdf_extractor`) per PO spec
**why-decision:** Option C preserves full row history, makes intent explicit in the DB, and allows future re-queue via simple SQL without recreating data. The two distinct statuses separate "infra dead" from "gated by fix".
**why-change:** no change from PO spec; all 4 parts implemented as specified

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-08T00:30:00Z
**task-id:** FIX-BCTC-LOWCONF-REPARSE-BATCH
**what-done:** Ran force-reparse for 9 BCTC ticker-period pairs (reports #3077-#3085 scope). Created generalized migration script scripts/migrations/reparse-bctc-reports.ts. Resolved report 3085 (REE 2026-Q1) with wontfix + root cause.
**what-considered:**
- Option A: Just call run_bctc_batch_sweep via gateway (fast, but it only queries DB — no reparse)
- Option B: Reset bctc_vps_queue to pending + POST local PDFs to /api/push-bctc-pdf (proper reparse path)
- Option C: Delete financial_reports rows to force complete fresh ingest
**why-decision:** Option B is the correct idiomatic path — it exercises the full production pipeline (pdf-extractor Tier 1 → Tier 2 URL → Tier 3 pdf-parse fallback) with the new parsing code (06c65978) running in the live container. Option A was a no-op. Option C is more destructive.
**confidence-result:** PPC (already 0.625, confirmed stable), NVL (0.25, parent-only), KBC/VHM/HCM/HSG (image PDFs, pdf-extractor unhealthy), CTG (bank format + wrong PDF coverage), REE (section-total regex gap). Zero delta is an honest result — magnitude-normalize fix was targeted at PPC-type decimal-shift; these tickers have different root causes.
**why-change:** no change from plan; confidence changes expected only where magnitude was the root cause

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-08T00:45:00Z
**task-id:** FIX-FRED-YAHOO-WEEKEND-STALE
**what-done:** Fixed 4 null-assert test failures and weekend FRED stale-serve path (5.33→3.62) across 5 files.
**what-considered:**
- Option A: patch test DDL to add data_env column (symptom fix — tests would pass but production path still fragile)
- Option B: make production INSERT resilient to missing data_env column + fix FRED_API_KEY guard + add EFFR fallback (root cause fix)
- Option C: backfill tracked_indicators from a one-time script (non-reusable)
**why-decision:** Option B fixes all 3 root causes simultaneously: schema-mismatch INSERT resilience, API key guard bypass for test injection, and CSV format fallback for fredEffrIorb. Startup bridge ensures Monday dish sees 3.62 without waiting for next daily cron.
**why-change:** no change from plan
