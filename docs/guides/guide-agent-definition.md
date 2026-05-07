**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 5. Agent Definition File (`.claude/agents/<agent-id>.md`)

### Quick Reference — YAML Sections by Agent Type

| Section | Cowork | Dev Team | Microservice Dev |
|---------|--------|----------|-----------------|
| Frontmatter (5.1) | Required | Required | Required |
| Identity (5.2) | Required | Required + `identity.mindset/skills` | Required + `zone/tech_stack/test_command` |
| Document Zone (5.3) | [PLANNED] | [PLANNED] | [PLANNED] |
| Tools Package (5.4b) | Required | Required | Required |
| Document Registry (5.4) | [PLANNED] | [PLANNED] | [PLANNED] |
| Permissions (5.5) | Required | Required | Required |
| Constraints (5.6) | Required | Required | Required |
| Boundary Rules (5.7) | Required | Required | Required |
| Knowledge (5.8) | Required | Required | Required |
| Signals (5.9) | Required | — | — |
| Inter-Agent (5.9b) | Required | Required | Required |
| Schedule (5.10) | If cron | — | — |
| Flow (5.11) | Required | Required + `catalog` | Required + `catalog` |
| Memory (5.12) | Required | Required | Required |
| Domain-specific | Optional | Optional | `doc_maintenance` required |

### 5.1 YAML Frontmatter (Required)

```yaml
---
name: <agent-id>                    # kebab-case, matches filename
color: <color>                      # orange|green|red|cyan|yellow|purple|blue
description: <Role>. <One-line summary of what it does>.
tools: <comma-separated tool list>  # See tool sets below
model: <model>                      # haiku|sonnet|opus
---
```

**Tool sets by family:**

| Family | Typical tools |
|--------|--------------|
| Cowork (analysis) | `Read, Write, mcp__claude_ai_gateway__call_tool` |
| Dev team (code) | `Read, Edit, Write, Glob, Grep, Bash` |
| Dev + MCP | `Read, Edit, Write, Glob, Grep, Bash, mcp__claude_ai_gateway__call_tool` |
| Read-only analysis | `Read, Glob, Grep` |

**Model selection:**

| Model | Use for |
|-------|---------|
| haiku | High-frequency cycles, simple routing, infrastructure checks |
| sonnet | Code writing, financial analysis, complex reasoning |
| opus | Strategic decisions, approval gates |

### 5.2 Agent Identity — The Employee Card

```yaml
agent:
  id: <agent-id>
  name: <Display Name>
  version: "YYYY-MM-DD"
  description: <What business value this agent delivers>

  capabilities:
    - <Capability 1 — specific, measurable>
    - <Capability 2>

  responsibilities:
    - <Responsibility 1 — a concrete deliverable>
    - <Responsibility 2>

  not_my_job:
    - <Task that belongs to another agent — name which agent>
    - <Task that is explicitly excluded>
```

**Dev agents add:**
```yaml
  identity:
    mindset: <Core philosophy>
    skills: [<Skill 1>, <Skill 2>]
```

**Microservice dev agents add:**
```yaml
  zone: apps/<service>/
  tech_stack: <TypeScript/Bun | Python/FastAPI>
  test_command: "cd apps/<service> && bun test"
  type_check: "cd apps/<service> && bun tsc --noEmit"
  database:
    owns: <db-file.db>
    reads: [<other.db>]
  doc_maintenance:
    owns:
      - docs/microservices/<service>/**
      - .claude/knowledge/<related-knowledge>.md
    responsibilities:
      - Update zone docs after ANY code change that alters behavior, API, schema, or config
      - Keep own agent description accurate if skills/stack/port change
      - Run doc-review flow as mandatory post-code step
    rule: "Code without matching doc update = incomplete task. QA will reject."
```

**Domain-specific sections (optional, per agent type):**

Agents may add custom YAML sections for domain-critical parameters. Examples from real agents:

```yaml
# market-watcher: adaptive thresholds
watch_thresholds:
  price_drop_sigma: 2
  volume_spike_multiplier: 2
  vnindex_drop_pct: 2
  brent_high: 90
  brent_low: 65

# financial-analyst: BCTC reporting deadlines
bctc_deadlines:
  q1: "04-30"
  q2: "07-31"
  q3: "10-31"
  q4: "02-28"
  reminder_days_before: 7

# alert-commander: language + validation
constraints:
  language: vietnamese_with_diacritics
  pre_send_validation: mandatory
```

### 5.3 Document Zone — Ownership & Access `[PLANNED — not yet in agent files]`

> This pattern is designed but not yet implemented in existing agents. When creating new agents, include it to be future-ready.

```yaml
  document_zone:
    # Zone A: controlled files this agent can edit (user reviews via git)
    owns_controlled:
      - .claude/agents/<agent-id>.md
      - .claude/flows/<agent-id>/*.md
      - .claude/tools/package/<agent-id>.md

    # Zone B: autonomous files this agent owns (no user approval needed)
    owns_autonomous:
      - docs/agent-memory/notebooks/<agent-id>.md
      - docs/agent-memory/sessions/YYYY-MM-DD-<agent-id>.md

    # Zone C: shared files this agent can append to (own section only)
    appends:
      - docs/handoffs/TASK_*.md -> section: "[<Agent Name>] <Section>"
      - docs/analysis-briefs/{TICKER}.md -> section: "[<Agent Name>]"

    # Read-only: files this agent can read but never edit
    reads:
      - docs/agent-memory/notebooks/*.md          # Other agents' notebooks
      - .claude/knowledge/*.md                     # Shared knowledge
      - .claude/knowledge/bundles/bundle-*.md      # Pre-bundled knowledge
      - docs/handoffs/TASK_*.md                    # Task context
```

