> Parent: [guide-agent-definition.md](./guide-agent-definition.md)

# Agent Frontmatter & Identity

---

## YAML Frontmatter (Required)

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
| Cowork (analysis) | `Read, Write, mcp__gateway__call_tool` |
| Dev team (code) | `Read, Edit, Write, Glob, Grep, Bash` |
| Dev + MCP | `Read, Edit, Write, Glob, Grep, Bash, mcp__gateway__call_tool` |
| Read-only analysis | `Read, Glob, Grep` |

**Model selection:**

| Model | Use for |
|-------|---------|
| haiku | High-frequency cycles, simple routing, infrastructure checks |
| sonnet | Code writing, financial analysis, complex reasoning |
| opus | Strategic decisions, approval gates |

---

## Agent Identity — The Employee Card

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
      - docs/architecture/microservice/<service>/**
      - docs/<bucket>/<file>.md
    responsibilities:
      - Update zone docs after ANY code change that alters behavior, API, schema, or config
      - Keep own agent description accurate if skills/stack/port change
      - Run doc-review flow as mandatory post-code step
    rule: "Code without matching doc update = incomplete task. QA will reject."
```

---

## Domain-Specific Sections (Optional)

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
