# scripts/pm-decompose-20260823T1045-siginbox-and-proseceiling.jq
#
# pm decomposition, 2026-08-23T10:45Z, session 7be6b4cd.
#
# ROW 1  FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER
#        -> 3 children (developer / agent-father / qa) per
#           docs/architecture-briefs/2026-08-23-signal-inbox-orphan-escalation-discriminator.md
# ROW 2  FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS
#        -> 2 children (§3 ONLY, shipped first and alone per brief §8 step 1) per
#           docs/architecture-briefs/2026-08-23-orch-row-prose-ceiling-value-shape-measure-and-frozen-cohort-paydown.md
#        + 1 deferred backlog row for §4 (targeted compaction + paydown)
# PLUS   1 backlog row for the pm terminal-lane bloat gate's missing unclearable branch
#        (measured this cycle: orch-cold-evict.sh --dry-run evicts 0 of 44 terminal rows).
#
# Usage:
#   jq -f scripts/pm-decompose-20260823T1045-siginbox-and-proseceiling.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# depends_on (never `depends`) on every new row — orch-validate.mjs Stage 1f hard-fails a row
# carrying BOTH fields when `.depends` names an id absent from `.depends_on`.

def NOW: "2026-08-23T10:45:00Z";

.task_board.ready += [
  {
    id: "TASK-SIGINBOX-ORPHAN-ESCALATION-CORE",
    type: "FIX",
    title: "drain-signals.js: age-bounded one-shot dedup'd escalation for genuinely orphaned inbox files — ledger table in signals.db, escalation emitted as a normal enveloped signal in the existing pass-2 write loop, one ROUTING_TABLE row, spec-first in drain-signals.md",
    owner: "developer",
    status: "READY",
    priority: "P1",
    size: "M",
    zone: "cross-service/",
    next_agent: "developer",
    parent: "FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER",
    created_at: NOW,
    created_by: "pm",
    updated_at: NOW,
    updated_by: "pm",
    depends_on: [],
    handoff: "docs/handoffs/TASK-SIGINBOX-ORPHAN-ESCALATION-CORE.md",
    files: [
      "docs/agents/dev-team/flow/drain-signals.md",
      "scripts/agents-flow/drain-signals.js",
      "scripts/agents-flow/drain-signals.test.js",
      "docs/standards/mcp-tools.md"
    ],
    verification_gate: "AC-4 proves the discriminator: a 90-day-old price_anomaly_ file, well-formed and unenveloped, produces ZERO ledger rows and ZERO escalations. Without that test the task is not done.",
    note: "SPEC IS IN THE HANDOFF FILE, NOT ON THIS ROW: docs/handoffs/TASK-SIGINBOX-ORPHAN-ESCALATION-CORE.md (read it FIRST — architect_handoff has zero readers fleet-wide, so a pointer to the brief would strand you). HARD CONSTRAINT, NON-NEGOTIABLE: isDrainableShape() (drain-signals.js:84-88) and isByPathConsumerFile()/BY_PATH_CONSUMER_FAMILIES (:101-107) stay BYTE-FOR-BYTE UNCHANGED, and the 21 price_anomaly_* files are a sanctioned by-path family that must NOT be folded in — that family has already been misdiagnosed as inbox litter 4 times and reader-widening is the fix the brief explicitly REJECTS. WHY drain-signals.md AND drain-signals.js ARE ONE TASK: drain-signals.js:183-188 declares ROUTING_TABLE a hand-kept mirror of the spec table and requires both be changed in the SAME commit (precedent 5ad4a3f92). Do NOT touch docs/agents/dev-team/flow/main.md, market-watcher/flow/eod.md, or notebook-auto-prune.sh. Do NOT hardcode 51/49/26/21/2 anywhere — the inbox moved between two measurements 8 minutes apart during design."
  },
  {
    id: "TASK-SIGINBOX-WRITER-CONTRACT-DOC-POINTER",
    type: "FIX",
    title: "spawn-fanout.md:55,464 cite a signal file at a path that no longer exists (pm re-verified: file is in docs/signals/processed/) + add the one writer-side sentence stating the envelope-or-by-path contract that only a reader-side predicate enforces today",
    owner: "agent-father",
    status: "READY",
    priority: "P1",
    size: "S",
    zone: "docs/agents/cowork-team/",
    next_agent: "agent-father",
    parent: "FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER",
    created_at: NOW,
    created_by: "pm",
    updated_at: NOW,
    updated_by: "pm",
    depends_on: ["TASK-SIGINBOX-ORPHAN-ESCALATION-CORE"],
    handoff: "docs/handoffs/TASK-SIGINBOX-WRITER-CONTRACT-DOC-POINTER.md",
    files: ["docs/agents/cowork-team/flow/spawn-fanout.md"],
    note: "Spec: docs/handoffs/TASK-SIGINBOX-WRITER-CONTRACT-DOC-POINTER.md. Split from the core task ONLY because spawn-fanout.md is a cowork-team agent flow doc (agent-father commit zone). One file, three lines. depends_on the core task because AC-3's pointer target (the escalation write-up in docs/standards/mcp-tools.md section 'price_anomaly - DUAL-PLANE CONTRACT') is written by that task — do not write a pointer to content that does not exist yet."
  },
  {
    id: "TASK-SIGINBOX-LIVE-FIRST-RUN-GATE",
    type: "QA",
    title: "Own the parent row's verification_gate: on the first real post-fix drain tick, every genuinely-orphaned file escalates exactly once, zero by-path files escalate, and a second tick emits zero repeats",
    owner: "qa",
    status: "READY",
    priority: "P1",
    size: "S",
    zone: "cross-service/",
    next_agent: "qa",
    parent: "FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER",
    created_at: NOW,
    created_by: "pm",
    updated_at: NOW,
    updated_by: "pm",
    depends_on: ["TASK-SIGINBOX-ORPHAN-ESCALATION-CORE"],
    handoff: "docs/handoffs/TASK-SIGINBOX-LIVE-FIRST-RUN-GATE.md",
    files: ["docs/signals/", "scripts/agents-flow/drain-signals.js"],
    verification_gate: "no_file_can_sit_in_docs_signals_beyond_a_declared_age_without_either_being_drained_or_raising_a_loud_escalation_that_names_it",
    note: "Spec: docs/handoffs/TASK-SIGINBOX-LIVE-FIRST-RUN-GATE.md. Separate task because (a) the parent's verification_gate is a statement about the LIVE inbox that fixture tests cannot prove, and (b) the first real run emits one escalation per stuck file in a single tick straight into PO's Step 0-SIG queue — a one-time blast that deserves supervised observation, not a side effect of a developer's last test run. RE-MEASURE the population at run time; do NOT carry any integer from the brief. If the one-shot property fails on live data (escalations re-fire every tick) that is WORSE than the silence it replaced — escalate and recommend revert."
  },
  {
    id: "TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES",
    type: "FIX",
    title: "orch-row-prose-ceiling-check.mjs looks up a row's live baseline in only backlog/ready/review, so a byte-identical lane move out of in_progress[]/qa[]/active_sprints[] gets liveBytes=0 and hard-rejects with a false net-new-growth message (brief D3)",
    owner: "developer",
    status: "READY",
    priority: "P1",
    size: "S",
    zone: "cross-service/",
    next_agent: "developer",
    parent: "FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS",
    created_at: NOW,
    created_by: "pm",
    updated_at: NOW,
    updated_by: "pm",
    depends_on: [],
    handoff: "docs/handoffs/TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES.md",
    files: [
      "scripts/orch-row-prose-ceiling-check.mjs",
      "scripts/test/orch-row-prose-ceiling-check-tests.sh",
      "docs/policies/dev-standards.md"
    ],
    verification_gate: "AC-1: UC-CCA-P3 moved in_progress[]->review[] byte-identical exits 0 (today: exit 1, live=0B -> candidate=12161B). AC-4: duplicate-id max() rule holds with EITHER copy larger.",
    note: "Spec: docs/handoffs/TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES.md. SHIP FIRST AND ALONE (brief §8 step 1) — read-only predicate change, depends on nothing open, unblocks a live defect. MECHANISM CONFIRMED IN CODE: PROSE_CEILING_LANES at :105 omits in_progress[], so collectRowsById() misses the live row, liveBytes falls to 0 at :267, and :269 hard-rejects. Two rows are parked BLOCKED-in-place right now instead of lane-moved because of this. KEEP THE GATED SET AT backlog|ready|review — widen ONLY the live baseline lookup, with max(proseBytes) across duplicate ids (3 duplicate ids exist live; last-wins could pick the smaller copy and manufacture a false reject). CORRECTION TO CARRY: 'numeric occurrence bump is rejected' is FALSE — occurrence_count 1->2 already passes (same digit count, zero delta). A fix scoped to integer increments fixes NONE of the live blocks."
  },
  {
    id: "TASK-PROSECEILING-VALUE-SHAPE-MEASURE",
    type: "FIX",
    title: "Measure the row prose ceiling over VALUE SHAPE (string >200B or non-empty container) union'd with STRUCTURAL_FIELDS, extracted into a shared scripts/lib/orch-row-prose-measure.mjs, plus an over-ceiling-only scalar-delta cap — replaces a closed name-allowlist over an open 846-name namespace",
    owner: "developer",
    status: "READY",
    priority: "P1",
    size: "M",
    zone: "cross-service/",
    next_agent: "developer",
    parent: "FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS",
    created_at: NOW,
    created_by: "pm",
    updated_at: NOW,
    updated_by: "pm",
    depends_on: ["TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES"],
    handoff: "docs/handoffs/TASK-PROSECEILING-VALUE-SHAPE-MEASURE.md",
    files: [
      "scripts/lib/orch-row-prose-measure.mjs",
      "scripts/orch-row-prose-ceiling-check.mjs",
      "scripts/test/orch-row-prose-ceiling-check-tests.sh",
      "scripts/orch-apply.sh",
      "docs/policies/dev-standards.md"
    ],
    verification_gate: "AC-2 is load-bearing and must FAIL-CLOSED: +1 byte appended to a >200B prose field on a frozen row still ABORTS. Without it the fix cannot be distinguished from disarming the ceiling.",
    note: "Spec: docs/handoffs/TASK-PROSECEILING-VALUE-SHAPE-MEASURE.md. depends_on LIVE-BASELINE-ALL-LANES: same file, so sequential by construction. THIS IS TURN 4 OF A 3-TURN LOOP IF DONE AS A NAME-LIST PATCH — instance #1's own AC-5 already ordered the enumeration and it was never done; 846 field names live, 33 excluded, 813 counted as prose. Derive from value shape instead. MONOTONE BY CONSTRUCTION (exclusion set only grows), so no write that passes today can start failing — preserve that property. NOT IN SCOPE: --list-over-ceiling, orch-backlog-stub.sh, any paydown (all deferred to FOLLOWUP-PROSECEILING-TARGETED-COMPACTION-AND-FROZEN-COHORT-PAYDOWN); raising the ceiling; a bypass env var; removing STRUCTURAL_FIELDS; special-casing integer increments; orchStateSchema.ts; docs/agents/po/flow/manual-dispatch-sweep.md (needs NO edit under this design — scope reduction, drop it from the sibling row's file list)."
  }
]

