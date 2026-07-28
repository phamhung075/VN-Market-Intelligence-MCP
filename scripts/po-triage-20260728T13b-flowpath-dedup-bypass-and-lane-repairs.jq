# scripts/po-triage-20260728T13b-flowpath-dedup-bypass-and-lane-repairs.jq
#
# PO triage pass 3, 2026-07-28T13Z. Three transforms, one atomic write.
#
# (1) MINT FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE.
#     Router surfaced it second-hand ("filed 07-25"); PO source-verified it
#     end-to-end before minting and found no prior-art row. See root_cause.
#
# (2)+(3) LANE REPAIRS — two more instances of the same NO-LANE hole that this
#     tick's epic routing fixed, both found by PO's own prior-art greps rather
#     than reported. Neither is a new defect; both are one-field lane stamps.
#
# Usage (ALWAYS from project root, ALWAYS through the gate):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-triage-20260728T13b-flowpath-dedup-bypass-and-lane-repairs.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $n

| .task_board.backlog += [
  {
    id: "FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE",
    title: "cowork spawn-fanout dispatches slot.flow_path, not slot.trigger_prompt — digest-daily is the one slot whose two fields disagree, so every dispatcher fire enters daily-predict.md directly and never evaluates the published:digest-daily:<UTC_DATE> duplicate-claim gate, which lives only in main.md",
    status: "BACKLOG",
    type: "FIX",
    priority: "P1",
    size: "S",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    created_at: $n,
    created_by: "po/triage-20260728T13",
    root_cause: "Four facts, each verified at source by PO 2026-07-28T13:3xZ, not inferred from the report. (1) docs/agents/cowork-team/flow/spawn-fanout.md:192 builds the spawn prompt as `run <slot.flow_path>  slot=<slot.slot_id>` — the dispatched entry point is slot.flow_path; slot.trigger_prompt is never read by the spawn step. (2) docs/data/cowork-schedule.json digest-daily carries flow_path='docs/agents/digest-predict/flow/daily-predict.md' but trigger_prompt='run docs/agents/digest-predict/flow/main.md  slot=digest-daily' — the two fields name DIFFERENT files. Its sibling digest-sunday has both fields naming main.md, so digest-daily is the sole divergent slot on the schedule. (3) The daily dedup gate is 'Step pre-D: DAILY-PREDICT DEDUP GATE' at docs/agents/digest-predict/flow/main.md:15-45, claiming published:digest-daily:<UTC_DATE> with an 86400s TTL. It exists ONLY in main.md. (4) daily-predict.md contains exactly ONE task_claim (line 131) and it is the commit-mutex, not a published marker. THEREFORE every cowork-dispatched digest-daily fire enters daily-predict.md and skips the gate entirely. The gate's own comment states what is lost: it 'protects against cron re-fire, session restart, or dispatcher double-fire producing duplicate claims for the same UTC calendar day' — precisely the protection that is dead on the only path the dispatcher uses.",
    deliverable: "PREFERRED (general): make spawn-fanout Step 5.2 dispatch slot.trigger_prompt when present, falling back to the composed flow_path form — trigger_prompt is the field literally named for this and is the one a slot author edits to change the entry point. PLUS a consistency assertion so a future slot cannot silently re-introduce the divergence: fail loud (or refuse the slot) when trigger_prompt names a different file than flow_path. ACUTE MITIGATION if the general fix is deferred: point digest-daily's flow_path at main.md so both fields agree — one field, immediate, but it does not stop the next slot from diverging. Do NOT 'fix' this by copying the dedup gate into daily-predict.md: that creates a second copy of a claim gate that must stay byte-identical to the first, which is the duplicate-predicate class scripts/lib/devteam-eligibility.jq was consolidated to kill.",
    acceptance: "Two consecutive dispatcher fires of digest-daily inside the same UTC calendar day produce ONE set of prediction claims, and the second logs the gate's own already-claimed skip path — proven from the live claim/lock evidence, not from flow prose. Negative control: a first fire of the day still runs (do not turn the gate into a blanket suppressor). Static assertion: every slot in docs/data/cowork-schedule.json has trigger_prompt and flow_path naming the same file, asserted by a test that reads the live schedule (today digest-daily is the only violation — it must be the one that fails before the fix and passes after).",
    note: "SEQUENCING WITH THE CATCH-UP EPIC: BA-COWORK-GUARANTEED-SLOT-CATCHUP FR-6 makes the published: marker the SOLE fire-authorization arbiter and adds catch-up as a THIRD caller of the fire path. digest-daily is guaranteed:true, so catch-up will dispatch it too — through the same flow_path, through the same missing gate. Landing catch-up while this bypass stands means retro-fires can duplicate a day's prediction claims with no arbiter. This row does not depend_on the epic and should land BEFORE or ALONGSIDE it; recorded as a note, not a dep, so it stays independently dispatchable. Prior-art grep before minting (feedback_file_prior_art_check_before_minting_row): searched the whole board on flow_path / trigger_prompt / spawn-fanout 5.2 / published-marker bypass / dedup-gate bypass — only hit was FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT, a different mechanism (echo|jq mangling in the CHEF same-tick mutex). Router reported this 'filed 07-25'; no such row exists on the board, so the filing never became a row — the PO mint!=board lesson, live again."
  }
]

