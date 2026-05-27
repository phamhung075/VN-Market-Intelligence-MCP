# Ops — DB Health Flow

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
SQLite WAL overflow, integrity check failure, slow queries, DB corruption suspicion

## Output
Integrity confirmed ("ok") and WAL size within bounds | Escalation if integrity_check fails

---

## DB Health Commands
```bash
ls -lh apps/mcp-server/data/db.sqlite*            # WAL < 10MB normal, >50MB = flag
sqlite3 apps/mcp-server/data/db.sqlite "PRAGMA integrity_check;"  # must = "ok"
```

If `integrity_check` returns anything other than `ok` → escalate immediately (data loss risk).
If WAL > 50MB → trigger Docker restart to force WAL checkpoint before escalating.

**Notebook write** → `docs/agent-memory/notebooks/ops.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
