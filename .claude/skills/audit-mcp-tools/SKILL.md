---
name: audit-mcp-tools
description: >
  Audit MCP tools for dead weight, obsolete, or unclaimed tools.
  Enforces full dependency scan across ALL integration layers —
  not just agent .md permission lists.
---

<!-- size-justification: 143L — atomic audit procedure: scan layers + claim resolution + exception rules are read as a single playbook by system-auditor. Splitting would require the auditor to load multiple files per run. -->


## Purpose

Detect truly unused MCP tools before proposing removal.
Prevent false-positive "unclaimed" verdicts caused by incomplete scope.

---

## The Failure Pattern to Avoid

**Wrong approach (what failed on 2026-05-03):**

> Search only cowork agent `.md` permission lists → conclude 43 tools are "unclaimed" → propose removal → ALL 6 proposed removals had real dependencies elsewhere.

**Root cause:** Agent `.md` files are ONE of FOUR integration layers. Checking only one layer = 75% blind.

---

## Mandatory Scan Scope — All 4 Layers

Before declaring any tool unused, verify it is absent from ALL of these:

### Layer 1 — Cowork Agent Permission Lists
```
.claude/agents/*.md          ← tools: [...] block
```

### Layer 2 — Dev Team Flow Files
```
docs/agents/**/flow/*.md        ← narrative references to tool names
.claude/skills/**/*.md       ← skill files that call tools
```

### Layer 3 — Runtime Bootstrap & Skill Manifests
```
apps/mcp-server/src/infrastructure/agentBootstrap.ts   ← SKILL_MANIFEST entries
apps/mcp-server/src/interface/mcp/tools/**/*.ts        ← tool registration (registerTool)
```

### Layer 4 — User-Facing Integrations
```
apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts  ← /commands
apps/mcp-server/src/**/*.test.ts                                   ← test coverage
```

---

## Audit Checklist (per tool)

For each candidate tool, answer ALL 5 questions:

| # | Question | Where to check |
|---|----------|---------------|
| 1 | Listed in any agent `.md` tools block? | `.claude/agents/` |
| 2 | Referenced in any flow or skill `.md`? | `docs/agents/`, `.claude/flow/skills/` |
| 3 | In `agentBootstrap.ts` SKILL_MANIFEST? | `agentBootstrap.ts` |
| 4 | Called in any Telegram command handler? | `telegramCommands.ts` |
| 5 | Has test coverage? | `**/*.test.ts` |

**Only if ALL 5 answers are NO → safe to propose removal.**

---

## Audit Execution Steps

### Step 1 — Get authoritative tool list
```
Read docs/data/tool-registry.json   ← active tools (count → `jq '.toolCount' docs/data/project-stats.json`)
```

### Step 2 — Build usage matrix
For each tool, grep ALL 4 layers simultaneously.
Use Grep with `pattern: "tool_name"` across the full repo.
Do NOT rely on a single source.

### Step 3 — Flag candidates
Only tools with zero hits across all 4 layers are candidates.

### Step 4 — Verify candidates manually
Read the source file for each candidate tool registration.
Check if it is called internally (not via MCP interface) by other server code.

### Step 5 — Write verdict with evidence
For each proposed removal, cite the specific files checked and confirmed empty.
Format:
```
Tool: get_example
Layer 1 (agents): not found in any .md
Layer 2 (flows): not found in docs/agents/ or .claude/flow/skills/
Layer 3 (bootstrap): not found in agentBootstrap.ts SKILL_MANIFEST
Layer 4 (telegram/tests): not found in telegramCommands.ts or *.test.ts
Verdict: SAFE TO REMOVE
```

---

## Red Flags — Stop and Investigate

If any of these are true, do NOT propose removal:

- Tool name appears in `agentBootstrap.ts` (even in a comment)
- Tool has a dedicated test file (`NNN-tool-name.test.ts`)
- Tool name matches a Telegram `/command` documented in `telegram-commands.md`
- Tool is listed in `portfolio-schema.md`, `alert-policy.md`, or other knowledge files as a user action

---

## Lessons from 2026-05-03 Audit

| Tool | Where dependency was missed |
|------|-----------------------------|
| `claim_telegram_report` | `agentBootstrap.ts` L174, dev-team flow |
| `process_telegram_report` | `agentBootstrap.ts` L175, po flow |
| `set_price_alert` | `agentBootstrap.ts` L115 (alert_commander skill manifest) |
| `delete_price_alert` | Same as above |
| `add_to_watchlist` | `agentBootstrap.ts` L124 (digest_predict skill manifest) |
| `remove_from_watchlist` | Watchlist lifecycle, test file `082-tool-watchlist.test.ts` |

**Pattern:** All 6 were in `agentBootstrap.ts` SKILL_MANIFEST — the layer that was never checked.

---

## Output Format

```markdown
## MCP Tool Audit — YYYY-MM-DD

### Confirmed Unused (safe to remove)
- `tool_name` — evidence: [files checked, all empty]

### False Positives Avoided
- `tool_name` — found in: [layer + file:line]

### Broken Features (tool exists but workflow incomplete)
- `tool_name` — exists but no agent calls it. Feature: X. Recommendation: integrate or remove.
```
