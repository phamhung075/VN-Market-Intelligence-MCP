## Task Report FIX-BCTC-VPS-QUEUE-SYNC

changed: [apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts, apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts, apps/mcp-server/src/__tests__/FIX-BCTC-VPS-QUEUE-SYNC.test.ts, docs/agent-memory/notebooks/dev-mcp-server.md]
tests: 18 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0
verdict: APPROVED

### Gate Evidence

**UNIT — 18/0 UNCACHED**
bun test src/__tests__/FIX-BCTC-VPS-QUEUE-SYNC.test.ts --no-cache → 18 pass / 0 fail / 64 expect() / 3.52s

**TSC CLEAN**
bun tsc --noEmit exit 0 (background task b347l1ozw, no output)

**COMMIT SCOPE**
git show --stat f1c66801 → 4 files: test + 2 prod source + dev-mcp-server.md. NO orch-state.json.

**FENCE G1 (cap guard RED proof)**
Break: `if (row.attempts + 1 >= MAX_404_ATTEMPTS)` → `if (false && ...)` → 5 tests RED (G1-TC-3, G1-TC-4, G1-TC-5, G1-TC-6, INT-1). Restore → 18/0 GREEN. Guard is real.

**FENCE G2 (orphan filter polarity RED proof)**
Break: `AND source_url NOT LIKE ?` → `AND source_url LIKE ?` → 5 tests RED (G2-TC-1, G2-TC-2, G2-TC-3, G2-TC-4, INT-1). Restore → 18/0 GREEN. Filter is real.

**GENERIC CHECK — NO hardcoded ticker list**
grep VNM/VEA/SHB/HUT/DIG/DXG/KDH/PDR/MSN/FRT in both source files → comment-only hits (doc examples). No conditional logic by ticker name. Cap enforced by attempt count (MAX_404_ATTEMPTS=10), orphan detection by URL pattern (NOT LIKE '%/20%').

**DDD PASS**
Both files: interface/scheduler layer — imports from infrastructure (db/schema, logger, fetchers). No domain→infrastructure forbidden import path.

**SECURITY PASS**
No process.env (uses Bun.env), no hardcoded secrets, all SQL parameterized (prepared statements with ?).

**MOCK-GUARD EXIT 0**
bash scripts/audits/mock-guard.sh --files "bctcPdfPullJob.ts bctcQueueEnricherJob.ts" → PASS.

### G1 — cap logic (live + test)
MAX_404_ATTEMPTS=10 at bctcPdfPullJob.ts:79. recordFailedAttempt() at line 312: attempts+1 >= cap → updateDeferredInfra, else updateAttempt. All 4 failure paths (fetch throw, HTTP error, read body fail, size guard) route through recordFailedAttempt. Pre-existing 328 deferred_infra@attempts=0 rows are NOT from this cap — they predate the fix (no cap existed before f1c66801).

### G2 — orphan re-sync (LIVE confirmed)
Enricher ran at 2026-06-13 20:15:00 UTC (first cycle post-rebuild).
Before reset: VNM/VEA/SHB/HUT/DIG/DXG/KDH/PDR/MSN/FRT all had 532-562 attempts, placeholder VPS URLs.
After G2: all 10 → pending, attempts=0, source_url=NULL (confirmed via live DB query).
No row above 0 attempts in pending (26 rows, max_att=0). Infinite-404 hammer broken.

### G3 — VNM+MSN Q1-2026 terminal state (DISCOVERY WORKING)
Enricher 20:15 cycle: attempted discovery, returned 0 URLs (first-pass guard — attempts stays 0).
Enricher 20:45 cycle: SUCCESS discovery.
- VNM Q1-2026: source_url = https://staticfile.hsx.vn/Uploads/UploadDocuments/2458538/20260429%20-%20VNM%20-%20BCTC%20DA%20SOAT%20XET%20Q1.2026-%20HOP%20NHAT%20VN.pdf
- MSN Q1-2026: source_url = https://staticfile.hsx.vn/Uploads/UploadDocuments/2457263/20260424%20-%20MSN%20-%20Bao%20cao%20tai%20chinh%20hop%20nhat%20Q1.2026%20-%20signed.pdf

Both are real dated PDFs published April 2026. Status = pending (ready for PDF pull job). Verdict: genuine-available, discovery working correctly (NOT a discovery defect).

### G4 — stale-pending convergence trajectory
Queue snapshot at 2026-06-13 20:45 UTC:
- deferred_infra: 328 (pre-existing, not from this cap)
- done: 48
- url_not_found: 27
- pending: 26 (max attempts=0 across all 26)

Of 26 pending rows: 10 now have hsx.vn real URLs ready for pull, 15 null (small caps / not yet published), 1 HNX URL. No re-hammer. All attempts at 0. Trajectory healthy: 10 of 26 will transition to done on next pull cycle; remainder will converge within MAX_ENRICH_ATTEMPTS gate.

BCTC eval: N/A (scheduler/queue fix, no report_id in scope).
