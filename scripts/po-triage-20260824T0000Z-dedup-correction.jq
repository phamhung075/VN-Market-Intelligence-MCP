# scripts/po-triage-20260824T0000Z-dedup-correction.jq
#
# SELF-CORRECTION, same PO tick. The sibling script
# po-triage-20260824T0000Z-secondary-drain-and-inbox.jq minted
# FIX-TRIAGE-SIGNALS-PIPELINE-A-UNROUTED-TYPES covering 3 unrouted Pipeline-A
# types. That was a DUPLICATE for 2 of the 3: FIX-TRIAGESIGNALS-PIPELINEA-
# UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS (backlog, P0,
# agent-father, minted 2026-08-23T18:07:39Z) already owns `recurring-bug` and
# `sprint_registry_dangling_ids` and is the row driving the CI red. The dedup
# sweep missed it because the search regex keyed on SIGNAL-TYPE-ROUTING-GAP /
# routing-gap and that id contains neither token.
#
# Only ONE of the 3 types was genuinely uncovered: `system_issue` (underscore),
# from system-auditor, severity CRITICAL. This write is net-zero on task_total:
# the over-broad row is removed and replaced by a row scoped to exactly that
# one type, and the pre-existing P0 row gains a compact pointer to it.

($now) as $NOW
| .task_board.backlog |= map(
    if .id == "FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS" then
      . + { third_unrouted_type_20260824: "po 2026-08-24 measured a THIRD unrouted Pipeline-A type this file also needs and this row does not cover: `system_issue` UNDERSCORE (1 envelope, from system-auditor, severity CRITICAL, envelope 31b7f837, held back from the inbox CLEAR alongside your 3). Only the HYPHEN form `system-issue` has a routing row (triage-signals.md:39); the underscore form appears ONLY inside the `**CORRECTION` stats table at line 72, which guard-signal-type-coverage.sh's pipeline_b_section() parser deliberately SKIPS, so it is not routed. Tracked separately as FIX-TRIAGESIGNALS-SYSTEMISSUE-UNDERSCORE-FORM-UNROUTED (P1, agent-father, same file) because that one needs a real emitter-vs-alias decision, not the mechanical table append this row scopes. Land all of them in the same agent-father hop; CI cannot go honestly green while any of the 4 envelopes is still unrouted.",
            updated_at: $NOW,
            updated_by: "po" }
    else . end)
| .task_board.backlog |= map(select(.id != "FIX-TRIAGE-SIGNALS-PIPELINE-A-UNROUTED-TYPES"))
| .task_board.backlog += [
  {
    id: "FIX-TRIAGESIGNALS-SYSTEMISSUE-UNDERSCORE-FORM-UNROUTED",
    type: "FIX",
    status: "BACKLOG",
    priority: "P1",
    size: "S",
    zone: "cross-service/",
    owner: "agent-father",
    next_agent: "agent-father",
    created_at: $NOW,
    created_by: "po (Step 0-SIG triage 2026-08-24)",
    updated_at: $NOW,
    dedup_key: "signal-type-registry-gap:system_issue",
    origin_signal_id: "31b7f83755deef7894c2eb1a191d9bd3ad56bf47620d7c03061b78e10fa92079",
    title: "Pipeline-A has no routing row for the UNDERSCORE form `system_issue` — system-auditor emits it, only the hyphen form `system-issue` is routed, and the one place the underscore appears in the doc is a stats table the guard parser deliberately skips",
    desc: "MEASURED BY PO 2026-08-24 by hand-replaying guard-signal-type-coverage.sh's own read-only Pipeline-A extractors (pipeline_a_section + extract_type_column) against the live doc. The guard script itself was deliberately NOT executed — it is not read-only (it mints backlog rows through ORCH_APPLY_LIVE_FILE_OVERRIDE) and its `--check` flag is an accepted-and-ignored no-op alias, not a dry-run (separately tracked as FIX-GUARD-SIGNAL-TYPE-COVERAGE-CHECK-FLAG-MISLEADING-NOT-DRYRUN). Live inbox = 36 envelopes / 13 distinct types; ROUTED_A = 28 types; 3 types unrouted. Two of them (`recurring-bug`, `sprint_registry_dangling_ids`) are already owned by FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS (backlog, P0, agent-father) — this row exists ONLY for the third. `grep -n system_issue docs/agents/po/flow/triage-signals.md` returns exactly 3 hits: line 66 (cold-archive cross-check prose), line 68 (a CORRECTION paragraph), and line 72 — a stats-table data row `| \\`system_issue\\` (underscore) | 20 | 86 | 6 | 112 |`. Line 72 sits inside the `**CORRECTION ... **Dedup discipline` block that pipeline_b_section() skips BY CONSTRUCTION, with an in-file comment naming this exact false-pass risk: 'without this exclusion its backtick-first-column data rows would be mistaken for routing rules and falsely mark `system_issue` (underscore) routed when no such rule actually exists'. So the underscore form has zero routing coverage on either pipeline, and the live envelope carrying it is severity CRITICAL from system-auditor (auditor blind-spot: cannot detect launchd failures). Its envelope 31b7f837 is HELD in .dev_team_idle_chain.pending_triage_inbox[] and was deliberately not cleared.",
    generic_mandate: "Decide deliberately between (a) an alias routing row next to the existing `system-issue` row, and (b) fixing the system-auditor emitter to send the hyphen form. (a) is cheaper but leaves two spellings live forever and every future emitter has to guess; (b) is the real convergence but touches an agent flow. Justify the choice in-file. Do NOT satisfy this row by editing the CORRECTION stats table at line 72 — the guard skips that block by construction, so a change there is invisible to the guard AND to PO.",
    ac: [
      "AC-1 `system_issue` (underscore) is resolved by an explicit alias routing row OR an emitter fix, and the choice is justified in-file against the two options above.",
      "AC-2 Verify by hand-replaying the guard's own read-only extractors and showing the type now resolves. NEVER verify by the guard's exit code in either direction: green can mean the envelope was cleared rather than routed, red can mean unrelated drift.",
      "AC-3 Envelope 31b7f837 must still be present in .dev_team_idle_chain.pending_triage_inbox[] when this row is worked — it is held on purpose. Clearing it is not a fix.",
      "AC-4 If the alias route is chosen, add a one-line note next to the existing `system-issue` row recording that two spellings are live and why, so the next reader does not re-derive this."
    ],
    files: ["docs/agents/po/flow/triage-signals.md"],
    reference_only_files: ["scripts/audits/guard-signal-type-coverage.sh", "docs/agents/system-auditor/"],
    not_duplicate_of: "FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS (backlog, P0, agent-father) covers `recurring-bug` + `sprint_registry_dangling_ids` and does not mention `system_issue` in any form — resolved live before this row was minted. FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED (backlog, P1, agent-father) is the prose-frozen 17-day umbrella for this same file (its inline prose is past ORCH_ROW_PROSE_CEILING_BYTES, so it cannot absorb this evidence). FIX-SIGNALTYPE-OPEN-NAMESPACE-VS-CLOSED-ALLOWLIST-5TH-INSTANCE owns the structural namespace question and must not absorb this tactical row. Same file and same owner as the P0 row above — land them in ONE agent-father hop.",
    verification_gate: "qa sign-off against AC-1..AC-4.",
    baseline_pass: true
  }
]
| .task_board.last_triaged_at = $NOW
| .task_board.last_triaged_by = "po (dedup self-correction)"
| ._updated_at = $NOW
| ._updated_by = "po"
