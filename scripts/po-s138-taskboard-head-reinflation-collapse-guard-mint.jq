# po-s138-taskboard-head-reinflation-collapse-guard-mint.jq
#
# Single-pass DUAL-mutation board-hygiene reconcile (idempotent). Top-level .head
# is DELIBERATELY UNTOUCHED (it is the canonical SSOT and is correctly idle).
#
# ORIGIN 2026-07-02 (po-s138), dev-team tick T09:37Z: the router found DUPLICATE head
#   keys. Top-level `.head` = idle (qa, 09:38Z, correct). `.task_board.head` had been
#   RE-INFLATED with routing fields (status=in_progress, active_task_id=
#   BA-PREDICTION-EVIDENCE-REVIVAL, next_agent=architect) by updated_by=dev-team on
#   2026-07-01T06:26:45Z, frozen >27h. This is a RECURRENCE: po-s66 (2026-06-15)
#   already collapsed `.task_board.head` to a non-routing stub, but a NEW writer
#   (dev-team flow) re-inflated it — the durable guard was doc-only (schema G-7 comment)
#   because DeprecatedHeadStubSchema uses `.passthrough()`, which lets routing keys pass
#   Zod silently, so orch-apply.sh never blocked the write.
#
# BA-PREDICTION-EVIDENCE-REVIVAL is ABANDONED/SUPERSEDED: no real board row ever existed
#   for the umbrella; its concrete work was spun out to FIX-EVIDENCE-PIPELINE-STARVED
#   (real root: evidence_fragments=0, accumulator falsely reports success) +
#   FIX-VPS-SSC-INSIDER-502 (decoupled VPS dep, created 2026-07-01T06:49Z). Do NOT
#   resurrect the umbrella.
#
# WHAT THIS PASS DOES (idempotent):
#   1. COLLAPSE `.task_board.head` -> non-routing deprecated stub (redirect to .head),
#      recording the recurrence + the BA-PREDICTION disposition. Kept as a stub (not
#      deleted) so a legacy reader sees the redirect, not a phantom active_task_id.
#   2. id-guarded MINT of FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD -> backlog[]
#      (PLAN-ONLY) to enforce G-7 at the WRITE GATE (make the schema/orch-apply reject
#      routing fields on .task_board.head) so re-inflation is blocked at write time.
#   3. Stamp last_triaged_at/by.
#
# Idempotent: the stub is a SET (re-run = same bytes modulo $now); the mint is id-guarded
#   across all lanes. Top-level .head is never referenced.
#
# Reusable pattern for "the deprecated .task_board.head drifted/re-inflated with routing
#   fields again — collapse it back to the redirect stub WITHOUT touching the canonical
#   top-level .head, and mint the durable write-gate guard if not already tracked".
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s138-taskboard-head-reinflation-collapse-guard-mint.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#   (orch-apply.sh does Zod + dup-key + CAS + atomic rename; commit by EXPLICIT PATH.)

def GUARD_ID: "FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD";
def guard_exists:
  ([ .task_board
     | (.backlog//[]),(.ready//[]),(.in_progress//[]),(.review//[]),
       (.done//[]),(.done_verified//[]),(.qa//[]) ]
   | flatten
   | map(select(type=="object") | .id)
   | index(GUARD_ID)) != null;

# --- 1. collapse .task_board.head -> non-routing deprecated stub (top-level .head UNTOUCHED) ---
.task_board.head = {
    status:             "deprecated",
    canonical_moved_to: ".head",
    deprecated_at:      $now,
    deprecated_by:      "po-s138",
    active_task_id:     null,
    next_agent:         null,
    note: ("DEPRECATED — do NOT read or write this field. Canonical head SSOT is TOP-LEVEL .head "
        + "(dev-team flow Step 0b, orch-state-access.md §2/§4, router-d1-claim). RE-INFLATION RECURRENCE: "
        + "collapsed to a stub by po-s66 (2026-06-15) but updated_by=dev-team RE-INFLATED routing fields on "
        + "2026-07-01T06:26:45Z (status=in_progress, active_task_id=BA-PREDICTION-EVIDENCE-REVIVAL, "
        + "next_agent=architect), frozen >27h. BA-PREDICTION-EVIDENCE-REVIVAL is ABANDONED/SUPERSEDED — no real "
        + "board row ever existed; its concrete work was spun out to FIX-EVIDENCE-PIPELINE-STARVED (real root: "
        + "evidence_fragments=0 -> accumulator falsely reports success) + FIX-VPS-SSC-INSIDER-502 (decoupled VPS "
        + "dep, 2026-07-01T06:49Z). Do NOT resurrect the umbrella. Any write to .task_board.head is a BUG — write "
        + ".head. Durable write-gate guard tracked by FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD "
        + "(DeprecatedHeadStubSchema.passthrough() currently lets routing keys pass Zod silently).")
  }

# --- 2. id-guarded MINT of the G-7 write-gate guard task -> backlog[] (PLAN-ONLY) ---
| (if guard_exists then . else
    .task_board.backlog += [{
      id: GUARD_ID,
      title: ("FIX — enforce G-7 at the orch-apply WRITE GATE: .task_board.head was re-inflated with routing "
        + "fields (2nd occurrence; po-s66 collapsed it 2026-06-15, dev-team re-inflated 2026-07-01). "
        + "DeprecatedHeadStubSchema uses .passthrough() so routing keys pass Zod silently — reject "
        + "active_task_id/next_agent/routing-status on .task_board.head at write time."),
      owner: "architect",
      next_agent: "architect",
      status: "BACKLOG",
      zone: "apps/mcp-server/",
      type: "FIX",
      priority: "medium",
      created_at: $now,
      created_by: "po-s138",
      status_note: ("PLAN-ONLY (anomaly-task-bridge + recurring-bug-escalation: 2nd head-drift re-inflation). "
        + "AC: a write that sets routing fields (active_task_id!=null OR next_agent!=null OR status in the routing "
        + "set) on .task_board.head is REJECTED by the write path (Zod DeprecatedHeadStubSchema tightened from "
        + ".passthrough() to reject routing keys, and/or scripts/orch-apply.sh guard) with a clear error; the "
        + "deprecated redirect stub (status=deprecated, canonical_moved_to=.head, active_task_id=null) still "
        + "validates. Root: po-s66 retargeted 3 known writer scripts but the guard was doc-only (G-7 comment); a "
        + "new writer (dev-team flow) bypassed it — find & fix that writer too. Files: "
        + "apps/mcp-server/src/infrastructure/orchStateSchema.ts (DeprecatedHeadStubSchema), scripts/orch-apply.sh. "
        + "No dispatch pre-approved.")
    }]
  end)

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-s138"
