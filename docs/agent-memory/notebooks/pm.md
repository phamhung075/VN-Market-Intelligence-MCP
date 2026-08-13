# PM — Notebook

## c340 UC-RDL-P7 STEP2 DECOMPOSITION · Branch Policy Reconciliation (22 files, 2-group split) · 2026-08-13T20:12Z

**MANDATE (from router, session 632721c2-41e4-4aff-8d06-a47cf80dc0d7, dev-team dispatcher, UC-RDL-P7 IN_PROGRESS):** Decompose architect design (branch policy reconciliation, 22 files) into atomic tasks per two-group zone split + dependency tier. Carry sibling-hook sequencing constraint (FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR coordination).

**DESIGN CONTEXT:**
- **Sprint:** UC-RDL-P7 (P1/SPRINT-M, zone multi, supervised:false, po-gated 2026-07-17)
- **Architect Brief:** docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md (complete, 2026-08-13)
- **BA Spec:** docs/handoffs/UC-RDL-P7-BA-spec.md (complete, 2026-08-12; 21-file inventory + §4 mandatory coordination)
- **Architect Brownfield Finding:** 22nd file (docs/agents/po/flow/main.md, FR-14) discovered by architect (BA's grep missed); hard sequencing partner of CLEAN retirement

**ZONE SPLIT (architect §1, PM decomposition guidance):**
Two real commit-zone owners (per CLAUDE.md dispatch + agent-father init.md):
1. **Group B (developer-generic, tier1):** FR-1, FR-12, FR-13 → 9 files (canonical SSOT creation)
2. **Group A (agent-father, tier2, depends_on B):** FR-2..FR-11 + FR-14 → 20 files (SSOT pointers + prose reconciliation)

**CRITICAL ATOMICITY REQUIREMENT (NFR-2):**
Group A MUST land as one atomic wave (creation-half FR-2/3/4/6/14 + merge-half FR-7/8/10 span Developer→QA handoff; partial land reproduces the exact "commit to main, QA tries checkout task/NNN" wedge the PO ruling warned against). Group B lands first (creates § Branch Policy section), then Group A lands (all 20 files point to it).

**DECOMPOSITION COMPLETED:**

### UC-RDL-P7-B (Tier1: Policy SSOT)
- **Zone:** developer/
- **Size:** M
- **Dependencies:** none
- **Blocks:** UC-RDL-P7-A
- **Files:** docs/policies/commit-convention.md (FR-1 new section), dev-standards.md (FR-12 rewrites), .claude/WORKFLOW.md (FR-13 collapse), bundle-developer.md (FR-13 collapse), bundle-qa.md (FR-13 collapse)
- **AC (10 bullets):** New § Branch Policy section (main-only, worktree carve-out, post-commit 4-step), all pointers consistent, decision journal, no intruders
- **Handoff:** docs/handoffs/UC-RDL-P7-B.md

### UC-RDL-P7-A (Tier2: Flow Doc Reconciliation)
- **Zone:** agent-father/
- **Size:** L
- **Dependencies:** UC-RDL-P7-B
- **Blocks:** none
- **Files:** 20 agent-father files: developer/microservice/dev-frontend/doc-review flow docs (4), 10× init.md catalogs, qa/fixer/pm/dev-team flow main.md (4), po/flow/main.md (1), dispatch/SKILL.md (1)
- **Scope:** Repoint all flows to § Branch Policy SSOT, strip branch checkout/merge/delete mechanics (creation-half: "verify on main, clean tree" no-op), retire CLEAN workflow (FR-7(c)/FR-10/FR-14), maintain distinct pipeline/verify-committed check depths (FR-7(b) architect ratified)
- **AC (38 bullets):** Line-by-line edits FR-2 through FR-14, all prose repointed or rewritten, CLEAN retirement (CLEAN row deleted from dev-team planning, CLEAN triage dropped from PO) zero stale task/NNN references, decision journal, no intruders
- **Handoff:** docs/handoffs/UC-RDL-P7-A.md

**SIBLING-HOOK SEQUENCING CONSTRAINT (architect brief §18, mandatory coordination):**
FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR hook (READY, next_agent:pm, brief docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md) defaults to MODE=enforce (hard revert to main on any non-main checkout). That brief explicitly asks PM to coordinate: land Group A's VERIFY-line edits (FR-2/3/4) before or in same wave as the hook, OR sequence hook to start MODE=warn until Group A lands. Once both land, hook + flow docs agree by construction (both expect main). Do NOT let both land uncoordinated.

**VERIFICATION STRATEGY (from architect brief §19):**
Pure documentation change (no runtime behavior, no bun test/tsc). Grep-based regression:
- `grep -rn "task/NNN" docs/agents/ .claude/skills/dispatch/SKILL.md docs/policies/commit-convention.md docs/policies/dev-standards.md .claude/WORKFLOW.md docs/references/bundles/` → zero hits post-landing (old SUPERSEDED marker cleaned by FR-2)
- `grep -n "CLEAN" docs/agents/qa/flow/main.md docs/agents/dev-team/flow/main.md docs/agents/po/flow/main.md` → zero hits post-FR-7(c)/FR-10/FR-14
- Spot-check full read of edited qa/flow/main.md pipeline/approved sections (FR-7(b) highest-complexity change)

**BOARD STATE POST-DECOMPOSITION:**
- in_progress[]: UC-RDL-P7 removed (decomposed into subtasks)
- ready[]+2: UC-RDL-P7-B (tier1, no deps, blocks A) + UC-RDL-P7-A (tier2, depends_on B, blocks none)
- WIP: 2→2 (FIX-COVERAGE-STAMP-TTL-30 + UC-RDL-P7 was at limit; now UC-RDL-P7-B in ready waiting developer pickup)
- Validator: PASS (Stage 1g reports 16 pre-existing MISSING deps in backlog/ready/closed_sprints, non-fatal; no new blockers introduced)
- Head: idle (mid-sprint decomposition, not sprint closeout; next dispatch picks next-lane work or spins on ready[] work)

**DECISION RATIONALE:**
- Both groups' atomicity preserved: Group B creates SSOT (must land first), Group A lands as one atomic wave (NFR-2 straddle risk confined internally)
- Handoff files complete with full AC + dependency notes + sibling-hook coordination warning (not PM's job to enforce sequencing, but routing note prevents surprises)
- Zone routing correct per CLAUDE.md dispatch table: developer/generic → developer agent, agent-father files → agent-father agent
- Sequencing clear: UC-RDL-P7-B ready (tier1) → UC-RDL-P7-A backlog (tier2, gated on B) or both in ready (developer picks B first, then A when B lands)
- WIP limit respected (decomposition did not increase in_progress, only swapped UC-RDL-P7 for UC-RDL-P7-B in ready)

**NEXT:**
Router to route UC-RDL-P7-B to developer agent (docpolicy, tier1), then UC-RDL-P7-A to agent-father agent (flow prose, tier2, depends B). Both handoffs include sibling-hook coordination note (brief §18) for PM awareness of sequencing risk with FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR.

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).

## Cycle 2026-08-12T14:11Z — Decompose + Dispatch TICK-WU-1/2 (Post-QA WU-0 Verified Gate)

**Sprint:** TICK-PREFLIGHT-USAGE-INSTRUMENTATION

**Input:** QA handoff: "WU-0 (TICK-WU-0-TELEMETRY-LIB) is DONE_VERIFIED; dependency gate satisfied for WU-1 and WU-2. Move from BACKLOG to TODO and dispatch."

**Work:**
1. Read prior PM decomposition (sprint-TICK-PREFLIGHT-USAGE-INSTRUMENTATION-pm.md) — specs already exist, no re-decomposition needed
2. Read existing handoff files (TASK_TICK-WU-1-COWORK-WIRING.md, TASK_TICK-WU-2-DEVTEAM-WIRING.md) — AC/AC-10/Risk notes confirmed
3. Verify WU-0 status = DONE_VERIFIED in orch-state.json — confirmed
4. Check WIP budget (in_progress count) — 1/2, room for 2 more S-sized tasks
5. Update task status: BACKLOG → TODO for both WU-1 and WU-2 via orch-apply.sh (atomic write)
6. Commit orch-state.json change (pathspec-scope, no peer dirt sweep) — ea982859c

**Status:** Both tasks flipped to TODO. Ready for developer pickup.

**Decision:** Dispatch both WU-1 and WU-2 to developer in parallel:
- Both S-sized, same pattern (mechanical 2-3 line trailer wiring)
- No file overlap (cowork-tick-preflight.sh vs dev-team-tick-preflight.sh)
- Same zone (cross-service/)
- No inter-task dependencies (both depend on WU-0, which is satisfied)
- Fits WIP budget (1 + 2 = 3 total ≤ safe capacity for S+S tasks)
- Per PM init.md parallel_dispatch: "all independent handoffs in one message"

**Risk Acknowledged:** WU-3 (TICK-WU-3-AUDITOR-WIRING) stays gated on WU-1+WU-2 landing green — do not unblock WU-3 until both complete QA verification.

**Next:** Router to spawn developer with TASK_TICK-WU-1-COWORK-WIRING.md and TASK_TICK-WU-2-DEVTEAM-WIRING.md (both ready, no blockers).
