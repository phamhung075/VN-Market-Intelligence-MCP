# Agent Creation Guide — Generic Pattern Reference

How to create a new agent in this system. All patterns extracted from live agents.

---

## Architecture Overview

Two agent families:

| Family | Runtime | Examples |
|--------|---------|---------|
| **Cowork** (Analysis) | Claude Cowork (cloud, cron-scheduled) | market-watcher, news-scout, alert-commander |
| **Dev Team** (CLI) | Claude Code (local, spawned by main terminal) | developer, qa, ops, dev-mcp-server |

Main terminal = permanent agent switch. Sub-agents cannot spawn each other.

---

## File Anatomy — What You Create Per Agent

```
.claude/agents/<agent-id>.md          # Agent definition (YAML frontmatter + rules)
.claude/flows/<agent-id>/cycle.md     # Cowork flow  — OR —
.claude/flows/<agent-id>/main.md      # Dev team flow
docs/agent-memory/notebooks/<agent-id>.md  # Persistent notebook (freeform working memory)
```

Optional:
```
.claude/tools/package/<agent-id>.md   # Tool permission package (if custom)
.claude/flows/<agent-id>/<extra>.md   # Additional flow variants
```

---

## 1. Agent Definition File (`.claude/agents/<agent-id>.md`)

### 1.1 YAML Frontmatter (Required)

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

### 1.2 Agent Identity Block

```yaml
agent:
  id: <agent-id>
  name: <Display Name>
  version: "YYYY-MM-DD"
  description: <Detailed role description>
```

**Dev agents add identity section:**
```yaml
  identity:
    mindset: <Core philosophy / approach>
    skills:
      - <Skill 1>
      - <Skill 2>
```

**Microservice dev agents add zone restriction:**
```yaml
  zone: apps/<service>/          # Only touch files in this directory
  tech_stack: <TypeScript/Bun | Python/FastAPI | etc.>
  database:
    owns: <db-file.db>           # Exclusive write access
    reads: [<other.db>]          # Read-only access
```

### 1.3 Permissions

```yaml
  permissions:
    tools_packages:
      - bootstrap                # All agents get this
      - <domain-package>         # e.g., news-analysis, market-analysis, alert-control
    channels:
      market:
        write: true|false
        rule: <rule>             # exclusive_sender | batch4_eod_only | never | briefings_only | cycle_status_only
      work:
        write: true|false
        rule: <rule>             # task_complete_notification_only | cycle_status_only | coordination_and_status | fix_shipped_notification_only | status_updates_only | prediction_summary_and_status
      bug:
        write: true|false
        rule: <rule>             # errors_only | violations_summary | via_submit_feedback_only | critical_errors_only | all_incidents_and_errors
```

### 1.4 Constraints

```yaml
  constraints:
    session_log: mandatory           # All cowork agents
    # Boolean constraints:
    tdd_mandatory: true              # Dev agents writing code
    ddd_layers: strict               # Dev agents
    no_verify: forbidden             # Never skip git hooks
    no_direct_vn_fetch: true         # Must use VPS proxy
    no_code_writing: true            # Read-only agents
    # Numeric constraints:
    max_alerts_per_day: 10
    max_tasks_parallel: 1
    wip_limit: 2
```

### 1.5 Boundary Rules (Required for all agents)

```yaml
  boundary_rules:
    scope: "YOUR flow steps ONLY. <What you do>. Blocked = report + EXIT."
    on_error: "Tool fails after 1 retry → send_telegram(bug) one-line error → EXIT cycle. Do NOT investigate."
    forbidden_outputs:
      - "NEVER create incident docs, escalation files, recovery procedures"
      - "NEVER modify pipeline-state.json or other agents' files"
      - "NEVER diagnose infrastructure — that is ops/developer's job"
      - "NEVER write files outside session log, notebook, and channel messages"
    token_rule: "Blocked = report + EXIT. Do not waste tokens on problems outside your flow."
```

### 1.6 Knowledge Loading

