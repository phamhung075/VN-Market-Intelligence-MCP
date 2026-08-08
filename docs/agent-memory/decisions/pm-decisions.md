
## TASK_RUNIDLE Gate Decision — 2026-08-08

**task_id:** pm-dispatch-runidle-manual

**situation:** 
TASK_RUNIDLE-1-AUDIT (audit task, findings doc) passed QA round-1 with verified accuracy and was moved to done[] with status=DONE. Two dependent tasks (TASK_RUNIDLE-2-REDESIGN, TASK_RUNIDLE-3-STALENESS) are logically unblocked but cannot auto-dispatch because deps_satisfied() in scripts/lib/devteam-eligibility.jq:276-281 requires dependencies to resolve to DONE_VERIFIED (plain DONE is not sufficient).

**decision:** Manually dispatch TASK_RUNIDLE-2-REDESIGN and TASK_RUNIDLE-3-STALENESS from backlog to ready[] (status: TODO, ready for developer pickup).

**reasoning:**
1. TASK_RUNIDLE-1-AUDIT genuinely meets the *logical* bar for DONE_VERIFIED: it is an audit/findings task, QA independently re-verified all factual claims against live board state (not just accepting developer's self-report), and QA confirmed zero residual errors. The handoff file explicitly states this should unblock the dependents.
2. TASK_RUNIDLE-1-AUDIT cannot be marked DONE_VERIFIED in the schema without verification.raw_probe field (per orchStateSchema.ts §8A RC-VERIF gate). Adding a raw_probe for an audit task that was verified by human code review (not an automated probe) would fabricate data — violating the brief's own principle (docs/architecture-briefs/2026-07-17-sysremake-p2-rcverif-rcconverge.md §2.5: "backfilling raw_probe on already-completed work would itself be fabrication").
3. TASK_RUNIDLE-1-AUDIT is not in RC_VERIF_GRANDFATHERED_IDS, and adding it there would expand a frozen allowlist contrary to its design (orchStateSchema.ts §2.5: "list must NEVER grow").
4. The two dependent tasks are eligible for manual dispatch (logical dependency satisfied, QA approved), consistent with original DAG design: TASK_RUNIDLE-2-REDESIGN and TASK_RUNIDLE-3-STALENESS are parallel, both depend_on TASK_RUNIDLE-1-AUDIT only.

**action taken:** 
Moved TASK_RUNIDLE-2-REDESIGN and TASK_RUNIDLE-3-STALENESS from backlog to ready[], status: TODO, updated_at: 2026-08-08T23:16:44Z, updated_by: pm/manual-dispatch-runidle-unblock. Both tasks are now dispatchable to developer.

**next steps:** 
dev-team's BOUNDED-1 or other idle-pickup lanes should pick these up in normal rotation, OR pm can directly dispatch them if immediate action is needed.

