# po-s50-factory-recheck-triage.jq
# Triage of 4 agent-father factory-conformance recheck findings into .task_board.backlog[].
# Usage: jq --arg now "<ISO-UTC>" -f scripts/po-s50-factory-recheck-triage.jq orch-state.json > tmp && mv tmp orch-state.json
# PLAN-ONLY: appends backlog entries (TODO/DEFERRED); does NOT touch docs/agents/*/init.md (agent-father commit in flight).
# Flow-doc pointer: docs/agents/po/flow/sprint-kickoff.md (task append shape) + docs/standards/task-schema.md (canonical fields).

.task_board.backlog += [
  {
    "id": "AF-SEMBLE-INIT-DEF",
    "title": "semble-search agent-def structural gap: docs/agents/semble-search/init.md is a pure markdown skill-pointer (no agent: block, no flow pointer). Decide pattern: delete init.md + point .claude/agents/semble-search.md straight at .claude/skills/semble-search/SKILL.md, OR rewrite init.md as a real agent def. agents-architect picks pattern (consistency with other agent bootstraps); agent-father implements.",
    "owner": "agents-architect",
    "status": "TODO",
    "type": "SPIKE",
    "size": "S",
    "priority": "low",
    "zone": "docs/agents/",
    "files": ["docs/agents/semble-search/init.md", ".claude/agents/semble-search.md", ".claude/skills/semble-search/SKILL.md"],
    "note": "Source: agent-father factory-conformance recheck 2026-06-13. Real agent def already exists at .claude/agents/semble-search.md (valid YAML frontmatter, bootstraps to init.md). init.md is the only non-conformant file. Architect decides delete-and-point vs rewrite; output a one-line pattern decision in docs/architecture-briefs/, hand impl subtask to agent-father. PLAN-ONLY until then.",
    "created_at": $now
  },
  {
    "id": "AF-DISAGREEMENT-VERIFY-OVERAGE",
    "title": "docs/agents/refine_bctc_md/flow/disagreement-verify.md is 126L (6L over 120 cap) with no size-justification comment on line 1/2. Trivial: add a <!-- size-justification: ... --> header OR split 6L out. Route agent-father (agent-md-factory SSOT/DRY).",
    "owner": "agent-father",
    "status": "TODO",
    "type": "FIX",
    "size": "XS",
    "priority": "low",
    "zone": "docs/agents/",
    "files": ["docs/agents/refine_bctc_md/flow/disagreement-verify.md"],
    "note": "Source: agent-father factory-conformance recheck 2026-06-13. Confirmed 126L, line 1 = 'agent:' (no justification header). Prefer adding a truthful size-justification comment if all content is load-bearing; otherwise trim. Invoke agent-md-factory skill before editing.",
    "created_at": $now
  },
  {
    "id": "STYLE-SKILL-FRONTMATTER-ALIGN",
    "title": "DEFERRED style drift: 6 SKILL.md lack YAML frontmatter (49/55 have it). Genuine outliers are 3 heading-led (task-lock, dispatch-claim, token-economy start '# Skill:'); the other 3 (signal-dashboard, system-map-query, commit-mutex) start with an intentional <!-- size-justification --> header, NOT a defect. No standard mandates SKILL.md frontmatter. Cosmetic, no functional impact.",
    "owner": "agent-father",
    "status": "DEFERRED",
    "type": "CLEAN",
    "size": "XS",
    "priority": "low",
    "zone": ".claude/skills/",
    "files": [".claude/skills/task-lock/SKILL.md", ".claude/skills/dispatch-claim/SKILL.md", ".claude/skills/token-economy/SKILL.md", ".claude/skills/signal-dashboard/SKILL.md", ".claude/skills/system-map-query/SKILL.md", ".claude/skills/commit-mutex/SKILL.md"],
    "note": "Source: agent-father factory-conformance recheck 2026-06-13. DEFER decision: PO judges this cosmetic. Skills are agent-loaded prose, not Claude-Code subagent defs, so YAML frontmatter is not load-bearing here. If a future agent-md-factory pass mandates frontmatter as a hard standard, fold the 3 heading-led files in then; leave the size-justification-headed files as-is. closed_at when a factory standard formally requires it.",
    "created_at": $now,
    "closed_at": $now
  },
  {
    "id": "NB-AUDITOR-MAIN-SPLIT",
    "title": "system-auditor/flow/main.md (627L) Tier-2/Tier-3 extraction/split sprint — explicitly deferred in-file. Split per agent-md-factory lazy-load/tree-DAG into sub-flow files. dev-team (335L) + fb-market-poster (492L) are size-justified — NO action. Scheduled-later, low urgency (flow is functional today).",
    "owner": "agent-father",
    "status": "DEFERRED",
    "type": "SPRINT-S",
    "size": "M",
    "priority": "low",
    "zone": "docs/agents/",
    "files": ["docs/agents/system-auditor/flow/main.md"],
    "note": "Source: agent-father factory-conformance recheck 2026-06-13. PO DEFER (not now): the flow is correct and functional at 627L; splitting is debt-reduction not a reliability fix. Companion to FU-AUDITOR-FLOW-RESIDUALS / FIX-AUDITOR-* cluster — bundle the split with the next system-auditor flow change to avoid a churn-only commit. Mirrors NB-COWORK-MAIN-SPLIT pattern. Re-prioritize when an auditor-flow sprint is already open.",
    "created_at": $now,
    "closed_at": $now
  }
]
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s50-factory-recheck-triage"
| ._updated_at = $now
| ._updated_by = "po-s50-factory-recheck-triage"
