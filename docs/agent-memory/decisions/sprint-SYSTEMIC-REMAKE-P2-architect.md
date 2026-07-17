# Decision Journal — Sprint SYSTEMIC-REMAKE-P2 · architect

**Sprint goal:** SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE (Phase-2 structural remake, design-first architect-led cascade: RC-VERIF+RC-CONVERGE -> RC-ORCHMONO -> RC-GITSTATE -> RC-CEREMONY)
**Agent:** architect
**Started:** 2026-07-17T04:58:43Z

---

### STEP architect-S1 · architect · 2026-07-17T04:58:43Z
**task-id:** SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE (leg: RC-VERIF+RC-CONVERGE)
**what-done:** Authored TECH brief `docs/architecture-briefs/2026-07-17-sysremake-p2-rcverif-rcconverge.md` for the first leg only (RC-VERIF completion gate + DEGRADED enum + RC-CONVERGE bug_class ledger). Verified all 4 live orch-state write paths (orch-apply.sh->orch-validate.mjs, orchStateStore.ts writeOrchStateAtomic, PreToolUse hook, bash shim) import the SAME `orchStateSchema.ts` object — zero duplication risk if the gate lives in the schema's existing root `.superRefine()`.
**what-considered:**
- Gate placement: new standalone `checkVerificationGate()` (mirrors checkLaneCoherence/checkRefIntegrity, called only by orch-validate.mjs) vs extending the existing root `.superRefine()`.
- Migration: backfill 33 live raw_probe-less DONE_VERIFIED rows then hard-fail, vs frozen closed grandfather-ID allowlist.
- Convergence ledger: new `.convergence_ledger` section inside orch-state.json vs sidecar JSON mirroring auditor-dedup-ledger.json.
- DEGRADED lane coherence: mirror BLOCKED's 3-lane spread (backlog/review/in_progress) vs narrower review/qa only.
**why-decision:** Standalone-function placement would repeat the EXACT drift class found live (checkLaneCoherence/checkRefIntegrity are NOT called by orchStateStore.ts's writeOrchStateAtomic today — confirmed by reading its source, comment admits checkRefIntegrity "deliberately excluded") — extending the shared superRefine is the only placement that is structurally un-droppable. Backfill-then-hard-fail was rejected because backfilling raw_probe on historically-completed rows IS the fabrication RC-VERIF exists to stop (self-defeating); live jq evidence showed 0/33 current DONE_VERIFIED rows carry raw_probe, proving a naive gate would brick the hot file on the very next write. Sidecar ledger chosen over in-file section because orch-state.json is 844KB live and RC-ORCHMONO/RC-GITSTATE (later legs of this SAME route) exist specifically to shrink/de-churn it — adding a new frequently-mutated section would work against the route's own stated goals; the auditor-dedup-ledger.json pattern shipped literally 1 day earlier (UC-ASL-P2) as a proven precedent for exactly this problem shape. DEGRADED narrowed to review/qa because it represents a post-work "could not independently verify" state, not a pre-work blocker — backlog/in_progress inclusion would let agents declare it before attempting the fix, defeating RC-VERIF's intent.
**why-change:** No change from plan (router dispatch scope matched board row's authorized leg exactly); one deliberate widening flagged explicitly in the brief: the gate covers all 9 task-bearing lanes, not just task_board.backlog as the parent brief's prose loosely said, since DONE_VERIFIED is lane-coherent in done[]/done_verified[]/active_sprints/closed_sprints too.
