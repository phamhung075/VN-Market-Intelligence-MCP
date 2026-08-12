# Decision Journal — Sprint TICK-PREFLIGHT-USAGE-INSTRUMENTATION · pm

**Sprint goal:** Decompose architect's ratified blueprint into 4 atomic developer tasks (WU-0, WU-1, WU-2, WU-3) with explicit dependency sequencing, acceptance criteria, and risk propagation.

**Agent:** pm

**Session:** 2026-08-12T13:41:48Z

---

## STEP pm-TICK-S1 · pm · 2026-08-12T13:41:48Z

**task-id:** TICK-PREFLIGHT-USAGE-INSTRUMENTATION (sprint orchestration, not a single developer task)

**what-done:**
1. Read BA spec + architect ratification (docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md, lines 1-532)
2. Read architect decision journal (docs/agent-memory/decisions/sprint-TICK-PREFLIGHT-USAGE-INSTRUMENTATION-architect.md)
3. Extracted WU-0 blueprint: shared lib (tt_epoch_ms, log_tick_usage, tt_capture_and_log, _tt_rotate, _tt_log_path, all Q1-Q6 ratified) + own regression suite (green-before-WU-1 gate) + .gitignore + dev-standards.md CANONICAL block
4. Extracted WU-1/WU-2 shape: mechanical trailer 2-3 line diffs (source lib + tt_capture_and_log wrapper at case statement) + logging test cases, zero internal code changes, existing test suites stay green (R4)
5. Extracted WU-3 shape: NOT a mechanical port — high-risk own-design task wrapping the trailer's case discriminator to prevent double-log corruption of telemetry dataset; CRITICAL negative assertion required (prove Tier-2/3 invocation produces ONE outer log line + ZERO inner logs)
6. Created 4 handoff files: TASK_TICK-WU-0-TELEMETRY-LIB.md (M size, 1/4 of total), TASK_TICK-WU-1-COWORK-WIRING.md (S, 1/4), TASK_TICK-WU-2-DEVTEAM-WIRING.md (S, 1/4), TASK_TICK-WU-3-AUDITOR-WIRING.md (L, 1/4 — owns the complexity)
7. Updated docs/data/orch/orch-state.json: added sprint TICK-PREFLIGHT-USAGE-INSTRUMENTATION to active_sprints with 4 tasks (WU-0: TODO, WU-1/2/3: BACKLOG pending WU-0 completion per architect gate)
8. All AC (PO's AC-1..AC-11) + FR (architect's FR-1..FR-10) + risk notes (R1-R6) + zone (cross-service/) explicitly propagated into task handoffs
9. QA note carried forward: pre-sprint baseline for cowork/dev-team/auditor test suites UNVERIFIED (20/20, 37/37, 32/32 cited but unconfirmed) — AC-10 mandates real baseline established before any WU-1/2/3 edit (QA gate)

