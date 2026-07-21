# Decision Journal — FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD Decomposition

**Date:** 2026-07-21  
**Agent:** pm  
**Task:** FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD (P0, plan_only: true, supervised: true)  
**Session:** https://claude.ai/code/session_01XorNx4tAg59BMrY6U8iiaq

## Decomposition Rationale

The architect provided a layered design (§8 of the brief) spanning three zones:
1. **scripts/git-hooks/** (developer zone) — Layer 0 hook implementation
2. **.claude/skills/** (agent-father zone) — Layer 1 skills fixes
3. **docs/policies/** (housekeeping) — pointer to dev-standards

No single specialist owns all three zones (dev-standards.md constraint per architecture brief §7). Routing to PM for explicit decomposition was the right call; the alternative (zone-detect auto-pickup + developer unattended reach into agent-father zone) would have violated the architecture rule against single-zone specialists crossing into multi-zone work without explicit dispatch.

## Decomposition Decisions

### Decision 1: Two tier-1 parallel subtasks (no inter-dependency)

**Considered:** Merging the hook and skills work into one mega-task  
**Decided:** Split into separate tasks (HOOK and SKILLS)  
**Why:** Each is single-zone, single-specialist, ~2h work (M and S sizes). Parallel dispatch to developer and agent-father maximizes throughput and respects zone ownership boundaries. The brief's empirical verification (scripts/audits/verify-commit-sweep-discriminator.sh) proves the hook logic and pathspec immunity are orthogonal; neither depends on the other landing first.

### Decision 2: Supervised dispatch, not zone-detect auto-pickup

**Considered:** Adding tasks to backlog and letting zone-detect auto-routers pick them up  
**Decided:** Mark all subtasks supervised:true and include explicit owner/next_agent bindings  
**Why:** The architect brief §7.2 explicitly warns against re-delegating the scripts/git-hooks/ subtask via unattended zone-detect. The hook carries a detailed pseudocode spec (§4.1) that must flow to the implementer unambiguously. Supervised:true + explicit next_agent prevents the previous decomposition pattern that let this defect's predecessor (FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC) idle 6 weeks unstarted.

### Decision 3: AC-6 scope boundary (swept-victim self-detection is NOT in scope)

**Considered:** Including victim-side detection in this row  
**Decided:** Out of scope; minted as FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT (backlog, P2, depends on this row)  
**Why:** The brief §6 explains: git has no per-file staging attribution; detecting that a victim's content was swept requires out-of-band intent declaration or post-hoc reconciliation. This hook closes the **sweeper-side** half (sweep is now observable). The **victim-side** half needs a separate mechanism and is explicitly orthogonal. Minting it separately prevents scope creep and keeps this row's AC list bounded.

### Decision 4: Dev-standards pointer deferred (housekeeping, not gating)

**Considered:** Creating a third subtask for the pointer in docs/policies/dev-standards.md  
**Decided:** Deferred; whichever of HOOK or SKILLS lands last adds the pointer as part of post-implementation cleanup  
**Why:** The pointer is documentation-only housekeeping (§8 note: "agent-father or developer, whichever lands last"). Not a blocking AC. The two core subtasks (HOOK + SKILLS) carry all the substance; the pointer is a follow-up. No need to create a third lane-move overhead for documentation.

### Decision 5: Caveat 1 callout (pathspec commits cannot introduce untracked files)

**Considered:** Silently documenting it in handoff only  
**Decided:** Explicit callout in handoff + reminder in AC trailer for each of the 3 skills commits  
**Why:** The verification harness revealed this as a real footgun during the brief's empirical work (§2.6 caveat 1). Callers of the fixed skills must pair `git add <new>` with the scoped commit. Silencing this risks a developer hitting the error and thinking the fix is broken; calling it out explicitly in the handoff prevents that false alarm.

### Decision 6: Caveat 2 callout ($GIT_DIR unreliability)

**Considered:** Not mentioning it in handoff (just in the brief)  
**Decided:** Included as a note in HOOK handoff, pointing implementer to rely on CWD (worktree top) not $GIT_DIR  
**Why:** The hook's §4.1 pseudocode depends on reliably detecting the worktree. macOS git 2.49.0 does NOT export $GIT_DIR; the hook must use relative paths only (`.git/sweep-guard.log`, `.git/next-index-*.lock`). This is a platform-observed caveat, not just a theoretical risk; it belongs in the handoff.

## ACs per Subtask

### FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK
Closes: AC-1, AC-2, AC-3, AC-4, AC-5 (from parent row's 6 ACs)  
Leaves open: AC-6 (victim-side, separate row)

### FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS
Closes: AC-1 (structural fix via existing control), AC-2 (WARN-volume reduction), AC-3 (loud failure)  
Leaves open: AC-4 (pathspec immunity), AC-5 (install wiring), AC-6 (victim-side)

Note: AC-4 and AC-5 are naturally closed by the HOOK subtask; the SKILLS subtask closes AC-1 from a different angle (the control already exists, the fix is to close its bypass). No double-counting.

## Risk Flags Carried Forward

Per architect brief §Risk flags:
1. Detection depends on git-internal `next-index-*.lock` naming (not a documented API) — mitigated by permanent test script + UNKNOWN-shape fail-open
2. WARN-fire volume on day 1 could be high (60+ flow docs still bare-commit) — mitigated by Layer 1 (this row's SKILLS subtask) landing in same effort
3. `ps`-based argv enrichment is platform-fragile — best-effort only, not gating
4. Directory/dot-pathspec loophole is policy-enforced, not mechanically closed — acceptable, not observed in real occurrences

All four are acknowledged in the handoff, not re-resolved by decomposition.

## Verification Gate Responsibility

The parent row's `verification_gate` field requires:
> Reproduce the race in a scratch clone, not in the live repo: actor A stages file X; actor B runs a pathspec-less commit while A's content sits in the shared index. With the guard installed, B's commit is rejected or loudly flagged, and A's content does NOT land inside B's commit under B's message. Demonstrated live in the scratch repo with real command output — NOT asserted from hook source prose or from a flow-doc claim.

**Assigned to:** FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK (the implementer must re-run scripts/audits/verify-commit-sweep-discriminator.sh against the final implementation in a scratch clone before marking AC as satisfied).

**Starting point:** The verification harness `scripts/audits/verify-commit-sweep-discriminator.sh` is already committed and verified 2026-07-21 on git 2.49.0/macOS (brief §8: "This is the row's verification_gate made permanent"). Implementer should re-run it before accepting.

## No Competing Decompositions Found

Router verified (per dispatch note) that there is currently no active_sprints container for this row and no competing decomposition. The two new subtasks are the ONLY decomposition present on the board.

## Timestamp & Coordination

- Session ID: 4ae45b71-6dbf-4623-ab62-f388d14d2c85
- Subtask IDs minted: FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK, FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS
- Handoff files created: docs/handoffs/FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK.md, docs/handoffs/FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS.md
- Board update: 2 tasks added to task_board.backlog (BACKLOG status, supervised:true, explicit owner/next_agent)
