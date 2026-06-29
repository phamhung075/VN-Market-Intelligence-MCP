## PM Decomposition: FEAT-NEWS-DECISION-RESUME

**Date:** 2026-06-29  
**Task ID:** FEAT-NEWS-DECISION-RESUME  
**PM:** pm

### What Was Considered

Architect provided explicit two-hop split with clear FR grouping:
- Hop 1 (dev-mcp-server): FR-1 (builder) + FR-2 (DB) + FR-3 (DTO) — backend complete
- Hop 2 (dev-frontend): FR-4 (pill fix) + FR-5 (card layout) — frontend consume DTO

Why this split and not alternatives?
- Tight coupling: Hop 2 cannot start until Hop 1 deploys + container rebuild runs
- Zone isolation: mcp-server changes (domain/infrastructure/interface layers) vs frontend (presentation layer)
- Risk segmentation: backend logic (deterministic string builder) separate from frontend rendering
- Rebuilding: single-service rebuild (mcp-server only) fits between hops; dev-team Step 3 will orchestrate

### Why No Change From Plan

The architect's design is complete and unambiguous:
- Two tasks, one dependency (HOP2 blocks_on HOP1), two zones (disjoint)
- Runnable tier 1: HOP1 ready now (no blocking deps)
- Runnable tier 2: HOP2 after HOP1 DONE + rebuild
- No subfeatures to further split (each hop is ~1-2 hours per estimate)
- Handoffs created with full AC, file paths, knowledge pointers

### Task Assignments

| Task ID | Owner | Zone | Status | Dependency | Est |
|---------|-------|------|--------|------------|-----|
| TASK-FEAT-NEWS-DR-HOP1 | dev-mcp-server | apps/mcp-server/ | TODO | none | ~2h |
| TASK-FEAT-NEWS-DR-HOP2 | dev-frontend | apps/frontend/ | TODO | HOP1 + rebuild | ~1h |

### Handoff Files Created

- `docs/handoffs/TASK-FEAT-NEWS-DR-HOP1.md` — 7 AC, FR-1/2/3, builder logic + DB + DTO
- `docs/handoffs/TASK-FEAT-NEWS-DR-HOP2.md` — 5 AC, FR-4/5, pill fix + card résumé + collapsible

### Risk Flags Propagated

All Architect risk flags (RISK-1 to RISK-5) included in handoff AC:
- RISK-3 (MEDIUM): TASK-17 helper must extend with optional `decision_resume` param
- RISK-5 (LOW): Frontend guard on `item.decision_resume != null && length > 0`

### Decision Gate

✓ Atomic task split confirmed  
✓ No WIP constraint (currently 0 in progress, limit is 2)  
✓ Tier 1 runnable immediately  
✓ Tier 2 blocked as designed  
✓ Handoffs complete with AC + knowledge pointers  

**Approved for dispatch to tier 1.**