| .task_board.backlog += [
  {
    id: "FOLLOWUP-PROSECEILING-TARGETED-COMPACTION-AND-FROZEN-COHORT-PAYDOWN",
    type: "FIX",
    title: "orch-backlog-stub.sh has no id filter, no threshold filter and no per-row mode — it is a whole-lane bulk migrator, which is why the frozen over-ceiling cohort has had no return path for 14 days. Add --ids/--over-ceiling-only + --list-over-ceiling, align STUB_FIELDS to the complement of the new measure, then run a supervised targeted paydown",
    owner: "developer",
    status: "BACKLOG",
    priority: "P2",
    size: "M",
    zone: "cross-service/",
    next_agent: "developer",
    parent: "FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS",
    created_at: NOW,
    created_by: "pm",
    updated_at: NOW,
    updated_by: "pm",
    depends_on: [
      "TASK-PROSECEILING-VALUE-SHAPE-MEASURE",
      "FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION"
    ],
    files: ["scripts/orch-backlog-stub.sh", "scripts/orch-row-prose-ceiling-check.mjs"],
    verification_gate: "AC-7 of the brief: after an --over-ceiling-only stub run, manual-dispatch-sweep.md Step 1's flag_reentrant still reads a NON-EMPTY po_manual_dispatch_flagged_at off the HOT row. STUB_FIELDS alignment must land BEFORE any run, not after.",
    note: "Brief §4 + §8 steps 2-4: docs/architecture-briefs/2026-08-23-orch-row-prose-ceiling-value-shape-measure-and-frozen-cohort-paydown.md. DELIBERATELY DEFERRED out of the §3 decomposition — §3 is a read-only predicate change and must ship first and alone. TWO HARD GATES, both HIGH severity in the brief's own risk register: (1) the paydown is data-destructive if run before FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION (review[], P0) is VERIFIED — that reproduction is in the 2026-08-09 brief's F-3; (2) today's 12-name STUB_FIELDS would strip po_manual_dispatch_flagged_at, occurrence_count, owner, next_agent, supervised and plan_only, and manual-dispatch-sweep.md Step 1 reads the first of those INLINE with no detail_ref fallback — a ready[] stub run under today's field set would silently clear every idempotency flag and re-surface the whole candidate set. --dry-run first, always. PROJECTED (modelled read-only against the live file): 22 rows touched, 426,251 bytes to cold, hot file -14.5%, largest surviving hot row 1839B, frozen cohort 23 -> 0."
  },
  {
    id: "FIX-PM-BLOAT-GATE-NO-UNCLEARABLE-BRANCH-REFIRES-ON-STRUCTURALLY-UNEVICTABLE-LANES",
    type: "FIX",
    title: "pm flow Step 1's terminal-lane bloat gate fires every cycle on done[]>10 / done_verified[]>0 and dispatches a remediation sub-flow that can evict nothing — measured 2026-08-23: orch-cold-evict.sh --dry-run reports 0 evictable in every category, projected byte reduction 0, because the referential guard holds 30/30 done_verified ids and 4/4 rank-eligible done ids",
    owner: "agent-father",
    status: "BACKLOG",
    priority: "P2",
    size: "S",
    zone: "docs/agents/pm/",
    next_agent: "agent-father",
    created_at: NOW,
    created_by: "pm",
    updated_at: NOW,
    updated_by: "pm",
    depends_on: [],
    files: ["docs/agents/pm/flow/main.md", "docs/agents/pm/flow/task-archive.md"],
    verification_gate: "A pm cycle that measures the lanes as structurally unevictable records that verdict somewhere durable and does NOT re-run the same investigation next cycle. Prove it by showing two consecutive pm cycles where the second one reads the first one's verdict instead of re-deriving it.",
    note: "MEASURED BY PM 2026-08-23T10:40Z, read-only, not inferred. Gate state: done[]=14 (threshold 10), done_verified[]=30 (threshold 0), and the flow's own HSC-6 invariant says done_verified[] must never exceed 5. Ran the remediation tool: `bash scripts/orch-cold-evict.sh --dry-run` -> every category 0, 'Byte reduction: 0 bytes', projected hot file byte-identical at 3,203,251 B. ROOT CAUSE, verified in code: the FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING referential eviction guard (orch-cold-evict.sh:214-229, applied at :467 and :491) holds any terminal row whose id is still named in a live row's effective_depends_on across TASK_LANES plus backlog-detail.json. Recomputed independently: 30 of 30 done_verified ids and 4 of 4 rank-eligible done ids (KEEP_RECENT_DONE=10 makes only the oldest 4 rank-eligible) are held. Zero evictable is therefore STRUCTURAL, not transient. SECOND-ORDER ROOT CAUSE, already owned, DO NOT DUPLICATE: FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION (ready[], P0, developer) — nothing systematically produces the DONE_VERIFIED token, so successors never drain, so their depends_on keeps naming terminal rows forever, so the guard holds those rows forever, so terminal lanes only grow. That row already lists scripts/orch-cold-evict.sh in its files[]. THIS row is the narrower flow defect: pm's gate has no unclearable branch and no state, so every pm either re-derives this whole investigation or logs 'deferred' — 3 consecutive cycles read as skipped when at least this one was impossible. WHY THIS EVIDENCE IS NOT ON THE P0 ROW WHERE IT BELONGS: that row measures 11732B of prose against a 12000B ceiling, so appending this measurement to it would have crossed the ceiling and hard-rejected pm's entire 7-mint decomposition write. That is a live instance of the exact defect TASK-PROSECEILING-VALUE-SHAPE-MEASURE fixes, observed while working around it. ALSO NOT DONE, DELIBERATELY: pm did not run the live eviction — it would have been a no-op write taken under commit-mutex with ORCH_APPLY_ALLOW_SHRINK set against a live peer, for zero byte reduction."
  }
]

