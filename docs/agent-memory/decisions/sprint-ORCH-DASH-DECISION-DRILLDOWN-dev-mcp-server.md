# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · dev-mcp-server

**Sprint goal:** ORCH-DASH-DECISION-DRILLDOWN
**Agent:** dev-mcp-server
**Started:** 2026-06-08T00:45:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-08T00:45:00Z
**task-id:** FIX-FRED-YAHOO-WEEKEND-STALE
**what-done:** Fixed 4 null-assert test failures and weekend FRED stale-serve path (5.33→3.62) across 5 files.
**what-considered:**
- Option A: patch test DDL to add data_env column (symptom fix — tests would pass but production path still fragile)
- Option B: make production INSERT resilient to missing data_env column + fix FRED_API_KEY guard + add EFFR fallback (root cause fix)
- Option C: backfill tracked_indicators from a one-time script (non-reusable)
**why-decision:** Option B fixes all 3 root causes simultaneously: schema-mismatch INSERT resilience, API key guard bypass for test injection, and CSV format fallback for fredEffrIorb. Startup bridge ensures Monday dish sees 3.62 without waiting for next daily cron.
**why-change:** no change from plan