# ---------- lane repairs: two more NO-LANE-hole instances ----------
| .task_board.backlog = (.task_board.backlog | map(
    if ((.id // "") == "FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT")
    then . + {
      supervised: true,
      updated_by: "po/triage-20260728T13",
      po_lane_repair_20260728: "LANE REPAIR. This P1 row was plan_only:true with supervised absent — which matches NOTHING: BOUNDED-1 gates plan_only, and the Supervised-Lane Sweep's select requires BOTH effective_supervised AND effective_plan_only (either alone matches nothing, zone-routing.md Step A2). Verified by execution before and after: is_bounded1_eligible=false / SLS-select=false beforehand. Set supervised:true, which is the semantically correct half of the pair for a row whose own title begins 'PLAN-ONLY' and whose next_agent is ba — it now matches the SLS lane that exists for exactly this class (same shape as FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION). NOT moved to ready[]: RLC excludes effective_plan_only, so ready[] would have been a second dead end.",
      po_second_facet_20260728: "SECOND CONSEQUENCE of the same root cause, folded in rather than minted (cowork main.md Step 0a's blanket NEW->READ). This row already owns the cross-team leg: dev-team's drain filters status==NEW, so rows Step 0a already flipped to READ are invisible to it and cold-evict after 24h. The same blanket flip ALSO buries po-addressed rows before PO ever reads them — Step 0a instructs marking every processed signal_queue row NEW->READ, but when slots[] is empty there is no route to mark them toward, so obeying it literally is a pure loss. Reported 2026-07-28 by the router, which deliberately DISOBEYED the instruction to avoid burying this tick's 9 po-addressed rows. Same file, same line, same flip — one fix must serve both consumers: the flip must be conditional on the row actually having been routed somewhere, not on it having been merely read."
    }
    elif ((.id // "") == "FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT")
    then . + {
      next_agent: "developer",
      updated_by: "po/triage-20260728T13",
      po_lane_repair_20260728: "LANE REPAIR. Verified by execution: is_non_dev_owner_unrouted=true — owner 'po' is a non-dev deliberate-launch owner AND the board row's next_agent was empty, which gates it out of BOUNDED-1 while matching neither SLS (not supervised, not plan_only) nor RLC (not in ready[]). deps_satisfied=true, not an epic wrapper, not detail-deferred: the ONLY thing holding it was the missing next_agent. Zone is the cowork pressure-cadence flow + scripts, so the handler is the generic developer per docs/data/system-map.json (scripts/ -> developer). Found by PO's own prior-art grep for this tick's spawn-fanout mint, not reported by anyone."
    }
    else . end))
| .task_board._updated_at = $n
| .task_board._updated_by = "po (triage 20260728T13b — flow_path dedup-bypass mint + 2 lane repairs)"
| ._updated_at = $n
| ._updated_by = "po/triage-20260728T13"
