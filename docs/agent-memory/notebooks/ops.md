# Ops — Notebook

Zone: Docker/VPS/DB operations, incident response, close-gate verification.

### Pointer to Prior Cycles
→ Cycles 2026-08-06 through 2026-08-06T18:50Z archived to `docs/agent-memory/sessions/ops-cycles-archive-20260808.md`
→ Cycles 2026-08-12 (RAG-service incidents and rebuild) archived to `docs/incidents/ops-cycle-20260812-rag-service-below-floor.md`

---

## Cycle 2026-08-13T15:00Z — FACTORY-APIGW-split-capability-prober Close-Gate Rebuild

**Task**: Deploy split-capability-prober code (commit 9fad8d4ad, 2026-07-24) to live api-gateway container. Code is CODE-ACCEPTED but NOT deployed — running image built 2026-07-15 (13 days stale). Deploy gate: PO-AUTHORIZED (no user gate required).

**Pre-Rebuild State**:
```
Running Image:        vn-market-intelligence-mcp-api-gateway:latest
Image Created:        2026-07-15T15:05:40Z
Code Commit:          9fad8d4ad (2026-07-24T14:24:00Z) — NOT in running image
Current HEAD:         832cd5a6e (2026-08-13)
Commit Ancestor:      ✓ 9fad8d4ad IS ancestor of 832cd5a6e (verified via git log)
Peer Commits:         251cda70e, 868bf8d1d, b184dde9f also undeployed since 2026-07-15
Rebuild Discriminator: REAL gate (go list -deps ./cmd/server confirms pkg/infrastructure IS compiled into binary)
```

**Rebuild Execution** (ops-flow scoped, single-service ONLY):
```bash
docker compose build --build-arg GIT_SHA="832cd5a6e015908907f071aaa9dc468b214f2b85" api-gateway
docker compose up -d --no-deps api-gateway
bash scripts/verify-deploy-sha.sh api-gateway
```

**Build Phase** ✓ PASS
```
Builder layer:      golang:1.22-alpine (cached from prior use)
Binary compilation: CGO_ENABLED=0 GOOS=linux go build -o gateway ./cmd/server/ SUCCEEDED
Export:             Completed in 1.3s
Final Image SHA:    59be41f1a749934e7e8531fc3ba362374bc93d4150444fd4590a84c1e20dcc7c
```

**Service Restart** ✓ PASS
```
Container Action:    Recreated (not killed/restarted bare)
Service Status:      Up and running
Port 4000 binding:   ✓ Active
```

**Deployment Verification** ✓ PASS
```
Verify Script Output: OK: deployed SHA matches HEAD (832cd5a6e015908907f071aaa9dc468b214f2b85)
Exit Code:           0
```

**Peer Service Health Check**:
```
mcp-server:    Not checked (scoped rebuild)
pdf-extractor: Not checked (scoped rebuild)
All other:     Not checked (scoped rebuild)
```

**Close-Gate Handoff to QA** ✓ PASS
```
Handoff Method:  scripts/ops-closegate-handoff.jq via orch-apply.sh
Task ID:         FACTORY-APIGW-split-capability-prober
From Lane:       review[]
To Agent:        qa (next_agent field only; lane unchanged)
Orch-Apply:      Validation: Stage 0 + Stage 1 PASS
Conservation:    task_total=745, signal_total=189 (verified clean)
Applied:         ✓ Successfully applied to docs/data/orch/orch-state.json
Row Status:      REVIEW (unchanged) | next_agent: qa
Timestamp:       2026-08-13T15:00:48Z
```

**Summary**: Split-capability-prober close gate (Step 4) completed successfully. Code deployed and verified live. Task handed to qa for final acceptance testing.

**Session:** 632721c2-41e4-4aff-8d06-a47cf80dc0d7 (router dispatch)
