# PM — ALPHA-S2-RAG-FTS-REBUILD-CRON (2026-07-15)

## Status
**PENDING** dev-mcp-server implementation phase.

## Acceptance Criteria & DoD (minted)
1. New `ragRebuildFts()` client fn in `ragHttpClient.ts` — calls `POST /admin/rebuild-fts`, 90s deadline (vs DFR-P3 ~30-60s build + safety margin)
2. New `ragFtsRebuildCronJob.ts` — single-branch HARD-fail contract (no SOFT state)
3. Cron registered in 3 places: `cronConfig.ts` (15 20 * * * UTC slot, off-market), `schedulerJobTable.ts`, 3 docs (cron-registry.json, system-map.json, cron-jobs.md)
4. Test-count bumps: `1190-pipeline-watchdog.test.ts` (68→69), `FACTORY-SCHEDULER-job-table-registry.test.ts` (61→62, 83→84)
5. New test file: `ALPHA-S2-RAG-FTS-REBUILD-CRON.test.ts` — 3 paths (success, HTTP error, no-DB-import proof)
6. Zone corrected: "multi" → "apps/mcp-server/" (single atomic task, no split)

## Test Plan (for dev-mcp-server)
**Unit (mocked):**
- Success path: mock rebuildFn resolves → notifyBug NOT called, result.rebuilt=true
- Error path: mock rebuildFn rejects → notifyBug called with endpoint error detail, result.rebuilt=false
- Source inspection: scheduler module never imports DB/schema layer

**Behavioral (QA, live post-deploy):**
- Synthetic entry index → pre-rebuild search (baseline) → manual rebuild trigger → post-rebuild search confirms BM25 hit
- Verify cron_job_runs row appears after 20:15 UTC fire

## Reference
- Architect brief: commit 53aeab786 (2026-07-15-alpha-s2-rag-fts-rebuild-cron.md)
- Sibling pattern: ALPHA-S2-OMO-LIQUIDITY-CRON (commit ae45fd0e7)
- rag-service endpoint: POST /admin/rebuild-fts (already shipped DFR-P3, 2026-06-08)
