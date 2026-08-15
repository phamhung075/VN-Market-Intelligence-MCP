# Task: UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP
# QA Direct-Commit Verify (dev-team Review-Lane QA-Drain, qa[] row, branch:null).
# Moves the row qa[] -> done_verified[] in the SAME orch-apply.sh write
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE), appends [QA] Review Record to the row's
# own status_note field (row had none -- only note/agent_father_implementation_note),
# attaches verification.raw_probe.
#
# Commit f1eb75143 confirmed real, on main ancestry; git show --stat matches
# exactly docs/agents/cowork-team/flow/spawn-fanout.md (single file,
# +20/-79), matching agent_father_implementation_note's ~78L trim claim.
# .head not touched -- review-lane QA-drain is head-decoupled
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE(b)); dispatcher (dev-team) owns .head
# for this batch.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-verify-uc-cca-p3-fr3-spawn-fanout-cleanup-doneverified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
def id: "UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP";
def code_commit: "f1eb75143";
($ARGS.named.now) as $now |
def qa_note:
  " | [QA] Review Record (direct-commit verify): APPROVED, DONE_VERIFIED. Commit " +
  code_commit + " (full f1eb75143a0db1c9b2ce7fdea7df2ba088bad847) confirmed real, on main " +
  "ancestry (git merge-base --is-ancestor); git show --stat touches exactly " +
  "docs/agents/cowork-team/flow/spawn-fanout.md (1 file, +20/-79), matching the " +
  "agent_father_implementation_note's ~78L FR-P2-7 block trim claim. Row's own grep-verify " +
  "instruction independently re-run (not trusted from note prose): task_id=\"published:\" " +
  "literal (old code block's key structure) = 0 hits, fully removed. task_claim string = 4 " +
  "hits total, none functional: 2 are this task's own new comment prose describing what was " +
  "removed, 2 (L233/236) are a pre-existing, diff-untouched Step 4.6 per-work-item-token " +
  "cross-reference (slot-claim.md) unrelated to the FR-P2-7 published-marker block. Functional " +
  "skill-pointer count = exactly 1 (.claude/skills/published-marker-gate/SKILL.md at the new " +
  "'Published marker gate:' line); a 2nd mention is inside the size-justification header's own " +
  "historical delta commentary, not a 2nd agent-facing instruction. Cross-checked against " +
  "handoff QA Gate (docs/handoffs/UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP.md) + architecture brief " +
  "2026-08-08-uc-cca-p3-published-marker-gate-skill.md sec4: replacement prose (5L, keeps " +
  "heading + \"publisher owns the marker\" + ops-runbook cross-ref carried over from the old " +
  "block) diverges from the brief's literal proposed 1-line string but preserves the exact " +
  "invariant named (\"dispatcher does NOT call publish markers, the spawned agent does\") and " +
  "adds no new claim -- accepted as implementation latitude on a cosmetic/doc-debt task (handoff " +
  "Notes: \"cosmetic/doc-debt cleanup, not a functional requirement\"), not a blocking deviation. " +
  "No orphaned references: grepped removed-block identifiers (PUBLISHED_KEY/MARKER_CLAIM/" +
  "publish_claim/WORK_DATE/100800/691200) -- 0 hits elsewhere in file. External cross-file " +
  "pointers (digest-predict/main.md, chef.md, tran-ngoc-bau/main.md sec Published marker gate " +
  "(FR-P2-7)) still resolve -- heading text survived the trim. Size-justification header gained " +
  "its own dated delta note (established per-file convention). Zero production/test code touched " +
  "(pure flow-doc, 1 .md file) -> bun test/tsc/mock-guard N/A, same precedent as sibling FR3 gate " +
  "rows. process.env/secret/password/token greps clean (only pre-existing unrelated \"per-work-" +
  "item token\" domain-term hits). Dependency UC-CCA-P3-FR1-FR2-SKILL confirmed DONE_VERIFIED on " +
  "board. Zero blocking ISSUE. DJ: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-24.md STEP qa-S21.";
(.task_board.qa[] | select(.id == id)) as $row |
(if $row == null then error(id + " not found in task_board.qa[] -- refuse")
 elif ($row.status != "QA") then error(id + " status != QA (got " + ($row.status // "null") + ") -- refuse")
 else $row end) as $row |
($row
  + {
      status: "DONE_VERIFIED",
      updated_at: $now,
      updated_by: "qa",
      status_note: (($row.status_note // "") + qa_note),
      next_agent: "pm",
      qa_verified_at: $now,
      qa_verified_by: "qa",
      verification: {
        raw_probe: {
          tool: "git merge-base --is-ancestor + git show --stat + grep (task_claim / task_id=\"published:\" literals / skill pointer / orphaned identifiers)",
          args: "commit f1eb75143 -- docs/agents/cowork-team/flow/spawn-fanout.md; grep -n task_claim; grep -n 'task_id.*published:'; grep -n published-marker-gate/SKILL.md; grep -n PUBLISHED_KEY|MARKER_CLAIM|publish_claim|WORK_DATE|100800|691200",
          live_value_observed: "git show --stat: 1 file changed, 20 insertions(+), 79 deletions(-) (spawn-fanout.md only, on main ancestry); task_id=\"published:\" literal: 0 hits; task_claim string: 4 hits, all non-functional (2 comment prose re this task, 2 pre-existing unrelated Step 4.6 cross-ref); functional skill-pointer count: 1; orphaned removed-block identifiers: 0 hits; process.env/secret/password/token: 0 blocking hits",
          observed_at: $now,
          evidence_commit: code_commit
        }
      }
    }
) as $updated |
.task_board.qa |= map(select(.id != id)) |
.task_board.done_verified += [$updated]
