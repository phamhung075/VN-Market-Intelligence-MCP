(.task_board.in_progress[] | select(.id=="FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE")) as $row |
.task_board.in_progress |= map(select(.id != "FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE")) |
.task_board.review += [
  ($row + {
    status: "REVIEW",
    updated_at: "2026-07-29T11:36:00Z",
    next_agent: "qa",
    branch: null,
    rebuild_required: false,
    entered_review_at: "2026-07-29T11:36:00Z",
    completed_at: "2026-07-29T11:36:00Z",
    completed_by: "developer",
    files: [
      "scripts/orch-cold-evict.sh",
      "docs/policies/dev-standards.md",
      "docs/agent-memory/decisions/sprint-2026-07-29-developer.md",
      "docs/agent-memory/notebooks/developer.md"
    ],
    developer_review_note: "developer COMPLETE (session 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae, BOUNDED-1 auto-pickup). Root cause matched the row's own diagnosis exactly: D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING (commit ed01c5c1b) flipped orch-validate.mjs Stage-1b checkLaneCoherence() from warn to hard-fail (process.exit(2)); LANE_ALLOWED_STATUSES (orchStateSchema.ts) admits NO terminal status in any of backlog/review/qa/in_progress/ready, so a --exclude-ids-excluded terminal-status row left in place (by design, to skip eviction) is unconditionally lane-incoherent and aborted the ENTIRE eviction run via the script's own SHG-3 pre-rename validate gate. FIX (option (a) of the two offered): scripts/orch-cold-evict.sh build_hot_temp() now relabels an excluded-and-terminal row's .status to a lane-coherent status BEFORE the SHG-3 gate runs -- new EXCLUDE_RELABEL_STATUS env map (default backlog=BLOCKED,review=BLOCKED,qa=QA,in_progress=BLOCKED,ready=READY, mirrors LANE_ALLOWED_STATUSES since qa/ready admit no BLOCKED), stamps verify_note with the original status + relabel timestamp (preserves prior verify_note if any) for traceability. Chose (a) over (b) (teach orch-validate.mjs a bounded exemption list for actively-excluded ids): (b) would touch the shared SSOT validator used by EVERY orch-state.json writer, widening a bypass mechanism's blast radius, and would walk back D5's explicit zero-exceptions hard-fail intent (its own header: 'SHG migration complete, 0 live violations'); (a) stays entirely inside the already-designated sole-SSOT-eviction-script (R-HIGH-1) that already owns --exclude-ids, and leaves checkLaneCoherence()/orchStateSchema.ts completely byte-identical -- verified via a negative-path proof (fresh genuinely-incoherent fixture unrelated to exclusion still orch-validate.mjs exit 2). Adjacent discovery, flagged not fixed (0 live occurrences confirmed via direct query against the real orch-state.json, genuinely out of this row's stated --exclude-ids-only scope): the FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING referential-dependency eviction guard (2026-07-28) can hold back a genuinely-terminal row in the identical non-terminal-lane shape for a DIFFERENT reason (live depends_on reference, not --exclude-ids) -- same latent Stage-1b conflict class, left for PO/architect to triage as a possible follow-up. Evidence: scripts/test/orch-cold-evict-tests.sh 33/41 -> 41/41 (8 pre-existing FAIL now GREEN, 0 regressions, re-ran twice); manual live-shaped fixture proof (excluded DONE row relabeled to BLOCKED, prior verify_note preserved, then re-validated with the real bun scripts/orch-validate.mjs standalone -- exit 0); negative-path proof (genuinely-incoherent unrelated fixture -- bun scripts/orch-validate.mjs exit 2, Stage-1b intact); apps/mcp-server/src/infrastructure/__tests__/orchStateSchema.test.ts 104/104 (zero TS touched, sanity-checked anyway); scripts/agents-flow/dev-team-tick-preflight.test.sh 98/98 including T35's real shell-out to orch-cold-evict.sh --dry-run against the live orch-state.json (unchanged, dry-run never mutates); shellcheck -x scripts/orch-cold-evict.sh clean. docs/policies/dev-standards.md CANONICAL: Orch-state cold eviction block updated with the new relabel behavior + EXCLUDE_RELABEL_STATUS pointer. Decision journal: docs/agent-memory/decisions/sprint-2026-07-29-developer.md STEP developer-S2. scripts/, no apps/mcp-server/src/ touched -> no rebuild needed. Committed directly to main per INV-GATEWAY-1 (this specialist commits explicit paths, no commit-mutex skill invocation -- matches docs/agents/developer/flow/main.md's repeated explicit instruction for this exact spawn shape)."
  })
] |
if (.head.active_task_id // null) == "FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE" then
  .head = {status:"idle", updated_at:"2026-07-29T11:36:00Z", updated_by:"developer", active_task_id:null, next_agent:"router"}
else . end
