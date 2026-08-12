# scripts/po-20260812-rag-p0-expedite-and-wip-wrapper-unwedge.jq
#
# PO adjudication, 2026-08-12T05:42Z — ad-hoc escalation from router:
# rag-service hit A-30 BELOW-FLOOR 3x in ~90min (04:12Z / 05:03Z / 05:32Z);
# ops applied 3 scoped restarts as stopgap; the fully-specced P0 fix
# FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS
# (architect brief docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-
# unload-second-growth-source.md, LanceDB IvfPq vector index) sat undispatched
# in ready[].
#
# MEASURED ROOT CAUSE (all four claims live-verified this tick, not inferred):
#
# 1. The WIP budget was NOT blocked by the BLOCKED row. `wip_in_progress`
#    (scripts/lib/devteam-eligibility.jq:115-118) has excluded BLOCKED +
#    TERMINAL_SET rows since FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-
#    ROWS (2026-07-30). Live: 4 rows in in_progress[], wip_in_progress = 3.
#    FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (status BLOCKED) was already
#    discounted; FIX-BCTC-...-UNEXTRACTABLE-write (claimed_at=null) was NOT —
#    claimed_at plays no part in the formula, only .status does.
#
# 2. All 3 budget-consuming rows are decomposition bookkeeping, not live work,
#    and NONE holds a task_claim lock (task_list_held, 2026-08-12T05:36Z):
#      - UC-RDL-P4: pm_decomposition_complete=true, pm_completed_at
#        2026-08-11T14:00:00Z (15.6h ago); children RDL-P4-DISPATCH-TOOL-DEV
#        (ready[]) + UC-RDL-P4B-DOC-CUTOVER (backlog[]) already minted;
#        next_agent=pm is stale — pm has nothing left to do on the parent.
#      - FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE: same
#        shape; decomposition commit 5373e4dfc landed 2026-08-11, children
#        -write + -READ-SIDE-FAST-FOLLOW exist.
#      - FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write: claimed_at=null
#        AND owner="unassigned" — never claimed by anyone; a pm decomposition
#        CHILD mis-laned straight into in_progress[] instead of the ready[]
#        staging queue the WIP FORMULA note (dev-team/flow/main.md:475)
#        explicitly designates for "PM/architect decomposition" output.
#
# 3. WHY the shipped Step 4.4 Epic-Wrapper Autoclose Sweep never reclaimed
#    those slots — the actual root cause, definitif: `is_epic_wrapper`
#    (devteam-eligibility.jq:167) is `effective_children | length > 0`, and
#    `effective_children` (:161-165) reads ONLY `.children` (inline or
#    detail). pm records parenthood in three OTHER, mutually-incompatible
#    shapes. Board-wide census this tick over 703 rows: `.children` = 6 rows,
#    `.decomposed_tasks` = 5, `.subtasks` = 9, child-side `.parent`/
#    `.parent_task_id`-only = 12. So the sweep is structurally blind to ~26 of
#    ~32 live decomposition relationships, and every pm-decomposed parent
#    squats an in_progress[] concurrency slot permanently. This transform
#    backfills `.children` on the three affected parents — NOT a hand-close:
#    the sweep's own `all_children_terminal` guard (devteam-wrapper-
#    autoclose.jq:98) still applies, and none of these children are terminal,
#    so nothing closes prematurely. Durable fix minted as
#    FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND.
#
# 4. Freeing WIP would NOT have dispatched the rag-service P0 anyway. The
#    Ready-Lane Consumer orders by (priority_rank, ready[] array index) and
#    claims ONE row per invocation. Simulated 14 successive RLC claims by
#    replaying scripts/devteam-backlog-claim-ready-lane-consumer.jq against a
#    live board copy: FIX-RAG-EMBEDDER-... is the 8th pick, behind
#    FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST,
#    FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR, UC-CCA-P3, UC-CCA-P3-FR1-FR2-SKILL,
#    UC-CCA-P3-FR5-CODE-GATE, FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-
#    STARVATION, FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION —
#    it sits at ready[] index 76 of 78, LAST of the 26 P0 rows in the lane
#    (created 2026-08-08; the FIFO-proxy tiebreak is by array position, and a
#    P0 minted today always lands at the back). RLC wins the 6-way idle-chain
#    rotation once per ~6 ticks; dev-team cron is `7,37 * * * *`, so RLC is
#    selected roughly every 3h. Floor-bound expected latency ~24h, and in
#    practice far longer since each pick must ALSO find wip_in_progress < 2.
#    Against a ~50-minute OOM recurrence that is 3 orders of magnitude out.
#    => Manual PO/BATCH dispatch is not a "budget exception" to be granted
#    reluctantly; it is the ONLY mechanism that reaches this row in time.
#    Durable fix minted as FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-
#    INCIDENT-P0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-20260812-rag-p0-expedite-and-wip-wrapper-unwedge.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Does NOT touch .head (PO is not dev-team's dispatch loop — see
# docs/agents/po/flow/manual-dispatch-sweep.md § Why not the .head/WIP-budget
# path). head currently pins FIX-FB-GATE-POINT-PCT-MATH, already resident in
# done_verified[]; dev-team's own WF-1b TERMINAL-LANE check is the designed
# self-healer for that and will idle-reset it on the next tick.

