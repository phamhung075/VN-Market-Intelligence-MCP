# Decision Journal — MANUAL-DISPATCH-QUEUE 2026-08-23 · pm

Sprint-less `ready[]` rows carrying `next_agent=pm`. Each parent has no `sprint` field, so per
`docs/agents/pm/flow/main.md` Step 3c-journal the pm pass id is used as SPRINT_ID rather than
inventing a sprint on the rows themselves.

### STEP pm-S1 · pm · 2026-08-23T13:43:20Z
task_id: FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES
**what-considered:** (a) decompose — rejected, a peer pm already split it 2026-08-23T09:00Z; (b) closeout with the parenthood field written — chosen.
**why-change:** no change from plan, but the parent had `children: null` despite both children being live (TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY in review[], TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION in done[]). Parenthood-field drift: the umbrella stayed dispatchable and kept routing to pm. Wrote children[] and closed. This is the write-side half of FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND, third instance this pass.

### STEP pm-S2 · pm · 2026-08-23T13:43:20Z
task_id: FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT
**what-considered:** (a) single developer task — rejected, `scripts/` and `docs/agents/` are different commit zones and the row's own status_note says so; (b) two-owner split — chosen, matching the architect brief's Task-board disposition verbatim.
**why-change:** no change from plan. TASK-OFFHOURS-SELFCOMMIT-SCRIPT (developer) → TASK-OFFHOURS-SELFCOMMIT-FLOWDOC-REWIRE (agent-father, depends_on the script).
**AC3/AC4 deliberately NOT minted as work:** the stale notebook header and the uncommitted c273 section are auto-satisfied by the first post-cutover run's clean-diff guard; c273 is this row's own live evidence and hand-committing it would destroy it. Sequencing flagged on the child: land both before the next news-scout-offhours tick if schedulable.

### STEP pm-S3 · pm · 2026-08-23T13:43:20Z
task_id: FIX-USDVND-THRESHOLD-SSOT
**what-considered:** (a) one task — rejected, spans apps/mcp-server (TS) and apps/macro-indicators (Go), two dev specialists; (b) three tasks splitting Plane 4's agreement test out — rejected, the test is meaningless without both sides and would be a third row that can never run alone; (c) two tracks — chosen, per the brief's own NEXT block.
**why-change:** no change from plan. TASK-USDVND-TS-STATIC-RETIRE (dev-mcp-server, Planes 1+2, S) → TASK-USDVND-GO-SIGMA-PORT (dev-macro-indicators, Planes 3+4, M). The Go track depends_on the TS track ONLY because the cross-language agreement test needs both sides — otherwise independent, stated on the child so nobody reads it as a logical prerequisite.
**hazard handled:** FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE (review[]) depended on the now-closed parent; retargeted onto both children, legacy `.depends` deleted.
**scope held:** Finding B's general form (oil/gold static-vs-dynamic double-application) stays flagged-not-fixed per the brief — needs its own row, not folded in.

### STEP pm-S4 · pm · 2026-08-23T13:43:20Z
task_id: FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR
**what-considered:** the row was routed to pm specifically so pm would make the rollout-timing call architect declined to make unilaterally. (a) ship MODE=enforce immediately as designed — REJECTED; (b) ship MODE=warn only and stop — rejected, leaves the defect open; (c) warn → retire the branch prose → flip enforce — CHOSEN.
**why-change:** this is a genuine pm decision, not plan follow-through. Architect grep-confirmed 5 flow docs still author/verify/honor `git checkout task/NNN-*` TODAY, and developer/flow/main.md:51-54 + microservice-main.md:53-57 make `git branch --show-current == task/NNN-kebab` a HARD precondition. Enforce-first reverts HEAD before that line runs and wedges every M/L task — UC-RDL-P7's own "wedges QA merge if only one half edited" hazard via a different mechanism.
**children minted:** TASK-BRANCHGUARD-POSTCHECKOUT-HOOK (developer, warn default) → TASK-BRANCHGUARD-ENFORCE-FLIP (developer, depends_on the hook AND UC-RDL-P7-A).
**AC-3 honored:** UC-RDL-P7-A (ready[], agent-father) already owns rewriting those exact files — its `files[]` covers developer/main.md, microservice-main.md, qa/flow/main.md, fixer/flow/main.md and pm/flow/main.md. Added as a dependency EDGE, not duplicated as a third overlapping row, which AC-3 explicitly forbids.
