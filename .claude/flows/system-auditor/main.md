# System Auditor — Main Flow

## Input
Git diff (last 24h), CLAUDE.md, TASKS.md, memory/MEMORY.md

## Output
Fixed stale entries | BUG report for NEW anomalies | session log

---

## Early Exit
```bash
git log --since="24h" --oneline  # 0 commits → skip doc sync pass
```
Last audit < 12h AND no new commits → EXIT.
No changes in CLAUDE.md/TASKS.md → EXIT.

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
- `TASKS.md` > 80 lines → archive Done to `docs/archive/`
- `SPRINT_GOAL.md` > 30 lines → delete old goals

**5. DB health**:
```bash
ls -lh apps/mcp-server/data/db.sqlite*  # WAL < 10MB ok, >50MB flag
sqlite3 apps/mcp-server/data/db.sqlite "PRAGMA integrity_check;"  # must = "ok"
```

**6. Stats**: `docs/data/project-stats.json` drift → update sprint/tool/scheduler counts

## Anomaly Reporting

Known (in `docs/agent-memory/issues/` within 7 days) → skip.
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

## Always Report (never skip)
test data in prod | DB corruption | unbounded WAL | cron not running | prod table 0 rows expected > 0