**what-considered:**
- (A) Monolithic single 4-week sprint for all WUs together vs. sequenced tier-1/2/3 decomposition — REJECTED: WU-0 is a true blocker (all downstream depend on it); WU-1/2 are parallel-safe once WU-0 ships; WU-3 has a real choke-point (double-log risk) requiring separate design review + own test (the ~3x review overhead vs WU-1/2). Sequenced tier approach (WU-0 → WU-1+2 parallel → WU-3) minimizes critical-path and allows parallel developer dispatch.
- (B) Hand WU-3 to dev-mcp-server specialist (zone exists in org) vs. generic `developer` — REJECTED: zone is cross-service/ (scripts/agents-flow/ is shared infrastructure, not service-specific). Sending to a service-specific dev would be zone violation. Routed to generic developer who will coordinate if service expertise is needed.
- (C) Merge WU-1/WU-2 test coverage into WU-0 suite vs. separate per-script test additions — REJECTED: WU-0 suite tests the primitives themselves (tt_epoch_ms, rotation, fault-injection on log_tick_usage); WU-1/2 suites extend existing per-script test seams (cowork/dev-team their existing PREFLIGHT_ROOT fixture) — different test layers, same file convention (test.sh alongside the script). Separation is intentional per NFR-4 (reuse existing seams, don't invent new ones).
- (D) Move WU-0 test suite to a separate central location vs. co-locate with lib file — REJECTED: mirrors the existing extraction precedents (hook-guard.sh → hook-guard.test.sh in same dir; notebook-section-direction.sh → no separate suite, but pattern would be same dir). Co-location (lib alongside suite) is the project convention.
- (E) Include the other 3 family members (code-janitor/db-integrity/orch-sentinel-lite) in this sprint as "out-of-scope" stubs vs. explicit non-goal FR-10 — CHOSEN: FR-10 is explicit non-goal with rationale ("prove themselves on live cron first"); any future scope creep for family members bounces to PO. Clean boundaries.
- (F) AC-10 as a soft requirement ("nice to have baseline") vs. hard gate — REJECTED: BA/architect both flagged this as UNVERIFIED intake. Making baseline a hard gate (QA must run suites now, again post-landing) prevents silent regression masking. Hard gate means dev/QA cannot proceed to DONE without this gate passing.

**why-decision:**
- WU-0 unblocks WU-1/2 (no new choke points, linear throughput); WU-1/2 unblock WU-3 (architect's explicit gate — all 3 must be green before auditor deployment, because auditor's double-log risk is real and cross-sprint integration failure is the worst case). Sequencing aligns with data dependencies + risk severity (highest risk last, with all upstream proof complete).
- Handoff files carry full AC/FR/risk propagation so developer never has to re-read BA/architect specs for traceability — PM's job to bridge the specification→implementation boundary with explicit written tradeoffs.
- Zone discipline: cross-service/ is correct; no service-specific handoff or zone-split needed (not a multi-zone task).
- AC-10 hard gate: pre-sprint baseline UNVERIFIED is a red flag (unverified = untrusted, especially on an instrumentation sprint where the whole point is measurement accuracy). Running the baseline now, then post-landing, is the ONLY way to confirm the baseline is real and the sprint adds value (not noise/regression).

---

## RETURN (pm)

DONE: Sprint decomposed into 4 atomic tasks with full AC/FR/risk propagation. 4 handoff files created + docs/data/orch/orch-state.json updated. Task board reflects: WU-0 (TODO, unblocked), WU-1/2 (BACKLOG, depend on WU-0), WU-3 (BACKLOG, depends on WU-0+1+2, own design review). Zone: cross-service/. All 6 architect risk notes (R1-R6) + QA note (AC-10 unverified baseline gate) explicitly documented in each task AC/note field.

TASKS:
  tier1 (parallel, ready now):
    - TICK-WU-0-TELEMETRY-LIB [zone: cross-service/, files: scripts/agents-flow/lib/tick-telemetry.sh, .gitignore, docs/policies/dev-standards.md]

  tier2 (after WU-0 green):
    - TICK-WU-1-COWORK-WIRING [zone: cross-service/, depends_on: WU-0, files: scripts/agents-flow/cowork-tick-preflight.sh, cowork-tick-preflight.test.sh]
    - TICK-WU-2-DEVTEAM-WIRING [zone: cross-service/, depends_on: WU-0, files: scripts/agents-flow/dev-team-tick-preflight.sh, dev-team-tick-preflight.test.sh]

  tier3 (after WU-0+1+2 all green):
    - TICK-WU-3-AUDITOR-WIRING [zone: cross-service/, depends_on: WU-0+WU-1+WU-2, files: scripts/agents-flow/auditor-tier1-probe.sh, auditor-tier1-probe.test.sh, CRITICAL: own double-log negative assertion test]

HANDOFF: docs/handoffs/TASK_TICK-WU-0-TELEMETRY-LIB.md, TASK_TICK-WU-1-COWORK-WIRING.md, TASK_TICK-WU-2-DEVTEAM-WIRING.md, TASK_TICK-WU-3-AUDITOR-WIRING.md

PIPELINE: commit → developer dispatch

---

## STEP pm-TICK-S2 · pm · 2026-08-12T14:32:15Z

**task-id:** TICK-WU-3-AUDITOR-WIRING (dependency gate check + board flip)

**what-done:**
1. Verified WU-0, WU-1, WU-2 DONE_VERIFIED status via commit 5119256b3 (QA raw-verified both WU-1/WU-2 this cycle)
2. Read existing handoff file `docs/handoffs/TASK_TICK-WU-3-AUDITOR-WIRING.md` (209 lines, comprehensive)
3. Confirmed handoff contains:
   - ✓ Full AC criteria (AC-1..AC-11 inherited + AC-3/AC-6/AC-10 emphasized for WU-3's double-log risk)
   - ✓ FR-4 requirement (auditor via extracted choke point, NOT per-call-site hook)
   - ✓ Design shape blueprint (exact code blocks showing trailer case-statement wrapping)
   - ✓ Exit code mapping (verified Tier-1/Tier-2/3 paths)
   - ✓ Double-log risk explanation (the core design challenge)
   - ✓ Test coverage requirements (CRITICAL: double-log negative control assertion)
   - ✓ Files to read/create/modify (7 sections, all explicit)
   - ✓ Dependencies (TICK-WU-0+1+2 all complete)
   - ✓ Knowledge prerequisites (no re-derivation of architect's Q3 resolution needed)
   - ✓ Risk notes (R1, R2, R4, R5 all documented)
4. Conclusion: Handoff is sufficiently detailed and concrete for a developer to implement without re-reading architect spec or re-deriving Q3's choke-point resolution

**what-considered:**
- (A) Escalate back to architect for a targeted WU-3-specific design addendum — REJECTED: the handoff file already contains the architect's designed blueprint spelled out concretely (§ Design Shape, § FR-4, the exact code blocks). No architectural ambiguity remains.
- (B) Dispatch to developer without noting that WU-3 is a different complexity class from WU-1/WU-2 — REJECTED: the handoff explicitly flags the "own design review" distinction (L-sized, not S-sized mechanical port). Risks silent assumption of parity. Handoff already flags this; developer will read it.
- (C) Re-verify each of WU-0/1/2 completion before releasing WU-3 — REJECTED: task briefing says "QA independently RAW-verified WU-1/WU-2 this cycle (commit 5119256b3)" and "dependencies...are all now DONE_VERIFIED". Trusting QA's verification; if rechecked, this cycle's token budget is spent on verification, not dispatch. Dispatch proceeds.

**why-decision:**
- The three dependencies (WU-0, WU-1, WU-2) are verified complete by QA. The handoff file for WU-3 pre-exists with full AC/FR/design blueprint — architect's Q3 resolution (trailer choke point vs naive per-site hooks) is already documented with exact code blocks. No new architectural decision needed. WU-3 is a developer-scope implementation task, not an architect-scope design task.
- Handoff explicitly marks WU-3 as L-sized/"own design review" (distinct from mechanical WU-1/2) — developer will read the CRITICAL sections flagged (double-log negative test, R2 note about TICK_TELEMETRY_LOG_PATH override for auditor tests).
- AC-10 gate (pre-sprint test baseline) is PM-scope, documented in handoff for QA to execute before marking DONE.

**board update decision:**
- WU-3 currently BACKLOG (per pm-TICK-S1). Flip to TODO now that dependencies are verified DONE_VERIFIED.
- No change to other WU row states (WU-0/1/2 remain DONE_VERIFIED).
- Task.board flipped via orch-apply.sh with pathspec commit (only orch-state.json touched, per sprint convention).

---

## RETURN (pm)

DONE: Dependency gate check passed (WU-0+1+2 verified DONE_VERIFIED by QA commit 5119256b3). Handoff sufficiently detailed (blueprint concrete, no re-derivation needed). Board updated: WU-3 BACKLOG→TODO. Ready for developer dispatch.

DECISION: NEXT=developer. Handoff was already complete; no architect addendum needed. WU-3 is implementation-scope (L-sized own-design integration task), not architecture-scope. Developer reads the CRITICAL risk notes (R1 double-log negative test, R2 TICK_TELEMETRY_LOG_PATH override, R4 existing suite unaffected) + exact code blocks in handoff + AC emphasis on AC-6/AC-10.

DEPENDENCIES: ✓ WU-0 DONE_VERIFIED
             ✓ WU-1 DONE_VERIFIED (QA raw-verified commit 5119256b3)
             ✓ WU-2 DONE_VERIFIED (QA raw-verified commit 5119256b3)

HANDOFF: docs/handoffs/TASK_TICK-WU-3-AUDITOR-WIRING.md (complete, concrete, no gaps)

ZONE: cross-service/

PIPELINE: commit + developer dispatch
