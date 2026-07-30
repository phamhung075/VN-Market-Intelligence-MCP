# dev-team-mint-po-batch-20260730-2227.jq
# Applies the BATCH returned by po's 5th triage pass today (background agent a99a54a9bfd6d1dbb,
# journal docs/agent-memory/decisions/triage-20260730T2227Z-po.md). po deliberately did NOT write
# orch-state.json itself this tick (.head was held by an in-flight developer dispatch and must not
# be disturbed) -- dev-team performs the write on its behalf, per main.md Step 1/2 contract.
#
# Two MINTs only. The BATCH's 2 UNBLOCK entries (FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL,
# FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR) are EXISTING rows -- dispatched separately via the
# S4 UNBLOCK claim/spawn/release pattern (main.md:887-908), no board mutation needed for those.
#
#   (1) MINT FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH into backlog[] (P0, architect,
#       cross-service/), THEN immediately move backlog[] -> in_progress[] + point .head at it --
#       .head is idle now (developer's prior P0 closed out this same tick), and po explicitly
#       routed this FIX type for direct Step-3 dispatch (skip planning). This is this tick's
#       Step-3 dispatch, mirroring the historical dev-team-mint-po-batch-20260729-1231.jq pattern.
#   (2) MINT CLEAN-NOTEBOOK-AC2A-CYCLE-BOUNDARY-DEFINITION into backlog[] only (P2, agent-father,
#       cross-service/) -- po filed this deliberately non-urgent (warn-only, zero data loss); no
#       immediate dispatch, left for natural BOUNDED-1/SLS pickup or a future PO/router dispatch.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-mint-po-batch-20260730-2227.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/po-batch-20260730T2227Z" as $src
| ( [ .task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified,.qa)[]? | .id? ] ) as $existing

# ── (1) MINT FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH ─────────────
| "FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH" as $id1
| if ($existing | any(. == $id1)) then .
  else
    .task_board.backlog = ([ {
      id: $id1,
      type: "FIX",
      title: "P0: 49 backlog rows (23 P1) + 3 ready[] rows are reachable ONLY by 'manual/PO dispatch' -- and no PO flow doc contains any step that produces it",
      status: "BACKLOG",
      priority: "P0",
      size: "S",
      zone: "cross-service/",
      owner: "po",
      next_agent: "architect",
      supervised: false,
      plan_only: false,
      created_at: $now,
      created_by: $src,
      updated_at: $now,
      source: "po triage 2026-07-30T22:27Z tick (5th pass today)",
      desc: "dev-team/flow/main.md:645 and scripts/audits/bounded1-supervised-lane-report.sh:373 both state DRS-STRANDED-OFF-ALLOWLIST rows remain 'reachable only by manual/PO dispatch'. Grep-verified by po AND independently re-verified by dev-team this tick: every `.task_board.backlog|.task_board.ready` reference in docs/agents/po/flow/ is an APPEND site (mint a new row) or a one-off id-targeted script -- never a generic priority-ordered SWEEP of the existing backlog/ready lanes. The named destination does not exist. Measured live by po: 49 backlog rows zero-picker-by-policy (agent-father 37, ops 4, qa 3, bctc-analyst 2, ops-mainserver-fetch 2, ops-vps-fetch 1; 23 at P1) plus 3 ready[] rows in the sup-XOR-plan_only gap. FOURTH instance of documented-consumer-with-no-producer; the remedy shape is already proven and shipped for the WF-2 sibling: a MANDATORY per-tick PO pre-check sub-flow (docs/agents/po/flow/supervised-goahead.md + a lazy-load pointer in po/flow/main.md + a read-only regression verifier under scripts/audits/). Zero code, zero gate change, zero blast radius -- it only surfaces and dispatches rows the policy already assigns to PO.",
      files: ["docs/agents/po/flow/main.md", "docs/agents/po/flow/*.md", "scripts/audits/"],
      deliverable: "AC: (1) new po/flow sub-flow that runs the two live predicates (49-backlog zero-picker set, 3-ready sup-XOR-plan_only gap) and emits a priority-ordered candidate list; (2) mandatory pointer in po/flow/main.md pre-check chain; (3) regression verifier that replays dev-team's OWN predicates (scripts/lib/devteam-eligibility.jq) byte-identical, never a reimplementation.",
      out_of_scope: "Widening the DRS allowlist to admit agent-father -- that exclusion is a ratified blast-radius control, not this row's fix.",
      baseline_pass: "9408",
      related: ["FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL", "FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE"]
    } ] + .task_board.backlog)
  end

# ── (2) MINT CLEAN-NOTEBOOK-AC2A-CYCLE-BOUNDARY-DEFINITION ───────────────────
| "CLEAN-NOTEBOOK-AC2A-CYCLE-BOUNDARY-DEFINITION" as $id2
| if ($existing | any(. == $id2)) then .
  else
    .task_board.backlog = ([ {
      id: $id2,
      type: "CLEAN",
      title: "AC-2a never defines 'cycle'; its only enforcement defines it as the git-commit boundary -- 5 WARNs today across 3 notebooks",
      status: "BACKLOG",
      priority: "P2",
      size: "XS",
      zone: "cross-service/",
      owner: "po",
      next_agent: "agent-father",
      supervised: false,
      plan_only: false,
      created_at: $now,
      created_by: $src,
      updated_at: $now,
      source: "po triage 2026-07-30T22:27Z tick (5th pass today) -- po's direct answer to dev-team's question, verified at source on both planes",
      desc: "SPEC: .claude/skills/notebook-write/SKILL.md:64-78 authorizes 'trimming the CURRENT cycle's OWN new section' and speaks of 'the brand-new current-cycle section' -- the word 'cycle' is never defined anywhere in the file. ACTUATOR: scripts/git-hooks/pre-commit:329-421 compares `git show HEAD:$f` against `git show :$f` per dated heading, so the operative boundary IS the commit boundary. Agents are not misreading a clear rule; they are reading an undefined term the enforcement silently resolves the other way. SECOND DEFECT: the WARN payload's own remediation ('DROP the whole section ... add a NEW marker section instead') is correct for cap-pressure but WRONG for today's dominant case -- it instructs an agent continuing one tick across two commits to destroy its own live section; correct advice there is 'open a NEW dated section for the second commit'. EVIDENCE it is fleet-wide: 5 fires on 2026-07-30 across 3 notebooks -- system-auditor.md sec-c006 at 02:34Z and 07:12Z, developer.md at 03:33Z, main.md at 11:39Z (2 headings) and 22:10Z. Filed P2 deliberately: warn-only, non-blocking, zero data loss, no fix to this wording has ever been attempted (does not clear the recurring-bug/failed-fix bar).",
      files: [".claude/skills/notebook-write/SKILL.md", "scripts/git-hooks/pre-commit"],
      deliverable: "AC: (1) one sentence in AC-2a defining cycle boundary = git-commit boundary, matching the hook; (2) hook WARN text gains the continue-the-tick remedy branch (open a NEW dated section for a second same-tick commit, do not destroy the first).",
      not_duplicate_of: "FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS (review[], P1) -- that row owns 'compose rewrites OLDER sections to pay for an over-cap new section', a different failure.",
      baseline_pass: "9408"
    } ] + .task_board.backlog)
  end

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
