# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · dev-mcp-server

**Sprint goal:** ORCH-DASH-DECISION-DRILLDOWN
**Agent:** dev-mcp-server
**Started:** 2026-06-08T00:45:00Z

---

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
