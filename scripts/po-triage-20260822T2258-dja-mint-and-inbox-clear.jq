# po-triage-20260822T2258-dja-mint-and-inbox-clear.jq
#
# Owner flow: docs/agents/po/flow/triage-signals.md § Step 0-SIG (Durable-inbox CLEAR block)
#             + docs/agents/po/flow/main.md (§ Reusable triage scripts).
# Invocation (MUST declare the consumed envelope ids to the conservation check):
#   IDS=$(jq -c '[.dev_team_idle_chain.pending_triage_inbox[].envelope_id]' docs/data/orch/orch-state.json)
#   CSV=$(echo "$IDS" | jq -r 'join(",")')
#   jq --argjson ids "$IDS" -f scripts/po-triage-20260822T2258-dja-mint-and-inbox-clear.jq \
#      docs/data/orch/orch-state.json \
#      | ORCH_APPLY_DECLARED_INBOX_TRIAGED="$CSV" bash scripts/orch-apply.sh
#
# Second (and final) write of the dev-team tick 2026-08-22T22:37Z Step 1 PO Triage.
# THREE mutations, one atomic write:
#   1. STAMP priority=P1 on FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS
#      (promoted to ready[] by the sibling script with priority=null — a ready row with no priority
#      is invisible to severity-ordered dispatch, which would re-strand it exactly as before).
#   2. MINT CLEAN-DJA-SPRINT-PREFIXED-DATE-JOURNALS-257-UNRESOLVABLE-IDS into backlog[].
#   3. CLEAR .dev_team_idle_chain.pending_triage_inbox[] — subtract BY envelope_id (never a blind
#      `= []`), defensive against an entry landing between the read and this write.
#
# All 38 envelopes read at the top of Step 0-SIG were routed before this CLEAR runs. Duplicate-safe,
# not loss-safe by design: if this write never lands, the same ids are re-delivered next invocation
# and the per-signal dedup guards absorb the repeat.

def NOW: "2026-08-22T23:05:00Z";

