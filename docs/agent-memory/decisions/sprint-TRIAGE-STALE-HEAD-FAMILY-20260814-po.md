# Decision Journal — Sprint TRIAGE-STALE-HEAD-FAMILY-20260814 · po

**Sprint goal:** no goal set — router-escalated triage of the stale-`.head` defect family (5 occurrences / 5 agent types on 2026-08-14)
**Agent:** po
**Started:** 2026-08-14T07:39:08Z

---

### STEP po-S1 · po · 2026-08-14T07:44:07Z
**task-id:** FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND
**what-done:** Split the reported single "structural defect" into TWO mechanically different sub-defects and minted this one for the lane-visibility half (review[]/qa[] absent from WF-1's task_status array, main.md:301-304).
**what-considered:**
- One consolidated row for all 5 occurrences — rejected: the fix shapes are not the same edit, and a single row would force the mechanical half to wait on the design half.
- Route to agents-architect for design — rejected: WF-1b and WF-1c already closed this identical shape for done/done_verified and ready; they are verbatim templates, so there is no design question left.
**why-decision:** review[]/qa[] residency carries the SAME inert-lane guarantee WF-1c already argues in-file for ready[] (no agent owns the row; the QA-Drain pickers do), so the idle-reset disposition is settled by existing precedent, not by new design. agent-father owns docs/agents/**.
**why-change:** no change from plan.

### STEP po-S2 · po · 2026-08-14T07:44:07Z
**task-id:** FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC
**what-done:** Minted a SOURCE-side row after finding that `developer/flow/microservice-main.md` — the shared base flow for all 9 dev-* specialists — has zero `.head` writes on its success path.
**what-considered:**
- Treat memory-candidate (a) (per-flow-doc sync) as structurally impossible for gateway-less dev-* under INV-GATEWAY-1 — REFUTED by reading the protocol.
- Rely on the WF-1d gate alone as the single fix.
**why-decision:** `fail-loud-protocol.md:170` states verbatim that the `.head` idle-reset "IS executable by all agents (jq + atomic rename, no MCP needed)". The reset is merely wired into the error/STOP path only, never the success path — so this is a cheap 1-file/9-consumer fix, and declining it would leave the gate permanently absorbing a defect that the source can simply stop emitting.
**why-change:** Plan implied one gate-side fix; evidence showed the dev-* class has a distinct and cheaper source-side cause.

### STEP po-S3 · po · 2026-08-14T07:44:07Z
**task-id:** FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN
**what-done:** Minted the in_progress-RESIDENT facet (router DRS / pm x2 / architect) to agents-architect as design-only, using the exact task id the 2026-08-07 architect blueprint had already recommended to PO.
**what-considered:**
- Send straight to agent-father as a mechanical gate addition, like S1.
- Fold into S1's WF-1d row.
**why-decision:** Lane-widening can never catch this facet — the row never leaves in_progress[], so the discriminator is field-vs-field coherence, not lane residency. And unlike the inert lanes, the work here is genuinely live, so WF-1b/1c/1d's idle-reset is NOT obviously the right disposition (resuming the row's own next_agent is a live alternative). That ambiguity, plus the same-day WF-3/WF-4 interaction, is real design work.
**why-change:** Confirmed this id was already recommended and never minted — that omission is why occurrences kept accruing; minting it is the correction.

### STEP po-S4 · po · 2026-08-14T07:44:07Z
**what-done:** Set all three rows P1/BACKLOG with `next_agent` on the DRS ratified allowlist, and deliberately left `plan_only` unset on the design row.
**what-considered:**
- Set `plan_only: true` on the agents-architect row to signal design-only intent.
**why-decision:** `scripts/lib/devteam-eligibility.jq` excludes plan_only rows from BOUNDED-1 promote; `agents-architect` IS on the DRS default allowlist (`["architect","ba","pm","po","agents-architect"]`), so leaving plan_only unset keeps the row genuinely dispatchable. Design-only intent is carried in AC-1 prose instead, where it cannot strand the row.
**why-change:** no change from plan.
