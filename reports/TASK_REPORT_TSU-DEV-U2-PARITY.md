## Task Report TSU-DEV-U2-PARITY
date: 2026-06-07
sprint: TOOL-SURFACE-UPGRADE
outcome: APPROVED

changed: [docs/data/tool-registry.json (re-generated, totalCount=157), docs/data/project-stats.json (toolCount=157 — no change needed, already synced), docs/data/orch/orch-state.json (task status), docs/handoffs/TASK_TSU-DEV-U2-PARITY.md (Implementation Record)]

tests: 8 pass / 0 fail (parity) | tsc: 0 errors | ddd: N/A (JSON data files) | security: N/A (JSON data files) | mock-guard: N/A (Smart-Skip — no production TS source modified)

### Four-Count Evidence (QA-reproduced)

| Source | Count | Method |
|--------|-------|--------|
| gen-tool-registry.ts (static scan) | 157 | bun scripts/gen-tool-registry.ts — QA re-run |
| /health endpoint (runtime) | 157 | curl localhost:3000/health — QA re-run |
| parity test source extraction | 157 | bun test tool-registry-parity.test.ts 8/8 PASS — QA re-run |
| project-stats.json dry-run | 157 | bun scripts/gen-project-stats.ts --dry-run — QA re-run |

Delta across all four: 0

### Deregistered Tools Absent (QA-verified via registry.json scan)
read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day — all absent from all 12 groups in docs/data/tool-registry.json

### Bun Crash Provenance
Full mcp-server bun test suite triggers Bun v1.3.13 WriteFailed/OOM crash (RSS 1.09GB peak, pre-existing). Confirmed pre-sprint: first documented in docs/agent-memory/archive/qa-archive-2026-05-13.md and docs/agent-memory/archive/dev-mcp-server-archive-2026-05-13.md (multiple references, peak RSS 1.6–2.7GB depending on suite run). All sprint-specific suites (U1/U3/U5/U6/parity) run clean in isolation: 8+12+10+17+8=55 pass / 0 fail. Crash does NOT mask any task failure.

### Individual Suite Results (QA-reproduced)
- U1: 8/8 pass
- U3: 12/12 pass
- U5: 10/10 pass
- U6: 17/17 pass
- parity: 8/8 pass (24 expect() calls)

### AC Coverage
- AC-U2-P-1: gen-tool-registry.ts re-run → 157 tools PASS
- AC-U2-P-2: totalCount=157 PASS
- AC-U2-P-3: /health toolCount=157, delta=0 PASS
- AC-U2-P-4: parity test 8/8 PASS
- AC-U2-P-5: project-stats.json toolCount=157 PASS
- AC-U2-P-6: tool-registry.json 157 tools, _maintained_by header locked PASS

verdict: APPROVED