```yaml
  knowledge:
    always_load:
      - path: .claude/knowledge/fail-loud-protocol.md
        fail_loud: true              # STOP if missing
      - path: .claude/knowledge/<domain>.md
        fail_loud: true
    lazy_load:
      - path: .claude/knowledge/<file>.md
        trigger: <trigger-name>      # Load only when needed
        fail_loud: false
```

### 1.7 Signals (Cowork agents only)

```yaml
  signals:
    consumes:
      - <signal-type>    # cross_validate, suppress, chain_catalyst, price_anomaly, etc.
    produces:
      - <signal-type>    # urgent_news, crisis_velocity, news_impact, fundamental_validation, etc.
```

### 1.8 Schedule (Cron-scheduled agents only)

```yaml
  schedule:
    market_hours:
      cron: "*/15 2-8 * * 1-5"
      description: Every 15min during VN market hours (02:00-08:30 UTC)
    off_hours:
      cron: "0 */4 * * *"
      description: Every 4h outside market hours
```

### 1.9 Flow Assignment

```yaml
  flow:
    default: .claude/flows/<agent-id>/cycle.md
    # OR for agents with multiple flows:
    catalog:
      - name: <flow-name>
        path: .claude/flows/<agent-id>/<name>.md
        trigger: <condition>
        input: [<inputs>]
        output: [<outputs>]
```

### 1.10 Memory Configuration

```yaml
  memory:
    session_log: docs/agent-memory/sessions/YYYY-MM-DD-<agent-id>.md
    notebook: docs/agent-memory/notebooks/<agent-id>.md
    append_every_cycle: true
    # Optional:
    ledger_target: docs/analysis-briefs/{TICKER}.md
```

### 1.11 Inter-Agent Communication (Optional)

```yaml
  inter_agent:
    receives_from:
      - agent: <agent-id>
        mechanism: signal_bus|scheduled_invocation|direct_invocation
        signal_type: <signal>
        trigger: <condition>
    sends_to:
      - agent: <agent-id>
        mechanism: signal_bus|telegram_market|telegram_work|telegram_bug
        signal_type: <signal>
        trigger: <condition>
```

### 1.12 Knowledge Load Failure Protocol (Inline, required)

Paste this block in every agent file after the YAML:

```markdown
## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="bug", message="[{agent-name}] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-name}")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once
```

---

## 2. Flow File Templates

### 2.1 Cowork Agent Flow (`.claude/flows/<agent-id>/cycle.md`)

```markdown
# <Agent Name> — Cycle Flow

**Tools:** `.claude/tools/package/<agent-id>.md`

> **Anti-hallucination:** see `.claude/skills/anti-hallucination/SKILL.md`

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
<What this agent produces per cycle>

---

## Error Boundary

If ANY tool call fails after 1 retry:
1. `send_telegram(channel="bug", message="[<agent-id>] Step N failed: {one-line error}")`
2. Append to session log: `"Cycle HH:MM — BLOCKED at step N: {error}"`
3. **EXIT immediately.** Do NOT investigate, write incident docs, or diagnose infrastructure.

Your job = <concise job description>. Blocked = report + EXIT.

---

## How to Call Tools

ALL tools use the MCP gateway:
```
mcp__claude_ai_gateway__call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md`

```
call_tool(server="vn-market", tool="get_cycle_bootstrap", arguments={ "agent_name": "<agent-id>" })
```
If bootstrap fails or `market_context` missing → send BUG → STOP.

**0b. Regime extraction** (from bootstrap, zero extra tool calls)
Parse regime data from bootstrap context.

**1. <Main Step 1>**
<Tool calls and logic>

**2. <Main Step 2>**
<Tool calls and logic>

...

**N-2. Session log**
```
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "action": "<agent-id>-cycle",
  "context": { <cycle metrics> }
})
```
Append to `docs/agent-memory/sessions/YYYY-MM-DD-<agent-id>.md`:
```markdown
### Cycle (HH:MM–HH:MM)
- <Key metrics from this cycle>
```

**N-1. WORK channel**
```
call_tool(server="vn-market", tool="send_telegram", arguments={
  "message": "[<Agent Name>] HH:MM UTC — <summary>\n  <metrics>",
  "channel": "work"
})
```

**N. BUG on error**
Before sending: `get_recent_fixes(limit=20)` — if same module/issue in recent fixes → skip.
```
call_tool(server="vn-market", tool="send_telegram", arguments={
  "message": "[<Agent Name>] ⚠️ SEVERITY\n  Issue: ... | Impact: ... | Status: ...",
  "channel": "bug"
})
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
```

### 2.2 Dev Team Agent Flow (`.claude/flows/<agent-id>/main.md`)

```markdown
# <Agent Name> — Main Flow

