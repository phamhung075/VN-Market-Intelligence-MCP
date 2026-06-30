# factory-audit-brief-gen.jq — transform the maintainability factory-audit workflow result
# (wl2ia1tk8.output, shape {agentCount,logs,result,summary}) into a durable brief markdown.
# File→file: keeps the ~430KB result out of router context.
# Usage: jq -r -f scripts/factory-audit-brief-gen.jq <audit.output> > docs/architecture-briefs/<date>-maintainability-factory-audit.md
# Pointer: docs/policies/dev-standards.md § Script Persistence.
.result as $r
| ($r.plan) as $p
| [
  "<!-- size-justification: generated audit-backlog artifact (94 tasks + 117 findings) — data, not hand-maintained source; regenerate via scripts/factory-audit-brief-gen.jq from the workflow .output. 120L code cap N/A. -->",
  "# Maintainability Factory Audit — 2026-06-15",
  "",
  "> Read-only audit of the codebase against **its own** factory/maintainability standards (120-LOC split + size-justification headers, DDD layering / Go Factory-v2 three-tier, no-hardcode real-metric, dedup→`packages/shared-*`, dead-code, complexity, naming, tests). **No code was modified.**",
  ">",
  "> Source: Workflow run `wf_56fbf1b2-b68` (task `wl2ia1tk8`) — 33 agents, \($r.zones_audited)/\($r.zones_total) zones audited → \($r.confirmed_count) adversarially-verified findings → \($p.backlog|length)-task zone-routed backlog. Each finding passed a verify pass (real? behavior-preserving? generic across all entities per /goal#2? does not erase a real served metric?).",
  "",
  "## Executive Summary",
  "",
  ($p.executive_summary // "(none)"),
  "",
  "## Health by Zone",
  "",
  "| Zone | Grade | Headline |",
  "|---|---|---|",
  ($p.health_by_zone[]? | "| `\(.zone)` | **\(.grade)** | \(.headline) |"),
  "",
  "## Cross-Cutting Themes (\($p.themes|length))",
  "",
  ($p.themes[]? | "### \(.theme)\n\n**Zones:** \(.zones|join(", "))\n\n\(.rationale)\n"),
  "## CI Guardrails — stop the debt returning (\($p.ci_guardrails|length))",
  "",
  ($p.ci_guardrails[]? | "- \(.)"),
  "",
  "## Refactor Backlog (\($p.backlog|length) tasks)",
  "",
  "Priority counts: " + ([$p.backlog[].priority] | group_by(.) | map("\(.[0] // "P?")×\(length)") | join(" · ")),
  "",
  ( $p.backlog
    | sort_by(.priority // "P9", .zone // "")
    | group_by(.priority // "P?")[]
    | ("### \(.[0].priority // "P?") — \(length) task(s)\n"),
      ( .[]
        | "- **`\(.task_id)`** — \(.title)\n"
          + "  - zone `\(.zone)` · agent **\(.dev_agent)** · effort \(.effort) · risk \(.risk) · rebuild \(.rebuild_required)\n"
          + "  - files: \((.files // []) | join(", "))\n"
          + "  - approach: \(.approach)\n"
          + "  - DoD: \(.dod)\n"
          + (if ((.depends_on // []) | length) > 0 then "  - depends_on: \((.depends_on)|join(", "))" else "  - depends_on: —" end)
      )
  ),
  "",
  "## Suggested Sprint Sequence",
  "",
  "> Advisory only — PO is the single board writer and re-sequences against WIP≤2 and the live BCTC P0 sprint.",
  "",
  ($p.sprint_sequence[]? | "- **Wave \(.wave):** \(.why)\n  - tasks: \((.task_ids // [])|join(", "))")
] | .[]
