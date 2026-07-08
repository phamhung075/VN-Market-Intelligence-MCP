# Decision Journal: ops — Step FACTORY-INTERFACE-extract-finalizeBctc-usecase Docker Close Gate

**Date:** 2026-07-08  
**Task ID:** FACTORY-INTERFACE-extract-finalizeBctc-usecase  
**Session UUID:** 5a45feda-431e-46c8-941d-a6539a0eca77  
**Agent:** ops  
**Phase:** Docker Microservice Code-Change Close Gate (Steps 1-4)

---

## Context

Dev-mcp-server extracted 1100L of application-layer logic from `finalizeBctcRefineTool.ts` (interface layer) into 7 new files under `apps/mcp-server/src/application/usecases/finalizeBctcRefine/`:

- `finalizeBctcRefineTypes.ts` — shared row type
- `finalizeBctcRefine.ts` — main use case (call order + atomic transaction preserved)
- `backfillScalarColumns.ts` (BLOCK-1) — 4 sub-functions, each <=120L
- `deriveRatioColumns.ts` (BLOCK-3)
- `revalidateBalanceIdentity.ts` (BLOCK-4)
- `recomputeExtractionConfidence.ts` (BLOCK-5)
- `recomputeBctcEval.ts` (BLOCK-2)

Interface file reduced from 1349L to 102L (schema + validation + thin orchestration).

**Extraction commit:** `56ee74725`  
**Review move:** `f9ed7f850` (task promoted to REVIEW by dev-mcp-server)

---

## Decision: Proceed with Docker Close Gate Steps 1-4

### Rationale

This is a pure code-relocation refactor, not a feature change or behavioral logic change:
- Every return point in the 1100L function used the exact same MCP response wrapper
- Call order preserved line-by-line
- Single atomic `db.transaction` boundary unchanged
- All extracted functions fit DoD constraint (<=120L each)
- Dev-verified: targeted BCTC test suite 293/293 pass, tsc clean, eslint clean on all touched files

The extraction is correct and ready for container rebuild + liveness verification.

### Step 1: Memory Check → PASS

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Docker mcp-server | 154.4 MiB | < 7 GiB | ✓ |
| Docker full stack | ~1.4 GiB | < 8 GiB | ✓ |
| Host free pages | 18,578 | healthy | ✓ |

Verdict: Memory healthy, proceed with rebuild.

### Step 2: Build + Deploy → PASS

```bash
docker compose build --build-arg GIT_SHA=f9ed7f85034111d34c9a6cf88e97f18db31b57e3 mcp-server
docker compose up -d --no-deps mcp-server
```

- Build completed: all base layers cached, source copy + Bun compile in 1.7s
- Container recreated + started: 7 seconds to healthy status
- No peers affected (single-service, --no-deps, no cascade restart)

### Step 3: Container Health → PASS

```
docker compose ps mcp-server
NAME: vn-market-intelligence-mcp-mcp-server-1
STATUS: Up 7 seconds (healthy)
PORTS: 0.0.0.0:3000->3000/tcp
```

- Health check passed (Dockerfile's built-in curl probe)
- Port 3000 binding active
- Peer audit: 12/12 services running, zero side effects

### Step 4: SHA Gate Verification → PASS

```
bash scripts/verify-deploy-sha.sh mcp-server
OK: deployed SHA matches HEAD (f9ed7f85034111d34c9a6cf88e97f18db31b57e3)
```

- Container label `vn.market.git_sha` verified
- SHA gate exit 0 — deploy is AUTHORIZED

### Endpoint Verification

| Endpoint | Status | Payload |
|----------|--------|---------|
| /health (mcp-server) | 200 | toolCount: 183, uptime: 14.15s |
| /health (gateway:4000) | 200 | all 9 services green |
| Peer latencies | normal | stock: 1ms, news: 2ms, pdf: 4ms, rag: 2ms |

- No tool count regression
- No new/removed MCP tools from extraction
- Live database transaction calls will route to the relocated `finalizeBctcRefine.ts` entry point (runFinalizeBctcRefine), which wraps the result in the MCP content shape at the interface layer — behavior identical to pre-extraction

---

## Decision Outcome

✓ **APPROVED** — All Steps 1-4 pass per runbook.

- Ops responsibility: COMPLETE
- Next: QA Step 5 RAW-verify (liveness + finalize_bctc_refine actual invocation against real report)
- QA must verify: bctc_table_rows / extraction_confidence / bctc_eval output IDENTICAL pre/post for same input
- After QA passes: po performs Step 6 DONE_VERIFIED flip

**Board flip:** orch-state.task_board.qa, status=QA, next_agent=qa

---

## Commit

- **Ops build/deploy log:** db2eddb75 (notebook entry + board flip)
- **Timestamp:** 2026-07-08T14:27:15Z

---

## Precedent

This gate sequence mirrors the immediately-preceding sibling task `FACTORY-SCHEDULER-prediction-default-dedup` (commit `bf35b2999`), which followed the exact same 4-step path:
- Step 1: Memory check PASS
- Step 2: Rebuild PASS
- Step 3: Container health PASS
- Step 4: SHA gate PASS
- → Routed to QA (commit `ee9152d7e`)
- → Routed to PO (commit `b9fa123f9`)
- → Done verified

No deviations; standard runbook sequence completed.