**Tools:** `.claude/tools/package/<agent-id>.md`

## Input
`docs/handoffs/TASK_NNN.md` with prior context

## Output
Code + tests on branch | Implementation Record in handoff | Next agent notified

---

**Step 0a — Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>`)

**Pre-code checklist**
1. Confirm task status in docs/TASKS.md
2. Branch setup (checkout or create `task/NNN-kebab-description`)
3. Read `docs/handoffs/TASK_NNN.md` — use files_to_read/modify/create directly
4. `depends_on` not Done → STOP, notify PM
5. Load knowledge files (fail-loud)
6. Zone restriction check (if microservice dev)

**TDD workflow**
```
RED    → write failing test
GREEN  → minimum code to pass
REFACTOR → clean, still passes
REPEAT per acceptance criterion
```

**After code**
1. Run tests — all pass
2. Type check — 0 errors
3. Git commit per dev-standards.md

**Append to handoff** (before QA):
```markdown
## [Developer] Implementation Record
- **Files modified:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **Type check:** clean ✓
- **Tests:** N pass / 0 fail ✓
- **Docs updated:** [path — what changed] | NONE
```

**Append session log**
→ `append_session_record(agent_name="<agent-id>", task_name="Task NNN: ...", finding=..., status="Ready for QA")`

**End-of-cycle notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Update docs/TASKS.md** → In Progress → Review

**RETURN block:**
```
## RETURN
DONE: <one sentence: what was completed>
NEXT: <agent-name> | <one sentence: what it must do>
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```
```

---

## 3. Notebook File (`docs/agent-memory/notebooks/<agent-id>.md`)

```markdown
# <Agent Name> — Notebook

**Last updated:** YYYY-MM-DD HH:MM UTC | **Sprint:** NNNN

## Current state
<Operational status>

## Last session summary
- <Bullet 1>
- <Bullet 2>

## Known patterns / preferences
- <Pattern 1>

## Carry-over for next session
- <Item 1>
```

Rules: Keep under 50 lines. Overwrite entire file at cycle end (never append).

---

## 4. Registration Checklist

After creating the agent files, register it in these locations:

| File | What to add |
|------|-------------|
| `CLAUDE.md` | Add row to Agent Routing table |
| `.claude/knowledge/agent-roster.md` | Add to appropriate team section |
| `.claude/skills/dispatch/SKILL.md` | Add to dispatch table |
| `docs/AI_TEAM_DESIGN.md` | Add to team design doc |

For cron-scheduled agents, also create:
```
.claude/commands/crons/cron-<agent-id>.md   # CronCreate command
```

---

## 5. Signal Bus Reference

### Signal Types

| Signal | From | To | Purpose |
|--------|------|----|---------|
| `urgent_news` | news-scout | alert-commander | Breaking news on watchlist |
| `chain_catalyst` | news-scout | all | Crisis / macro catalyst |
| `crisis_velocity` | news-scout | alert-commander | Escalating crisis pattern |
| `news_impact` | news-scout | alert-commander | General news impact |
| `price_anomaly` | market-watcher | alert-commander | Unusual price movement |
| `fundamental_validation` | financial-analyst | alert-commander | Valuation verdict |
| `cross_validate` | any | any | Request cross-validation |
| `suppress` | any | any | Suppress a prior signal |
| `verified_chain` | alert-commander | digest-predict | Verified alert chain |
| `conviction_change` | digest-predict | alert-commander | Prediction confidence shift |
| `legal_risk` | news-scout | alert-commander | Legal/regulatory risk |

### Signal Schema

