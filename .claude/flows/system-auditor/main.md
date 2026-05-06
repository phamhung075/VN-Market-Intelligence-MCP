# System Auditor — Main Flow

**Tools:** `.claude/tools/package/system-auditor.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via `mcp__claude_ai_gateway__call_tool`.

## Input
Git diff (last 24h), CLAUDE.md, docs/TASKS.md, memory/MEMORY.md

## Output
Fixed stale entries | BUG report for NEW anomalies | session log

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `system-auditor`)

## Early Exit
```bash
git log --since="24h" --oneline  # 0 commits → skip doc sync pass
```
Last audit < 12h AND no new commits → EXIT.
No changes in CLAUDE.md/docs/TASKS.md → EXIT.

## Checklist

**1. Memory integrity** — `memory/MEMORY.md`:
- Each entry: file exists, content current, not stale
- Broken pointers | index > 200 lines | contradictions → fix or delete

**2. Knowledge hygiene** — `.claude/knowledge/*.md`:
- Hardcoded volatile values → replace with pointer to `docs/data/*.json`
- Verify JSON counts: `tool-registry.json` vs actual | `cron-registry.json` vs jobs | `stock-classification.json` vs watchlist

**3. Agent validation** — `.claude/agents/*.md`:
- Dangling pointers (target missing) | refs follow tree-map | no hardcoded volatile counts

**4. Size caps**:
- `CLAUDE.md` > 120 lines → move bloat to knowledge files
- `docs/TASKS.md` > 80 lines → archive Done to `docs/archive/`
- `docs/SPRINT_GOAL.md` > 30 lines → delete old goals

**5. DB health**:
```bash
ls -lh apps/mcp-server/data/db.sqlite*  # WAL < 10MB ok, >50MB flag
sqlite3 apps/mcp-server/data/db.sqlite "PRAGMA integrity_check;"  # must = "ok"
```

**6. Stats**: `docs/data/project-stats.json` drift → update sprint/tool/scheduler counts

## Anomaly Reporting

Known (already reported to Telegram BUG within 7 days — check recent sessions) → skip.
New:
```
## Anomaly: [Name]
Severity: info | warn | critical | Date: YYYY-MM-DD
Location: [file/table/process] | Details: [wrong] | Impact: [why] | Root cause: [guess]
```
severity ≥ warn → `send_telegram(channel="bug")`

Session log `docs/agent-memory/sessions/YYYY-MM-DD-auditor.md`:
```
### Audit Run (HH:MM–HH:MM)
- Memory: N stale cleaned | Knowledge: N fixed | Anomalies: N new, M known
- DB: [result] | Status: OK | escalated
```

## End-of-cycle notebook write
→ skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `system-auditor`)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## Always Report (never skip)
test data in prod | DB corruption | unbounded WAL | cron not running | prod table 0 rows expected > 0