def po_note($t): "[po/escalation-adjudication 2026-08-12T05:42Z] " + $t;

# ---------------------------------------------------------------------------
# Pull the four in_progress[] rows out, re-shaped, then re-file them.
# ---------------------------------------------------------------------------
(.task_board.in_progress // []) as $ip

| ([$ip[] | select(.id == "FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING")
    | . + {
        children: ["TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY",
                   "TASK-COWORK-SIGNAL-BCTC-REKEY",
                   "TASK-COWORK-SIGNAL-CHEF-INTRADAY",
                   "TASK-COWORK-SIGNAL-NAMING-CONTRACT"],
        claimed_at: null,
        claimed_by: null,
        po_adjudication_20260812T0542Z: po_note(
          "RULING (a) on the router escalation: this row IS genuinely live work, and it is correctly BLOCKED — but on PO, not on anything external, and it was NEVER the WIP blocker. Two separate corrections. (1) NOT A BUDGET CONSUMER: wip_in_progress has excluded BLOCKED rows since 2026-07-30 (FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS); live wip_in_progress read 3 with this row present, so releasing/reassigning it frees exactly zero budget. The escalation premise that this 5-day-stale row was 'blocking every idle-tick pickup lane' is refuted at source. (2) REAL DEFECT, corrected here: per docs/agents/dev-team/flow/execute-tier.md CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c), an IN_PROGRESS->BLOCKED flip MUST move the row in_progress[]->backlog[] in the SAME write. That never happened, and dev-team's WF-1 self-healing lane-move backstop never fired because it is gated on .head pointing at this row. Lane corrected to backlog[] here; status BLOCKED unchanged. NOT RELEASED, NOT REASSIGNED: pm's 2026-08-07T05:58Z decomposition into 4 atomic children is real, complete, and carries all 3 PO binding amendments; a developer subsequently authored spec artifacts for every child (e.g. docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md, developer_review_note works both PO Amendment-3 midnight-straddle test cases through to matching resolutions). All 4 children are alive in review[] with next_agent=po. next_agent HELD at po — PO owes these 4 plan_only spec reviews, and that debt is now visible in backlog[] instead of masquerading as active in_progress work. DELIBERATELY NOT reviewed this tick: 4 spec docs cannot be honestly adjudicated inside a P0 production-incident tick, and a shallow accept would be worse than the wait. Also backfilled .children (see header note 3) so the Step 4.4 autoclose sweep can finally see this wrapper; its all_children_terminal guard keeps it from closing while the 4 children sit non-terminal in review[].")
      }] | first // empty) as $cowork

| ([$ip[] | select(.id == "UC-RDL-P4")
    | . + {
        status: "BLOCKED",
        next_agent: "",
        children: ["RDL-P4-DISPATCH-TOOL-DEV", "UC-RDL-P4B-DOC-CUTOVER"],
        blocked_by: ["RDL-P4-DISPATCH-TOOL-DEV", "UC-RDL-P4B-DOC-CUTOVER"],
        claimed_at: null,
        claimed_by: null,
        po_adjudication_20260812T0542Z: po_note(
          "RULING (c): this row is a FINISHED decomposition container, not live work, and it is one of the 3 rows that actually held the WIP budget at 3 all session. Evidence, live-read this tick: its own pm_decomposition_complete=true and pm_completed_at=2026-08-11T14:00:00Z (15.6h before this ruling); both children already minted and filed (RDL-P4-DISPATCH-TOOL-DEV in ready[] P1 next_agent=developer, UC-RDL-P4B-DOC-CUTOVER in backlog[] P2); zero task_claim lock held for task:UC-RDL-P4 in task_list_held; zero board or commit activity since 2026-08-11T13:31:41Z. next_agent=pm was therefore provably stale — pm signed its own completion 15.6h ago and has nothing left to do on the parent. Disposition: in_progress[]->backlog[], IN_PROGRESS->BLOCKED, blocked_by=its own two children, next_agent nulled. This is the honest state (a wrapper waiting on its children) and it stops the row consuming a concurrency slot that no agent is using. NOT closed to a terminal status — the children have not shipped; the Step 4.4 autoclose sweep owns the eventual closeout and its all_children_terminal guard will hold until they do. .children backfilled so that sweep can see it at all (header note 3). The dispatchable work released by this ruling is the child RDL-P4-DISPATCH-TOOL-DEV, already correctly staged in ready[].")
      }] | first // empty) as $rdl

| ([$ip[] | select(.id == "FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE")
    | . + {
        status: "BLOCKED",
        next_agent: "",
        children: ["FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write",
                   "FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW"],
        blocked_by: ["FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write",
                     "FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW"],
        claimed_at: null,
        claimed_by: null,
        po_adjudication_20260812T0542Z: po_note(
          "RULING (c), same class and same disposition as UC-RDL-P4 above. Evidence: pm's decomposition commit 5373e4dfc ('chore(pm): decompose & handoff') landed 2026-08-11 and both children exist on the board (-write, -READ-SIDE-FAST-FOLLOW); last touch 2026-08-12T00:00:27Z by pm; no task_claim lock held for task:FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE in task_list_held. This row lacks UC-RDL-P4's explicit pm_decomposition_complete stamp — that ABSENCE is itself the field-drift defect this tick is minting a fix for, not evidence that pm is still working. next_agent=pm nulled, in_progress[]->backlog[], IN_PROGRESS->BLOCKED, blocked_by=its own children. P0 priority HELD — the underlying 66-shell data-integrity defect is untouched and its real work now flows through the -write child, which this same write re-lanes into ready[] where a picker can actually reach it.")
      }] | first // empty) as $bctc_parent

| ([$ip[] | select(.id == "FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write")
    | . + {
        status: "READY",
        claimed_at: null,
        claimed_by: null,
        po_adjudication_20260812T0542Z: po_note(
          "RULING (c) + DIRECT CORRECTION OF THE ESCALATION'S INVERTED GUESS. The router asked whether this row's null claimed_at meant it was 'likely excluded from the wip_in_progress count already'. It is the exact opposite: wip_in_progress (scripts/lib/devteam-eligibility.jq:115-118) filters ONLY on .status (BLOCKED or TERMINAL_SET); claimed_at is never read. This row's status is IN_PROGRESS, so it consumed a full, real concurrency slot — while claimed_at=null and owner='unassigned' prove no agent ever claimed it. It is a pm decomposition CHILD written straight into in_progress[] instead of the ready[] staging queue that dev-team/flow/main.md:475's own WIP FORMULA note designates for 'PM/architect decomposition' output. Re-laned to ready[] with status READY: it keeps next_agent=dev-mcp-server, becomes visible to the Ready-Lane Consumer, and stops charging a budget slot for work nobody is doing. This was the one unambiguously false slot on the board.")
      }] | first // empty) as $bctc_write

# ---------------------------------------------------------------------------
# Apply: empty in_progress[], re-file the four rows, stamp the P0 expedite,
# stamp the manual-dispatch-sweep pick, mint the two durable fixes.
# ---------------------------------------------------------------------------
| .task_board.in_progress = [ $ip[] | select(
      (.id == "FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING")
   or (.id == "UC-RDL-P4")
   or (.id == "FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE")
   or (.id == "FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write") | not) ]

| .task_board.backlog = (.task_board.backlog // []) + [$cowork, $rdl, $bctc_parent]
| .task_board.ready   = (.task_board.ready // []) + [$bctc_write]

# --- (b) the P0 expedite stamp: additive only, row stays in ready[] ---------
| .task_board.ready |= map(
    if .id == "FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS"
    then . + {
      po_manual_dispatch_flagged_at: $now,
      po_manual_dispatch_flagged_by: "po (escalation adjudication — severity expedite)",
      po_manual_dispatch_class: "PO-SEVERITY-EXPEDITE",
      po_manual_dispatch_note: "po expedite — folded into this tick's BATCH for immediate router dispatch to dev-rag-service",
      po_expedite_20260812T0542Z: po_note(
        "RULING (b): DISPATCH NOW, manually, to dev-rag-service. GRANTED — but the framing 'WIP-budget exception' is wrong and should not be recorded as the precedent. Freeing WIP would not have reached this row: measured by replaying scripts/devteam-backlog-claim-ready-lane-consumer.jq 14x against a live board copy, this row is the 8th successive Ready-Lane-Consumer pick (behind FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST, FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR, UC-CCA-P3, UC-CCA-P3-FR1-FR2-SKILL, UC-CCA-P3-FR5-CODE-GATE, FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION, FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION). It sits at ready[] index 76 of 78, LAST of 26 P0 rows, because RLC's tiebreak inside a priority class is the FIFO array index and this row was minted 2026-08-08 into an already-deep queue. RLC claims ONE row per invocation and wins the 6-way idle-chain rotation about once per 3h (cron 7,37 * * * *), and each pick must additionally find wip_in_progress < 2. Floor-bound latency ~24h, realistically days, against a ~50-minute OOM recurrence. Manual dispatch is the only mechanism with the right time constant, not a favour. CORRECTION TO THE ESCALATION RECORD: this row has NOT 'never been dispatched'. task_list_held at 2026-08-12T05:36Z carries a live orphan-signal:task:FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS, owner_session=server-reaper, redispatch_count=1, orphaned_at 2026-08-12T04:15:21Z, last_payload {site:'S1',spawning:'dev-rag-service'} — i.e. execute-tier.md:56 DID claim it and spawn dev-rag-service ~03:15Z, the claim died, and the reaper minted a redispatch signal that expires 2026-08-12T06:15:21Z. dev-rag-service's notebook has no 2026-08-12 entry at all, so zero work landed. That orphan-signal is live for ~30 more minutes and must be adopted or explicitly released by the dispatching session; a second uncoordinated spawn risks a duplicate. SCOPE FOR THE DISPATCH: implement the architect's ratified fix from docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md — LanceDB lancedb.index.IvfPq vector index on rag_entries (confirmed importable at the pinned lancedb 0.36.0); the candidate-2 measurement (+340-444 MiB across ~20-60 real search() calls, malloc_trim recovering only 8-15%) is the load-bearing evidence and allocator hygiene alone is explicitly NOT sufficient. AC must include the corrected >=2h live cold-start heap-growth-rate methodology from the brief, not a before/after idle-unload dip. OPS STOPGAP RULING: the 3 scoped restarts were correct and ops should keep restarting on BELOW-FLOOR until the index ships — the standing 'do not restart, it resets the meter' guidance in this row's own po_fold_20260811T1826Z is now SUPERSEDED for the duration of this incident, because the root cause is diagnosed and confirmed, so trajectory evidence has no remaining diagnostic value and OOM avoidance dominates.")
    } else . end)

# --- manual-dispatch-sweep Step 2 stamp (mandatory pre-check, 87 candidates) -
| .task_board.backlog |= map(
    if .id == "TASK-COWORK-MUTEX-001"
    then . + {
      po_manual_dispatch_flagged_at: $now,
      po_manual_dispatch_flagged_by: "po (manual-dispatch-sweep)",
      po_manual_dispatch_class: "BACKLOG-XOR-GAP",
      po_manual_dispatch_note: "po (manual-dispatch-sweep) surfaced BACKLOG-XOR-GAP candidate — folding into this tick's BATCH"
    } else . end)

# --- durable fixes for the two root causes measured above -------------------
| .task_board.backlog += [
  {
    id: "FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0",
    type: "FIX",
    priority: "P1",
    status: "BACKLOG",
    size: "M",
    zone: "cross-service/",
    owner: "architect",
    next_agent: "architect",
    created_at: $now,
    created_by: "po (escalation adjudication 2026-08-12T05:42Z)",
    title: "Ready-Lane Consumer has no severity/incident expedite path: inside one priority class the tiebreak is the ready[] array index, so a P0 minted for a LIVE production incident lands at the back of a 78-deep queue and is unreachable in incident time",
    desc: "MEASURED, not inferred. Replaying scripts/devteam-backlog-claim-ready-lane-consumer.jq 14 successive times against a live copy of the board on 2026-08-12T05:36Z put FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS — a P0 for a service that was OOM-cycling every ~50 minutes and had taken 3 emergency ops restarts in 90 minutes — at pick #8. It sits at ready[] index 76 of 78 and is the LAST of 26 P0 rows in the lane. RLC's documented selection is 'ordered by priority_rank ascending, tiebreak by ready[] array index (FIFO proxy)'; a row minted today is always appended, so recency and severity are anti-correlated with dispatch order inside a priority class. Compounding factors, both live-verified: RLC claims exactly ONE row per invocation (its own header: 'single row per invocation'), and it only runs when it wins the 6-way idle-chain rotation (.dev_team_idle_chain.rotation shows all 6 candidates served ~30min apart, i.e. ~3h per lane, against cron `7,37 * * * *`). Every pick must additionally satisfy wip_in_progress < 2. Floor-bound expected latency for the tail of the P0 class is ~24h and realistically days. PO had to hand-dispatch out of band, which is a producer-with-no-mechanism escape hatch, not a designed path.",
    scope: "Design an expedite/severity dimension for ready-lane selection that does NOT simply add a 4th priority tier (P0 is already saturated at 26 rows — a new tier saturates the same way). Candidate shapes for the architect to adjudicate, none pre-selected: (a) an explicit, PO-settable `expedite_at` / `incident_ref` field that sorts ahead of priority_rank and is bounded to N rows so it cannot itself saturate; (b) age-weighted or arrival-inverted tiebreak inside a priority class so a fresh incident row is not structurally last; (c) a separate low-cardinality incident lane with its own budget, outside the shared WIP<=2 slot and outside the 6-way rotation, mirroring how QA-Drain already carries an independent qa[] budget for structurally different work. Any design MUST keep the existing single-linear head-writer collision-freedom proof intact (docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md).",
    files: ["scripts/devteam-backlog-claim-ready-lane-consumer.jq", "scripts/lib/devteam-eligibility.jq", "docs/agents/dev-team/flow/main.md"],
    dedup_checked: "Scanned backlog[]/ready[]/in_progress[]/review[] for expedite|starv|fifo|ready-lane rows before mint. Nearest neighbours are all distinct: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION (starvation of the step1_triage lane under rotation, not ordering WITHIN the ready lane), FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION (dependency-status starvation), FIX-DEVTEAM-READYLANE-DISPATCH-GUARD-NO-REGRESSION-TEST (test coverage for the dispatch guard). No existing row owns intra-priority-class ordering or an incident expedite path.",
    related: ["FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS", "FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION", "FIX-DEVTEAM-READYLANE-DISPATCH-GUARD-NO-REGRESSION-TEST"]
  },
  {
    id: "FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND",
    type: "FIX",
    priority: "P1",
    status: "BACKLOG",
    size: "S",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    created_at: $now,
    created_by: "po (escalation adjudication 2026-08-12T05:42Z)",
    title: "is_epic_wrapper reads only .children, but pm records parenthood in 3 other shapes — the Step 4.4 Epic-Wrapper Autoclose Sweep is blind to ~26 of ~32 live decomposition relationships, so every pm-decomposed parent squats an in_progress[] WIP slot forever",
    desc: "ROOT CAUSE of a session-long fleet stall. is_epic_wrapper (scripts/lib/devteam-eligibility.jq:167) is `effective_children | length > 0`, and effective_children (:161-165) reads ONLY `.children`, inline or via backlog-detail. pm's decomposition writes parenthood in three other, mutually-incompatible shapes. Board-wide census over 703 rows on 2026-08-12T05:40Z: `.children` present on 6 rows, `.decomposed_tasks` on 5, `.subtasks` on 9, and 12 rows record the relationship ONLY child-side via `.parent`/`.parent_task_id` with nothing at all on the parent. scripts/devteam-wrapper-autoclose.jq:97 gates on is_epic_wrapper, so it cannot see any of the non-`.children` shapes. LIVE HARM, measured this tick: 3 of the 4 rows in in_progress[] were finished or never-started decomposition bookkeeping — UC-RDL-P4 (pm_decomposition_complete=true, pm_completed_at 2026-08-11T14:00:00Z, both children minted), FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE (decomposition commit 5373e4dfc, both children minted), and FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write (a CHILD, claimed_at=null, owner='unassigned', mis-laned straight into in_progress[]). None held a task_claim lock. They pinned wip_in_progress at 3 against a cap of 2, gating BOUNDED-1/SLS/RLC/DRS fleet-wide for the whole session, and directly delayed a P0 production-incident fix while rag-service took 3 emergency restarts. PO hand-repaired the 3 rows and backfilled `.children` on the 2 parents; that is containment, not a fix.",
    scope: "TWO halves, both required. READ side: widen effective_children to union all parent-side shapes (.children, .decomposed_tasks, .subtasks) AND to resolve child-side parenthood by scanning task_board lanes for rows whose .parent/.parent_task_id equals this row's id — reusing as_dep_array for shape normalization exactly as the existing def does, no fresh literal field list. WRITE side: pick ONE canonical field (.children) and make pm's decomposition path emit it, so the read-side union degrades to a compatibility shim for historical rows rather than a permanent fan-out. Also fix the second-order defect the same incident exposed: a decomposition CHILD must be minted into ready[] (the staging queue dev-team/flow/main.md:475's WIP FORMULA note explicitly designates for 'PM/architect decomposition' output), never directly into in_progress[], and a parent whose decomposition is complete must not retain a stale next_agent pointing at the agent that already finished (UC-RDL-P4 carried next_agent=pm for 15.6h after its own pm_completed_at stamp).",
    files: ["scripts/lib/devteam-eligibility.jq", "scripts/devteam-wrapper-autoclose.jq", "docs/agents/pm/flow/main.md", "docs/agents/dev-team/flow/post-cycle.md"],
    verification_gate: "regression fixture proves a parent carrying ONLY .decomposed_tasks, ONLY .subtasks, or ONLY child-side .parent links resolves is_epic_wrapper=true and is swept by devteam-wrapper-autoclose.jq once all its children are terminal — and is NOT swept while any child is non-terminal (all_children_terminal guard must still hold for every newly-visible shape)",
    dedup_checked: "No existing row covers effective_children/is_epic_wrapper field coverage. FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP (2026-07-29) built the sweep itself and is DONE; FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS (2026-07-30) fixed the BLOCKED-row half of the same WIP-squatting family and is the direct precedent for this row — this is the decomposition-wrapper half of that same defect class, one layer up.",
    related: ["FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS", "FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP", "UC-RDL-P4", "FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE"]
  }
]

| ._updated_at = $now
| ._updated_by = "po (escalation adjudication — rag-service P0 expedite + WIP wrapper unwedge)"
| .task_board._updated_at = $now
| .task_board._updated_by = "po (escalation adjudication 2026-08-12T05:42Z)"