| .task_board.ready |= map(
    if .id == "FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER" then
      . + {
        children: [
          "TASK-SIGINBOX-ORPHAN-ESCALATION-CORE",
          "TASK-SIGINBOX-WRITER-CONTRACT-DOC-POINTER",
          "TASK-SIGINBOX-LIVE-FIRST-RUN-GATE"
        ],
        pm_decomposition_complete: true,
        pm_completed_at: NOW,
        next_agent: "developer",
        updated_at: NOW,
        updated_by: "pm",
        pm_note_20260823: "DECOMPOSED by pm 2026-08-23T10:45Z into 3 children. Epic wrapper — non-dispatchable while children[] is non-empty (is_epic_wrapper). Handoffs: docs/handoffs/TASK-SIGINBOX-{ORPHAN-ESCALATION-CORE,WRITER-CONTRACT-DOC-POINTER,LIVE-FIRST-RUN-GATE}.md — the SUBSTANCE is in those files, not a pointer to the brief, because architect_handoff has zero readers fleet-wide (FIX-ARCHITECTHANDOFF-DEAD-FIELD-ZERO-READERS-STRANDS-EVERY-ARCHITECT-BRIEF). Brief §3's two deferred items were NOT pulled in — they are already minted as FIX-NOTEBOOKAUTOPRUNE-GREPC-DOUBLE-EMIT-WRITES-MALFORMED-SIGNAL-JSON and CLEAN-PRICEANOMALY-SIGNAL-FILES-UNBOUNDED-NO-AGE-CEILING-ANYWHERE. Close this row only after TASK-SIGINBOX-LIVE-FIRST-RUN-GATE passes — it owns this row's verification_gate."
      }
    elif .id == "FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS" then
      . + {
        children: [
          "TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES",
          "TASK-PROSECEILING-VALUE-SHAPE-MEASURE"
        ],
        pm_decomposition_complete: true,
        pm_completed_at: NOW,
        next_agent: "developer",
        updated_at: NOW,
        updated_by: "pm",
        pm_note_20260823: "DECOMPOSED by pm 2026-08-23T10:45Z, brief §3 ONLY, shipped first and alone per §8 step 1. §4 deferred to FOLLOWUP-PROSECEILING-TARGETED-COMPACTION-AND-FROZEN-COHORT-PAYDOWN (backlog[]); §8 step 5 (PO closes the two name-list sibling rows as superseded-by-construction) is carried as AC-9 of the second child's RETURN, not as a row. Handoffs: docs/handoffs/TASK-PROSECEILING-{LIVE-BASELINE-ALL-LANES,VALUE-SHAPE-MEASURE}.md."
      }
    else . end
  )
