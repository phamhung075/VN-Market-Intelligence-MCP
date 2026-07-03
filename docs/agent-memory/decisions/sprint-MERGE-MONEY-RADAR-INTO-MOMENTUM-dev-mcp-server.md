# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · dev-mcp-server

**Sprint goal:** Merge Money Radar indicators into the momentum cowork loop.
**Agent:** dev-mcp-server
**Started:** 2026-07-03T01:44Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-03T01:44Z
**task-id:** FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING
**what-done:** search_similar_context (analysis.ts L563) now wraps the ragSearch()
call in its own try/catch; on rag-service timeout/ECONNREFUSED/non-200 it WARNs
(not ERRORs) and degrades to an empty raw-result set (→ "No similar context
found."), mirroring appendStockHexagramHttp's L84 service-down omit-block
pattern, instead of falling through to the outer catch's hard "Error searching
context: …" text that was blocking bctc-analyst Step 2b for 4 consecutive
cycles (BUG#3397).
**what-considered:**
- only path: catch only the ragSearch call (not the whole handler body) so a
  genuine post-search bug (recency-weighting, formatting) still surfaces as a
  real error — only the rag-service HTTP boundary gets the graceful-degrade
  treatment, per SCOPE GUARD (part (a) only, no rag-service touch).
- did NOT change ragHttpClient.ts's existing AbortSignal.timeout(8_000) — it
  is already bounded well under the MCP tool-call budget (60s precedent from
  fetch_and_analyze); Part (a) only needed the CALLER to treat that bounded
  failure as non-fatal, not a new bound.
**why-decision:** Narrowest fix that satisfies the AC (empty result + WARN,
zero analyst-blocking) without bundling the separately-tracked root cause
(FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP).
**why-change:** no change from plan (PO triage scoped this to analysis.ts:511/563
mirroring analysis.ts:84 — implemented exactly that).

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-03T02:05Z
**task-id:** FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING
**what-done:** Full-suite run exposed 2 of my own new WARN-log-assertion tests
flaking (0/7→passed isolated, 2 failed in full 1167-file run) — root-caused to
a PRE-EXISTING, unrelated defect: `1466-sync-db-corruption-bail.test.ts`'s
`afterAll` re-registers `mock.module(".../logger.js", ...)` with its OWN fake
no-op stub (mislabeled `_realLogger1466`) instead of the genuine logger —
Bun's `mock.module()` is process-wide+permanent, so this silently no-ops
`logger.warn/error` console output for every file that runs after it.
**what-considered:**
- fix 1466's afterAll directly (root cause) — REJECTED: different file,
  outside this task's SCOPE GUARD ("1 tool path + tests only... do NOT bundle").
- leave the flaky console.log-capture assertion as-is — REJECTED: AC requires
  the error path be genuinely verified, not order-dependent-flaky.
**why-decision:** Rewrote my 2 log-level tests to spy via direct object
mutation on the shared `logger.warn`/`.error` methods (established precedent:
1352a-scheduler-job-wrappers-macro-marketscan.test.ts "object mutation — NO
mock.module needed") instead of console.log interception — robust regardless
of any other file's mock.module() pollution, since analysis.ts and my test
import the identical singleton reference. Re-verified: full suite rerun,
68 fail/4 errors (down from 6 errors), zero new-file failures, same
pre-existing Bun C++ teardown panic (documented, unrelated).
**why-change:** did not touch 1466's file — reported as a separate pre-existing
test-infra hazard in RETURN, not silently worked around by scope-creep.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-03T05:16:36Z
**task-id:** FIX-BCTC-ENRICHER-STUCK-BACKLOG
**what-done:** Deploy gate (mcp-server rebuild a169f5e2) cleared externally;
resumed and closed the parked data-migration leg: docker cp+exec (not a
rebuild) ran reset-bctc-enricher-stuck-backlog-2026-04.ts against the LIVE
container — dry-run 21/21 matched, apply 21/21 reset, 2nd dry-run 0/0
(idempotent). Verified stamping on the very next */15 cycle: row ACV
attempts 0->2 + last_attempt NULL->set — root-cause fix confirmed live.
**what-considered:**
- generic docker exec browsing (ls/env) to inspect container — REJECTED by
  permission classifier as unauthorized production read; did not work around.
- targeted docker cp+exec of the already-existing, already-tested canonical
  migration script (established precedent: reingest-bctc-report.ts pattern)
  — ALLOWED; ran that instead, scoped to the single vetted script.
**why-decision:** Direct-evidence stamping proof (attempts+last_attempt
advancing on a reset row) satisfies the dispatch's Step-3 acceptance
regardless of whether SSC/HSX resolves source_url — mechanism vs upstream
availability kept separate per dispatch guidance.
**why-change:** none — task explicitly said "not a docker deploy"; interpreted
as no build/up/recreate (respected), not as no docker exec of an existing
script against the running container (required to touch the named-volume DB).
