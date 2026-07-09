# scripts/agents-architect-closegate-step4-fanout.jq
#
# UNBLOCK-CLOSEGATE-STEP4-HEAD-SYNC closeout (agents-architect, recurring-bug-escalation
# tier — architecture brief docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md).
#
# One-off task-specific script (embeds real content, per the router-d1-claim.jq /
# po-s*.jq precedent — NOT a generalized reusable helper like devteam-backlog-claim-bounded1.jq).
#
# Does TWO things atomically in the SAME orch-apply.sh candidate:
#   1. Flips backlog row UNBLOCK-CLOSEGATE-STEP4-HEAD-SYNC TODO -> DONE with a resolution note.
#   2. Mints 2 new PO-triage FIX backlog rows (fanout) per the brief's §2 fix design.
#
# .head is DELIBERATELY untouched — .head.active_task_id currently points at
# FACTORY-MACRO-split-repositories (a different, in-flight task), not this UNBLOCK row.
#
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" \
#   -f scripts/agents-architect-closegate-step4-fanout.jq docs/data/orch/orch-state.json \
#   | bash scripts/orch-apply.sh

(.task_board.backlog | map(select(type=="object" and .id=="UNBLOCK-CLOSEGATE-STEP4-HEAD-SYNC"))[0]) as $t
| if $t == null then error("UNBLOCK-CLOSEGATE-STEP4-HEAD-SYNC not in backlog[] -- refuse to close") else . end
| .task_board.backlog |= (
    map(select(type != "object" or .id != "UNBLOCK-CLOSEGATE-STEP4-HEAD-SYNC"))
    + [
        ($t + {
          status: "DONE",
          done_at: $now,
          done_by: "agents-architect",
          resolution_note: (
            "Architecture brief docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md: "
            + "root cause = ops Close Gate Step-4->qa handoff is the only task-board transition point "
            + "with no checked-in atomic .head+board jq helper (ops hand-rolls a fresh inline jq "
            + "one-liner every time, touching only task_board.<lane>[], never .head); same "
            + "missing-procedure gap explains the uncommitted-artifacts + one-off-journal-filename "
            + "defects too. Fanout minted this cycle for PO triage: "
            + "FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT, FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE. "
            + "Signal docs/signals/closegate-step4-atomic-handoff-20260709T072508Z.json -> agent-father. "
            + "Commits: db81f40a7 (brief+notebook), 5b326844c (decision journal)."
          )
        })
      ]
  )
| .task_board.backlog += [
    {
      id: "FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT",
      type: "FIX",
      title: "Mint scripts/ops-closegate-handoff.jq (atomic .head+board write) + wire it into docs/protocols/docker-deployment-runbook.md § Close Gate as the new Step 4b",
      owner: "po",
      status: "BACKLOG",
      priority: "high",
      size: "S",
      zone: "cross-service/",
      recurring: true,
      created_at: $now,
      created_by: "agents-architect",
      architecture_brief: "docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md",
      note: (
        "Brief §2.1: generalized, parameterized scripts/ops-closegate-handoff.jq mirroring "
        + "scripts/devteam-backlog-claim-bounded1.jq / scripts/router-d1-claim.jq precedent — "
        + "inputs --arg task_id/from_lane/next_agent/now; forwards the board row's next_agent "
        + "in the SAME jq expression as a CONDITIONAL .head sync "
        + "(if .head.active_task_id == $task_id then .head.next_agent/.updated_at/.updated_by "
        + "sync else . end — never an unconditional .head overwrite, .head can legitimately "
        + "point at a different in-flight task while ops closes this one). No hardcoded "
        + "task-id/lane literals (grep-verifiable). Runbook § Close Gate table gets the "
        + "currently-missing 'Step 4b: forward to qa via the script' row — replaces every "
        + "future ad hoc terminal jq one-liner. Suggested owner split: scripts/ authoring "
        + "(developer or ops) vs. docs/protocols/docker-deployment-runbook.md edit "
        + "(agent-father zone per .claude/skills/commit-boundary/SKILL.md) — PO's call whether "
        + "to keep as one task or split. DoD in brief §5 items 1-2."
      )
    },
    {
      id: "FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE",
      type: "FIX",
      title: "Codify ops Close Gate step-ends-only-on-commit invariant + STEP ops-Sn decision-journal filename enforcement; fold 3 existing one-off-filename offenders",
      owner: "po",
      status: "BACKLOG",
      priority: "high",
      size: "S",
      zone: "cross-service/",
      recurring: true,
      created_at: $now,
      created_by: "agents-architect",
      architecture_brief: "docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md",
      note: (
        "Brief §2.2+§2.3: (a) ops's Step 4/4b is not complete until ITS OWN commit lands "
        + "(notebook + sprint-<sprint_id>-ops.md journal + orch-state.json diff, explicit-path "
        + "git add/commit/show-verify — modeled on agents-architect's own Brief-Commit Invariant); "
        + "Step-4 RETURN block must carry the resulting commit SHA, a report without one is "
        + "INCOMPLETE (router/PO committing ops's artifacts is a defect to report, not a recovery "
        + "path — happened twice already, commits f4afa0e03/b907a8ea6). Add an ops row to "
        + ".claude/skills/commit-boundary/SKILL.md's per-agent zone table scoped to exactly "
        + "those 3 paths. (b) enforce the decision-journal skill's own SPRINT_ID resolution / "
        + "STEP ops-Sn append pattern for the Close Gate journal entry — a one-off dated "
        + "filename is never correct. Fold these 3 existing offenders into "
        + "sprint-SYSTEMIC-REMAKE-P1-ops.md's STEP ops-Sn sequence (content is legitimate, "
        + "just filed under the wrong name — migrate, do not delete): "
        + "docs/agent-memory/decisions/2026-07-08-FACTORY-INTERFACE-FINALIZEBCTC-OPS-CLOSE-GATE.md, "
        + "docs/agent-memory/decisions/2026-07-08-FACTORY-DOMAIN-EXTRACT-BCTC-PARSING-LIB-OPS-CLOSE-GATE.md, "
        + "docs/agent-memory/decisions/2026-07-09-FACTORY-FRONTEND-SPLIT-DASHBOARD-OPS-CLOSE-GATE.md. "
        + "Owner: agent-father (docs/protocols/ + docs/agents/ops/flow/ + "
        + ".claude/skills/commit-boundary/SKILL.md all fall in its declared zone). "
        + "DoD in brief §5 items 3-4."
      )
    }
  ]
| ._updated_at = $now
| ._updated_by = "agents-architect"
