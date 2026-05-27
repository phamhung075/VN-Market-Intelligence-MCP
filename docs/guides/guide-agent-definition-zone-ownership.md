> Parent: [guide-agent-definition.md](./guide-agent-definition.md)

# Document Zone & Registry

---

## Document Zone — Ownership & Access [PLANNED]

> This pattern is designed but not yet implemented in existing agents. When creating new agents, include it to be future-ready.

```yaml
  document_zone:
    # Zone A: controlled files this agent can edit (user reviews via git)
    owns_controlled:
      - .claude/agents/<agent-id>.md
      - docs/agents/<agent-id>/flow/*.md
      - docs/agents/tools/package/<agent-id>.md

    # Zone B: autonomous files this agent owns (no user approval needed)
    owns_autonomous:
      - docs/agent-memory/notebooks/<agent-id>.md

    # Zone C: shared files this agent can append to (own section only)
    appends:
      - docs/handoffs/TASK_*.md -> section: "[<Agent Name>] <Section>"
      - docs/analysis-briefs/{TICKER}.md -> section: "[<Agent Name>]"

    # Read-only: files this agent can read but never edit
    reads:
      - docs/agent-memory/notebooks/*.md          # Other agents' notebooks
      - docs/{policies,protocols,standards,references}/*.md                     # Shared knowledge
      - docs/references/bundles/bundle-*.md      # Pre-bundled knowledge
      - docs/handoffs/TASK_*.md                    # Task context
```

**Rule: If a file is not in `owns_*` or `appends`, the agent MUST NOT write to it.**

---

## Document Registry — Anti-Ghost Index [PLANNED]

> This pattern is designed but not yet implemented in existing agents. When creating new agents, include it to be future-ready.

Every file the agent creates or owns must be registered here. This prevents phantom files (files created but never tracked, then forgotten).

```yaml
  document_registry:
    # Static files (always exist for this agent)
    static:
      - path: .claude/agents/<agent-id>.md
        type: definition
      - path: docs/agents/<agent-id>/flow/cycle.md
        type: flow
      - path: docs/agents/tools/package/<agent-id>.md
        type: tool-package
      - path: docs/agent-memory/notebooks/<agent-id>.md
        type: notebook

    # Dynamic files (created during work, pattern-based)
    dynamic:
      - pattern: docs/agent-memory/notebooks/<agent-id>.md
        type: notebook
        lifecycle: persistent, append-per-cycle
      - pattern: docs/analysis-briefs/{TICKER}.md
        type: ledger
        lifecycle: persistent, append own section
      - pattern: docs/handoffs/TASK_*.md
        type: handoff
        lifecycle: per-task, append own section
```

---

## Tools Package (Required)

Every agent has a tool permission package file:

```yaml
  tools_package: docs/agents/tools/package/<agent-id>.md
```

This file lists which MCP tools the agent is authorized to call. Referenced in flow files as `**Tools:** docs/agents/tools/package/<agent-id>.md`.
