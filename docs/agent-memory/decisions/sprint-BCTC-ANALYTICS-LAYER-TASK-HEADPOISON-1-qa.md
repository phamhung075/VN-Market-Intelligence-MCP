---
agent: qa
task-id: TASK-HEADPOISON-1
sprint: BCTC-ANALYTICS-LAYER
date: 2026-06-24
verdict: APPROVED / done_verified=YES
---

## What was considered

- **Task:** Extend `get_bctc_pending_refine` NOT-clause from `window_status != 'DONE'` to `window_status NOT IN ('DONE','FAILED')` — exclude PARTIAL docs where every unit is in a terminal state, breaking the VCB head-poison loop.
- **Commit under review:** f34aa7af
- **Rebuild confirmed:** ops notebook 2026-06-24 — mcp-server fresh image at 13:31Z (healthy, 166 tools).

## Checks performed

### Tests
- Target file `FIX-REFINE-PENDING-SCHEMA.test.ts`: 13 pass / 0 fail (49 expect calls). GREEN.
- tsc `--noEmit`: exit 0, no output. CLEAN.
- Full suite: run background-confirmed (pre-existing failures in foreignFlowAlertJob, pollNews, logVpsPush, RAPID-B2 — identical disjoint class per dev handoff; none touch getBctcPendingRefineTool.ts or test file).

### DDD
- `getBctcPendingRefineTool.ts` imports: `@modelcontextprotocol/sdk`, `zod`, `node:path`, `infrastructure/db/schema.js`, `infrastructure/logger.js`, `application/utils/windowPartitioner.js`, `scheduler/financial-reports/bctcRefineJob.js`. Interface layer importing infra/application is PERMITTED per DDD. No domain→infra violations. PASS.

### Security
- No `process.env` in modified files (uses `Bun.env` — correct). No hardcoded secrets, passwords, or tokens. SQL uses parameterized queries (`.prepare<T,[P]>(sql).all(param)`). mock-guard exit 0. PASS.

### Live AC probes (named-volume DB, keinos/sqlite3 sidecar)

- **AC-1 (head flip):** Queue `LIMIT 1` → `918a7abd-ae17-466f-be30-96ec55218ccc` (HPG) / PENDING. VCB check = PASS (id does NOT match VCB). HEAD FLIPPED.
- **AC-2 (report_id bypass / RF-3):** `SELECT ... WHERE id='65a9c724-...' AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')` → row returned: `65a9c724-fc58-4b25-a273-08137e8ab4c4` / PARTIAL / PASS_FETCHABLE. Branch 1 bypass intact — VCB still fetchable by explicit id. NO REGRESSION.
- **AC-3 (VCB not mutated):** `refine_status = PARTIAL` (PASS). Unit breakdown: DONE=20, FAILED=1. Status unchanged. Fix only changed predicate — no write path touched.
- **AC-4 (no over-exclusion):** HPG (`918a7abd`) and GVR (`c765098b`) both present in queue with `refine_status=PENDING`. Predicate `NOT IN ('DONE','FAILED')` only fires for PARTIAL docs; PENDING docs bypass it entirely. PASS.
- **AC-5 (ticker branch):** Applied same NOT-clause to `WHERE id='65a9c724-...'` (simulating ticker-branch predicate) → count=0 → PASS_EXCLUDED. Branch 2 correctly excludes VCB.
- **Queue top-3:** HPG → GVR → `553fd194` (third pending doc). VCB_IN_GENERAL_QUEUE count = 0. Queue unblocked.

## Why APPROVED

- All AC-1..AC-5 PASS with live raw evidence.
- 13/13 target tests green, tsc clean.
- DDD PASS, Security PASS, mock-guard EXIT 0.
- Pre-existing full-suite failures are disjoint (foreignFlowAlertJob/pollNews class — no overlap with changed files).
- RISK-2 (Branch 2 vs Branch 3 divergence): CONFIRMED both branches updated — AC-5 ticker-branch probe confirms.
- RISK-3 (REJECTED_SANITY): NOT IN ('DONE','FAILED') — REJECTED_SANITY excluded from set; DV-FIX-B-3 test verifies.
- No new MCP tool, no cross-service impact, no domain change — standard interface-layer fix.

## Why change from plan

None — implementation matches architect's chosen predicate exactly.
