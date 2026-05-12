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

---

## Section Index

### 5.1–5.3: Structure & Identity

→ see [guide-agent-definition-frontmatter.md](./guide-agent-definition-frontmatter.md)
- YAML Frontmatter (required)
- Agent Identity (capabilities, responsibilities, not_my_job)
- Domain-specific sections (optional)

### 5.3–5.4: Ownership & Document Registry

→ see [guide-agent-definition-zone-ownership.md](./guide-agent-definition-zone-ownership.md)
- Document Zone (zones A/B/C read-only)
- Document Registry (static + dynamic files)
- Tools Package reference

### 5.5–5.7: Permissions & Rules

→ see [guide-agent-definition-permissions-constraints.md](./guide-agent-definition-permissions-constraints.md)
- Permissions (tools, channels)
- Constraints (session_log, booleans, numerics)
- Boundary Rules (scope, on_error, forbidden_outputs, token_rule)

### 5.8–5.9b: Knowledge & Communication

→ see [guide-agent-definition-knowledge-signals.md](./guide-agent-definition-knowledge-signals.md)
- Knowledge Loading (always_load, lazy_load)
- Signals (cowork only: consumes, produces)
- Inter-Agent Communication (receives_from, sends_to)
- Knowledge Load Failure Protocol

### 5.10–5.12: Flow & Memory

→ see [guide-agent-definition-flow-memory.md](./guide-agent-definition-flow-memory.md)
- Schedule (cron agents)
- Flow Assignment (default + catalog)
- Memory Configuration (notebook, append_every_cycle, reads_notebooks)