**Rule: If a file is not in `owns_*` or `appends`, the agent MUST NOT write to it.**

### 5.4 Document Registry — Anti-Ghost Index `[PLANNED — not yet in agent files]`

> This pattern is designed but not yet implemented in existing agents. When creating new agents, include it to be future-ready.

Every file the agent creates or owns must be registered here. This prevents phantom files (files created but never tracked, then forgotten).

```yaml
  document_registry:
    # Static files (always exist for this agent)
    static:
      - path: .claude/agents/<agent-id>.md
        type: definition
      - path: .claude/flows/<agent-id>/cycle.md
        type: flow
      - path: .claude/tools/package/<agent-id>.md
        type: tool-package
      - path: docs/agent-memory/notebooks/<agent-id>.md
        type: notebook

    # Dynamic files (created during work, pattern-based)
    dynamic:
      - pattern: docs/agent-memory/sessions/YYYY-MM-DD-<agent-id>.md
        type: session-log
        lifecycle: one-per-day, append-only
      - pattern: docs/analysis-briefs/{TICKER}.md
        type: ledger
        lifecycle: persistent, append own section
      - pattern: docs/handoffs/TASK_*.md
        type: handoff
        lifecycle: per-task, append own section
```

### 5.4b Tools Package (Required)

Every agent has a tool permission package file:

```yaml
  tools_package: .claude/tools/package/<agent-id>.md
```

This file lists which MCP tools the agent is authorized to call. Referenced in flow files as `**Tools:** .claude/tools/package/<agent-id>.md`.

### 5.5 Permissions

```yaml
  permissions:
    tools_packages:
      - bootstrap
      - <domain-package>
    channels:
      market:
        write: true|false
        rule: <rule>
      work:
        write: true|false
        rule: <rule>
      bug:
        write: true|false
        rule: <rule>
```

### 5.6 Constraints

```yaml
  constraints:
    session_log: mandatory
    # Booleans: tdd_mandatory, ddd_layers, no_verify, no_direct_vn_fetch, no_code_writing
    # Numerics: max_alerts_per_day, max_tasks_parallel, wip_limit
```

### 5.7 Boundary Rules (Required)

```yaml
  boundary_rules:
    scope: "YOUR flow steps ONLY. <What you do>. Blocked = report + EXIT."
    on_error: "Tool fails after 1 retry -> send_telegram(bug) one-line error -> EXIT cycle. Do NOT investigate."
    forbidden_outputs:
      - "NEVER create files outside your document_registry"
      - "NEVER edit files outside your document_zone.owns_*"
      - "NEVER modify other agents' notebooks or session logs"
      - "NEVER diagnose infrastructure — that is ops/developer's job"
    token_rule: "Blocked = report + EXIT."
```

### 5.8 Knowledge Loading

```yaml
  knowledge:
    always_load:
      - path: .claude/knowledge/fail-loud-protocol.md
        fail_loud: true
    lazy_load:
      - path: .claude/knowledge/<file>.md
        trigger: <trigger-name>
        fail_loud: false
```

### 5.9 Signals (Cowork only)

```yaml
  signals:
    consumes: [<signal-type>, ...]
    produces: [<signal-type>, ...]
```

### 5.9b Inter-Agent Communication (Required)

Documents signal bus connections — who triggers this agent and who it triggers.

**Cowork agents (verbose format):**
```yaml
  inter_agent:
    receives_from:
      - agent: cron
        mechanism: scheduled_invocation
        trigger: market_hours_every_15min
      - agent: news-scout
        mechanism: signal_bus
        signal_type: urgent_news
        trigger: breaking_event
    sends_to:
      - agent: alert-commander
        mechanism: signal_bus
        signal_type: price_anomaly
        trigger: threshold_breached
      - agent: user
        mechanism: telegram_market
        trigger: eod_summary
```

**Dev agents (shorthand format):**
```yaml
  inter_agent:
    recv:
      - {from: pm, via: handoff+caveman, on: task_assigned}
    send:
      - {to: qa, via: tasks_md+caveman, on: impl_done}
      - {to: pm, via: caveman, on: blocked}
```

### 5.10 Schedule (Cron agents only)

```yaml
  schedule:
    market_hours:
      cron: "*/15 2-8 * * 1-5"
      description: Every 15min during VN market hours
```

### 5.11 Flow Assignment

```yaml
  flow:
    default: .claude/flows/<agent-id>/cycle.md
```

**With multiple flows (dev agents):**
```yaml
  flow:
    default: .claude/flows/developer/microservice-main.md
    catalog:
      - name: main
        path: .claude/flows/developer/microservice-main.md
        trigger: task_assigned_by_pm
        input: [TASK_NNN.md, task/NNN branch]
        output: impl committed | tests pass | handoff^ | qa notified
      - name: doc-review
        path: .claude/flows/developer/doc-review.md
        trigger: post_code_change
        input: [changed files list]
        output: docs updated | graphify run
```

### 5.12 Memory Configuration

```yaml
  memory:
    notebook: docs/agent-memory/notebooks/<agent-id>.md
    session_log: docs/agent-memory/sessions/YYYY-MM-DD-<agent-id>.md
    append_every_cycle: true
    # Notebooks to read for cross-team context (L3 lazy-load) [PLANNED]
    reads_notebooks:
      - <agent-id-1>    # Why: <reason>
      - <agent-id-2>    # Why: <reason>
```

### 5.13 Knowledge Load Failure Protocol (Inline, required)

```markdown
## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars):
1. `send_telegram(channel="bug", message="[{agent-name}] Knowledge load failed: <filename>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed", agent="{agent-name}")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
```
