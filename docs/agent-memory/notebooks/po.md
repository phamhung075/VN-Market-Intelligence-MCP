# PO Notebook

**Cycle:** c289 (user /goal — rag-service SCALE pilot Phase 0 kickoff)
**Last update:** 2026-05-24T07:18:44Z
**Status:** Opened Phase 0 for rag-service. status PENDING→ACTIVE, phase pre-0→0, phase0 PENDING→OPEN. All 12 goals calibrated for Python/rag-service. Returned kickoff BATCH (architect ×3 + agent-father ×2) to dev-team dispatcher.

---

## This cycle (c289) — rag-service Phase 0 open + kickoff BATCH

Deliberate user /goal directive (NOT cron). Scope-locked `apps/rag-service/` ONLY. Inherits macro v2.0 L1–L7. SCALE model = thin charter only (NO factory dir — unlike macro pilot-2).

### Ground truth verified (NOT assumed)
- SSOT pilot-status-rag-service.json was status=PENDING/phase=pre-0. Flipped: ACTIVE / phase 0 / phase0 OPEN, kickoff 2026-05-24, deadline 2026-07-05 (+6 sprints). activatedBy cycle-71.
- All 12 calibration fields populated (jq-confirmed: none still hold `<SERVICE` placeholder). JSON valid, NO dup keys. decisionMatrix UNTOUCHED (PO-only, atomic w/ 12/12 — correct).
- Language LOCKED Python (sentence-transformers/LanceDB ML constraint). Port 5002 (system-map). DB rag_service.db, vector table rag_vectors.
- apps/rag-service/ = CLEAN Python DDD (domain/application/infrastructure/interface/main.py/__tests__/pyproject.toml/requirements.txt). NO primitive/module subfolders → rewire+extract, NOT rebuild. Shares Python sandbox-runner gap with pdf-extractor (G1 prereq).
- Flow .claude/flows/dev-rag-service/main.md = thin 19L pointer → developer/microservice-main.md, NO G12 DoD gate → agent-father deliverable. Agent file dev-rag-service.md = 7084B (~7KB, as stated) → agent-father verify-calibrate.
- bug-inventory.json: NO rag entry yet → architect baseline (expect ~1.3-1.5 system-wide fallback) for G10.

### Primitives calibrated
5 candidates: chunk-splitter, similarity-scorer, top-k-selector, context-window-packer, relevance-threshold-gate. Module: retrieval.

### Critical boundaries flagged in calibration
- Embedding model + LanceDB = IMPURE adapters → stay infrastructure/, NEVER primitives. DI at composition root (main.py).
- DETERMINISM (key risk): sandbox feeds PRE-COMPUTED fixed vectors + pinned ranking. ZERO model load, ZERO LanceDB/ANN — else false-reds from float/ANN jitter. Keep HF_HUB_OFFLINE=1 / pre-baked-model cold-start hardening (do NOT regress).
- G7/G8 env audit forbidden incl LANCEDB_|HF_|HUGGINGFACE|OPENAI_API_KEY (+ standard). GOAL DONE criterion = sandbox env audit empty.
- G4 = Python fence per SI-4 (import-linter/ruff analog; NOT depguard/ESLint). SI-4 must settle before G4 AC locked.
- G5 mostly G5b/G5c (clean standalone service, not legacy-TS-in-mcp) — brownfield confirms MCP tools route HTTP to 5002, no direct-import bypass.

### Decision
RETURN BATCH: architect owns brownfield + bug-inventory baseline + Phase-1 task plan (B/C/E bucket for G12 streak) [+ SI-4 Python-fence design note]; agent-father owns dev-agent verify + G12 DoD flow bake. agent-father/architect = maintenance/core, main terminal spawns directly (NOT dev-team execute-tier). WIP=1 (SSOT one active dispatch).

### Carry-over
- Next: await architect brownfield (G5 scope, candidate primitives confirm) + agent-father flow commit (G12 ruleEffectiveAfter SHA) → then Phase 0 exit gate close → Phase 1 dispatch.
- pdf-extractor pilot (sibling Python, c288) opened too — SAME Python sandbox-runner gap. Coordinate: one Python runner serves both. Watch WIP across both Python pilots.
