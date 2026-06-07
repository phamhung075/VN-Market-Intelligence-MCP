# TOOL-SURFACE-UPGRADE Sprint — PM Decomposition Decision Journal

**Sprint ID:** TOOL-SURFACE-UPGRADE  
**Task ID (PM planning task):** PM-TSU  
**Date:** 2026-06-07T08:15:00Z  
**Author:** pm  
**Status:** PLANNING COMPLETE — HANDOFFS CREATED, TASK BOARD UPDATED, READY FOR DISPATCH

---

## Decision: Sprint Decomposition into 7 Atomic Subtasks

### Context

Architect design (docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md, sections "Architect Brownfield Findings" + "PM Task Split Recommendation") calls for 6-unit sprint (U1+U2+U3+U4+U5+U6) plus one secondary generator subtask.

**Sprint Goal:** Make the 162-tool vn-market surface auditable and honest. Six sub-units ordered by priority: U1+U2 (P1, both dev-mcp-server) → U3 (P2) → U4/U5 (P2) → U6 (P3).

**Key Constraint:** Hard sequencing — U2 parity-test commit MUST be ABSOLUTE LAST task, after all U3 deregistrations committed and their count settles. This prevents false-green on parity test with stale deregister list.

### Decomposition Strategy

Architect's PM task split recommendation (lines 469–481 of spec) proposes 8 rows. PM refines into 7 atomic subtasks:

1. **TSU-DEV-U1** — Per-call telemetry counter (P1, dev-mcp-server, parallel with U2-GEN)
2. **TSU-DEV-U2-GEN** — Registry generator + initial generator run (P1, dev-mcp-server, parallel with U1)
3. **TSU-DEV-U3** — 12 weak-claim tool verdicts → deregister 5 + integrate 7 (P2, dev-mcp-server, after U1+U2-GEN settle)
4. **TSU-DEV-U4** — Direction+delta sweep (P2, dev-macro-indicators, independent from mcp-server)
5. **TSU-DEV-U5** — Foreign flow null holding ratio (P2, dev-mcp-server, independent)
6. **TSU-DEV-U6** — TSH leftover merges (description updates only, P3, dev-mcp-server, after U3 count settles)
7. **TSU-DEV-U2-PARITY** — U2 parity-test assertion + final count sync (P1, dev-mcp-server, LAST after all U3 committed)

### Rationale Per Unit

**U1 + U2-GEN parallel (P1):** Both are foundational. U1 fixes telemetry; U2-GEN generates the registry and settles tool count. They do not depend on each other — can land simultaneously. Both in dev-mcp-server zone (independent file creation).

**U3 (P2, after U1+U2-GEN):** Deregisters 5 tools (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day) + integrates 7 tools (mark_alert_outcome, get_market_foreign_flow, diagnose/reset_foreign_flow_circuit_breaker, get_label_accuracy_report, get_public_contracts, list_flagged_bctc_cells, submit_bctc_correction). Tool count changes after U3 commits. U2 parity test must run AFTER count settles.

**U4 (P2, independent):** Separate zone (apps/macro-indicators/). Can proceed in parallel with U3 (no contention). Only `get_macro_snapshot` needs changes in this sprint (VnIndex prev-session only; oil/gold/usd dv are null/unknown, deferred).

**U5 (P2, independent):** Foreign flow holding-ratio null-out. Independent from U3 (different tools, same zone). Can proceed parallel with U3.

**U6 (P3, after U3):** TSH leftover merges reduced to description updates only (no consolidations per architect verdict). Depends on U3 count settling so the final parity test (U2-PARITY) is not invalidated by stale merge assumptions.

**U2-PARITY (P1 in priority, LAST in sequence):** Generator run + parity test + final count sync to project-stats.json. Must run AFTER all U3 deregistrations committed. This is the hard gate before spiral closes.

### Dependency Order

```
Tier 1 (parallel):
  - TSU-DEV-U1
  - TSU-DEV-U2-GEN

Tier 2 (after Tier 1 lands):
  - TSU-DEV-U3
  - TSU-DEV-U4 (independent zone)
  - TSU-DEV-U5

Tier 3 (after Tier 2):
  - TSU-DEV-U6

Tier 4 (LAST, after Tier 3):
  - TSU-DEV-U2-PARITY
```

### WIP Enforcement

- At dispatch: WIP=0 before spawn. After Tier 1 both claim, WIP=2 (max reached).
- Tier 2: After Tier 1 one completes, one new task starts; WIP stays ≤2.
- Tier 3/4: Serial (one task active).

### Risk Flags Addressed

**R-1 (U2 count race):** MITIGATED by hard sequencing — U2-PARITY is the final task, after all U3 deregistrations committed. Parity test runs on stable count.

**R-2 (U1 handler wrapping):** Safe (pattern already used in production for buildToolNameMap). Shim applied AFTER registerAllTools().

**R-3 (U4 Go service change):** Separate zone. PM splits into own dev-macro-indicators task.

**R-4 (U5 test breakage):** dev-mcp-server must update test assertions post-fix. Noted in handoff.

**R-5 (U3 cowork-refactory-expert signal):** PM sends signal to cowork-refactory-expert lane after U3 commit. Their lane owns docs/agents/tools/{list,package}/ updates.

### Handoff Files Created

1. `docs/handoffs/TASK_TSU-DEV-U1.md` — Per-call counter (120L)
2. `docs/handoffs/TASK_TSU-DEV-U2-GEN.md` — Registry generator (130L)
3. `docs/handoffs/TASK_TSU-DEV-U3.md` — 12 weak-claim tools (150L)
4. `docs/handoffs/TASK_TSU-DEV-U4.md` — Direction+delta sweep (100L)
5. `docs/handoffs/TASK_TSU-DEV-U5.md` — Foreign flow null ratio (110L)
6. `docs/handoffs/TASK_TSU-DEV-U6.md` — TSH leftover merges (90L)
7. `docs/handoffs/TASK_TSU-DEV-U2-PARITY.md` — Parity test + final count (100L)

### Orch-State Updates

- Active sprint created: TOOL-SURFACE-UPGRADE (status: active, priority: high)
- 7 tasks added to task_board with status TODO, explicit zone assignments
- Dependencies recorded per tier structure above
- head.status → planning, head.next_agent → dev-mcp-server (U1+U2-GEN owners)
- WIP enforced at dispatch (max 2)

### Commit Strategy

All 7 handoff files staged explicitly (RULE 1), verified RULE 2 zone (all in docs/handoffs/), self-verified RULE 3 post-commit. Single commit covers all 7 handoffs + orch-state.json update + this decision journal entry. Commit message: `chore(pm/TOOL-SURFACE-UPGRADE): task decomposition — 7 subtasks, hard sequencing (U2-PARITY last)`

### What-Considered: Single Path

**Only viable path:** Sequential tier structure with U1+U2-GEN parallel (independent, no await). Any attempt to run U2-PARITY before U3 commits will produce false-green parity test (will miss the 5-tool deregistration). No alternative sequence respects hard constraint.

---

## PM Signature

- Decomposition reflects architect blueprint faithfully (6 units → 7 subtasks, all ACs preserved)
- Constraint honored: U2-PARITY LAST (hard gate before sprint closure)
- WIP discipline applied: max 2 concurrent, tier-locked sequencing
- Handoff files comprehensive (scope, ACs, files, dependencies, knowledge, risk)
- Decision journal written (this entry, task_id=PM-TSU)
- Orch-state SSOT updated atomically (task_board + narrative)
- Ready for dispatch to main terminal

---

**Timestamp:** 2026-06-07T08:15:00Z  
**Author:** pm (report-analyzer)