def DJA_ROW:
  {
    id: "CLEAN-DJA-SPRINT-PREFIXED-DATE-JOURNALS-257-UNRESOLVABLE-IDS",
    type: "CLEAN",
    title: "decision-journal-archive derives a sprint id from every `sprint-*.md` filename, but 257 of the 646 files are date-named daily journals (sprint-2026-06-05.md -> id `2026-06-05`) that never referenced an orch sprint — so its AC-4 unresolved-id signal is a permanently-refiring mass false positive",
    desc: "scripts/agents-flow/decision-journal-archive.sh scans `find $DECISIONS_DIR -name 'sprint-*.md'` and derives each file's sprint id from the filename stem, then classifies any id with no active_sprints[]/closed_sprints[] object as `no_orch_record` and emits a `sprint_registry_unresolved_journal_ids` signal to PO (script L363-397). LIVE COUNTS at triage time: 646 files match `sprint-*.md` in docs/agent-memory/decisions/, and the signal reports 257 unresolved. The first ids in the payload are `2026-06-05`, `2026-06-06`, `2026-06-08-po`, `2026-06-10-dev-mcp-server`, `2026-06-11-dev-mcp-server`, `2026-06-12-pm` — i.e. `sprint-<DATE>[-<agent>].md`, a legacy DATED-DAILY-JOURNAL naming convention that shares the `sprint-` filename prefix but was never a sprint id and can never resolve to one. The derivation has no discriminator between the two populations, so this signal re-fires forever. Its own dedup is a sha256 of the unresolved-id SET, so adding any one new dated journal changes the hash and re-emits the whole 257-id payload.",
    priority: "P2",
    size: "S",
    zone: "scripts/agents-flow/",
    owner: "po",
    next_agent: "developer",
    status: "BACKLOG",
    files: ["scripts/agents-flow/decision-journal-archive.sh"],
    created_at: NOW,
    created_by: "po/triage-20260822T2258Z",
    dedup_key: "sprint_registry_unresolved_journal_ids:decision-journal-archive.sh:id-derivation",
    dedup_checked: "backlog+ready+in_progress+review+qa scanned for JOURNAL-ARCHIVE|DJA|DECISION-JOURNAL and title-match on `decision-journal-archive`. Four open siblings found, ALL disjoint from this defect: FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR (backlog — fires on sprint-close not on the byte cap), CLEAN-CTXBLOAT-DECISION-JOURNAL-COWORK-QA24-BYTECAP (backlog — one specific over-cap file), FIX-DECISION-JOURNAL-RESOLVE-PATH-IGNORES-ROLLFORWARD-CHAIN (ready — the SKILL's Resolve Path, not the archiver), FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD (review — the `--all` flag's blast radius). The nearest match, FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE, is DONE_VERIFIED as of 2026-08-22T22:01Z UTC and covered the ORCH-STATE side (its title: `34 of 40 sprint ids referenced by task rows / sprint_goal have NO active_sprints[]/closed_sprints[] object`) — a 40-id registry population. This row is the ARCHIVER-FILENAME side, a disjoint 257-file population, and is NOT closed by that fix.",
    acceptance: "AC-1 decision-journal-archive.sh distinguishes a real sprint-scoped journal from a dated daily journal before classifying anything as `no_orch_record` — e.g. only treat a stem as a sprint id when it does NOT match a leading `YYYY-MM-DD` date pattern, or gate on the file's own front-matter/first-heading rather than its filename. AC-2 a live `--dry-run` (or whatever the script's non-mutating mode is) reports no_orch_record dropping from 257 to the count of GENUINELY dangling sprint-scoped journals, and that residual number is stated in the task report — do not accept `0` without checking whether real danglers were masked by the fix. AC-3 no `sprint_registry_unresolved_journal_ids` signal is emitted on a subsequent clean run. AC-4 no journal file is moved, renamed or deleted by this change: the defect is in CLASSIFICATION and SIGNALLING only, and the archiver's own `--all` blast radius is separately tracked under FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD (review[]) — do not touch that path here.",
    non_goals: "Not a mass rename of the 257 legacy dated journals (a 257-file git-mv is a far larger blast radius than the signalling defect warrants, and would collide with FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD). Not a change to what the archiver ARCHIVES — only to what it classifies as unresolved and signals on.",
    origin_signal_id: "ed989b3ddd4a98f79b345bbff0210b8e0c4940ed42322d5e6e4ea486ca1908c1",
    status_note: "[po/triage 2026-08-22T22:58:36Z] MINTED from one `sprint_registry_unresolved_journal_ids` envelope (from=decision-journal-archive, to=po, priority=medium, createdAt 2026-08-22T21:31:02Z, unresolved_count=257). No Pipeline-A table row exists for this type, so it was routed via triage-signals.md's ROUTE-BY-`to` fallback with its mandatory dedup guard run first. TIMING CHECKED BEFORE MINTING, because it looked like a possible pre-fix artifact: the signal fired at 21:31:02Z and FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE was signed off ~30 minutes LATER (QA commits 9f23bbc3c/216a42be8, 2026-08-22T22:01-22:02Z UTC) — so a stale-signal reading was genuinely available. REJECTED after reading the emitter's actual code (scripts/agents-flow/decision-journal-archive.sh L363-397) and the live filesystem rather than inferring from the timeline: the two populations are disjoint (40-id orch registry vs 646 on-disk `sprint-*.md` files) and the 257 unresolved ids are dated-daily-journal stems the DONE_VERIFIED fix does not touch, so the condition still reproduces post-fix. Priority kept at P2 and deliberately NOT promoted to ready[] or included in this tick's BATCH: the defect wastes triage attention and re-fires indefinitely, but it destroys no data and blocks no actuator, unlike the three P0/P1 rows this tick did promote."
  };

.
| .task_board.ready = (
    .task_board.ready
    | map(
        if .id == "FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS"
        then .priority = "P1" | .updated_at = NOW | .updated_by = "po/triage-20260822T2258Z"
        else . end
      )
  )
| .task_board.backlog = ([DJA_ROW] + .task_board.backlog)
| .task_board._updated_at = NOW
| .task_board._updated_by = "po"
| .dev_team_idle_chain.pending_triage_inbox |=
    map(select(.envelope_id as $i | ($ids | index($i)) | not))
| .dev_team_idle_chain._updated_at = NOW
| .dev_team_idle_chain._updated_by = "po"
