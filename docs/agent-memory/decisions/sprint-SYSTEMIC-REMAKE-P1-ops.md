# Decision Journal — ops — Sprint SYSTEMIC-REMAKE-P1

## STEP ops-S1: FACTORY-DOMAIN-relocate-stock-catalog Docker Close Gate (2026-07-08T17:02Z)

**Task ID:** FACTORY-DOMAIN-relocate-stock-catalog  
**Context:** FACTORY DOMAIN refactor — STOCK_CATALOG pure-data table relocated from apps/mcp-server/src/domain/services/stockAliases.ts (828L → 265L) to new file stockAliases/catalog.ts (618L). All 21 consumers re-exported correctly. Dev-team pre-verified: tsc clean, eslint clean, 211/211 tests pass, 195/195 consumer tests pass, byte-identical equivalence verified on 66 tickers + 5 detection functions (0 mismatches).

**Decision:** Execute Docker Microservice Code-Change Close Gate Steps 1-4 per docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate.

**Rationale:**
- Pure relocation (no behavior change) triggers rebuild_required=true because it affects a live Docker microservice (mcp-server)
- All code quality gates (tsc, eslint, tests) already passed during dev phase
- Ops closes the deployment gate (Steps 1-4: memory check, rebuild, container verify, SHA gate)
- QA performs Step 5 (RAW-verify: liveness + tool behavior)
- PO performs Step 6 (mark DONE_VERIFIED in orch-state)

**Execution Summary:**

| Step | Check | Result | Evidence |
|------|-------|--------|----------|
| 1 | Docker memory (mcp-server 4.65% of 3GiB, stack ~791MiB of 8GiB) | ✓ PASS | `docker stats`, `vm_stat` |
| 1 | System memory (65300 pages free) | ✓ PASS | `vm_stat` |
| 1 | Disk space (32GB free ≥ 15GB threshold) | ✓ PASS | `scripts/preflight-disk.sh` |
| 2 | Build mcp-server with GIT_SHA=64a1a135b | ✓ PASS | Docker build completed, image exported |
| 2 | Container up -d | ✓ PASS | `docker compose up -d mcp-server` completed |
| 3 | Container health status | ✓ PASS | `docker compose ps` → "Up 13 seconds (healthy)" |
| 3 | Peer containers unchanged | ✓ PASS | All 11 peer services remain healthy, no collateral restarts |
| 4 | SHA gate verification | ✓ PASS | `bash scripts/verify-deploy-sha.sh mcp-server` → EXIT 0, deployed SHA = HEAD |
| Bonus | /health endpoint | ✓ PASS | `/health` → 200 OK, toolCount=183 (unchanged), uptime=18.2s |

**Board State Transition:**
- `.head.status`: remains "review" (QA Step 5, PO Step 6 will flow next)
- `.head.active_task_id`: remains "FACTORY-DOMAIN-relocate-stock-catalog"
- `.head.next_agent`: "ops" → "qa" (handoff to Step 5)
- `.head.updated_at`: 2026-07-08T17:02:00Z
- `.head.updated_by`: "ops"
- orch-state update via orch-apply.sh: EXIT 0 (121 coherence warnings unrelated to this task)

**What Went Right:**
1. Pre-flight disk check caught threshold early; preflight-disk.sh ensures CI/CD prevention of 97% disk stalls
2. Single-service rebuild isolated mcp-server without affecting peer containers
3. SHA gate is authoritative (label matches HEAD) — guarantees deployed code ≠ pre-build snapshot
4. Liveness confirmed within 13s of container start (health check responsive)

**What's Next:**
- QA: Step 5 RAW-verify (hit /health, verify behavior unchanged)
- PO: Step 6 mark DONE_VERIFIED (only po may flip to done_verified per runbook)

**Artifacts:**
- Commit 64a1a135b (board + context setup by dev-mcp-server)
- Rebuild: 2026-07-08T17:01:36Z
- Notebook entry: docs/agent-memory/notebooks/ops.md § Docker Close Gate (this session)
- Decision journal: docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-ops.md § STEP ops-S1 (this entry)