```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "<agent-id>",
  "to_agent": "<agent-id|all>",
  "signal_type": "<type>",
  "stock_code": "<TICKER>",
  "payload": { "title": "<string>", "detail": "<string>", "impact_score": <1-10> },
  "ttl_minutes": <number>,
  "chain_depth": <0-N>,
  "finding_data": { <schema per signal type> }
})
```

---

## 6. Error Boundary Pattern (Universal)

Every agent, every flow, same pattern:

```
If ANY tool call fails after 1 retry:
1. send_telegram(channel="bug", message="[<agent-id>] Step N failed: {one-line error}")
2. Append to session log
3. EXIT immediately
```

Never investigate. Never write incident docs. Never diagnose infrastructure. Report and exit.

---

## 7. Communication Standards

All inter-agent communication uses:
- **Caveman mode** (`.claude/skills/caveman/SKILL.md`): Drop articles, use fragments, ~75% token reduction
- **Token economy** (`.claude/skills/token-economy/SKILL.md`): ULTRA for agent-to-agent, FULL for task handoffs, LITE for user-facing

### RETURN Block Format (Dev team agents)

```
## RETURN
DONE: <one sentence>
NEXT: <agent-name> | <one sentence>
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```

### Pipeline State (Dev team agents write before returning)

```json
{
  "status": "in_progress|idle|blocked",
  "nextAgent": "<agent-name>|null",
  "nextPrompt": "<full spawn prompt>|null",
  "activeTaskId": "NNN",
  "updatedAt": "<ISO8601>",
  "updatedBy": "<agent-id>"
}
```

---

## 8. Skills Referenced by All Agents

| Skill | Path | Used by | When |
|-------|------|---------|------|
| cycle-bootstrap | `.claude/skills/cycle-bootstrap/SKILL.md` | Cowork | Step 0 |
| anti-hallucination | `.claude/skills/anti-hallucination/SKILL.md` | All MCP users | Always |
| project-root | `.claude/skills/project-root/SKILL.md` | Dev team | Step 0a |
| notebook-read | `.claude/skills/notebook-read/SKILL.md` | Dev team | Step 0b |
| notebook-write | `.claude/skills/notebook-write/SKILL.md` | All | End of cycle |
| session-log-cowork | `.claude/skills/session-log-cowork/SKILL.md` | Cowork | Before exit |
| doc-self-heal | `.claude/skills/doc-self-heal/SKILL.md` | All | Final step |
| append-session-record | `.claude/skills/append-session-record/SKILL.md` | Dev team | Before handoff |
| dispatch | `.claude/skills/dispatch/SKILL.md` | Main terminal | Routing |
| caveman | `.claude/skills/caveman/SKILL.md` | All | Always |
| token-economy | `.claude/skills/token-economy/SKILL.md` | All | Always |

---

## 9. Quick-Start: Create a New Cowork Agent

1. **Create** `.claude/agents/<agent-id>.md` — copy Section 1 template, fill in domain-specific values
2. **Create** `.claude/flows/<agent-id>/cycle.md` — copy Section 2.1 template, define steps
3. **Create** `docs/agent-memory/notebooks/<agent-id>.md` — copy Section 3 template
4. **Register** in CLAUDE.md, agent-roster.md, dispatch/SKILL.md (Section 4)
5. **Create cron** `.claude/commands/crons/cron-<agent-id>.md` if scheduled

## 10. Quick-Start: Create a New Dev Team Agent

1. **Create** `.claude/agents/<agent-id>.md` — copy Section 1 template with dev tools
2. **Create** `.claude/flows/<agent-id>/main.md` — copy Section 2.2 template
3. **Create** `docs/agent-memory/notebooks/<agent-id>.md` — copy Section 3 template
4. **Register** in CLAUDE.md, agent-roster.md, dispatch/SKILL.md (Section 4)

## 11. Quick-Start: Create a New Microservice Dev Agent

1. **Create** `.claude/agents/dev-<service>.md` — Section 1 template with `zone: apps/<service>/`
2. **Create** `.claude/flows/developer/microservice-main.md` — shared flow (already exists)
3. **Create** `docs/agent-memory/notebooks/dev-<service>.md` — Section 3 template
4. **Register** in CLAUDE.md (add `build/fix <service>` → `dev-<service>` row)
