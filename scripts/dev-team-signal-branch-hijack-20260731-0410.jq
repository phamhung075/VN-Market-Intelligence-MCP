# dev-team-signal-branch-hijack-20260731-0410.jq
# Signal-dashboard append per .claude/skills/signal-dashboard/SKILL.md.
# 4 independent hits TODAY of the same shared-working-directory branch-hijack
# hazard: dev-team's own stray commit, agents-architect's stray commit, the
# tombstone developer originating the branch itself (per its PM handoff's
# `branch:` frontmatter field), and the head-stamp developer hitting a
# transient git stash-pop failure from the same root cause. Dedup-checked:
# zero existing board rows match /branch.?hijack|shared.?working.?dir/i.
# Per project standing policy (recurring 2+ -> escalate, not re-note), this
# needs a real FIX row, not another ad-hoc recovery.

($now) as $now
| .signal_queue.rows = ([{
    id: ("dev-" + ($now | gsub("[-:]"; "") | .[0:15])),
    ts: $now,
    from: "dev-team",
    to: "po",
    type: "bug-escalation",
    summary: "4x today: subagents share dev-team's git checkout (no worktree isolation); a branch checkout (e.g. PM handoff's branch: field) hijacks peer commits. Needs FIX row, not more ad-hoc recovery.",
    severity: "MED",
    status: "NEW",
    payload_ref: null
  }] + .signal_queue.rows)
