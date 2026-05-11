# System Auditor — Main Flow

**Tools:** `.claude/tools/package/system-auditor.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

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

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/system-auditor.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- NEVER write entries for cycles that have not fired yet

Append to `docs/agent-memory/notebooks/system-auditor.md`:
```
### Audit Run (HH:MM–HH:MM)
- Memory: N stale cleaned | Knowledge: N fixed | Anomalies: N new, M known
- DB: [result] | Status: OK | escalated
```
Then:
```bash
git add docs/agent-memory/notebooks/system-auditor.md
git commit -m "chore(memory/system-auditor): notebook YYYY-MM-DD"
```
Convention: `.claude/knowledge/commit-convention.md` § Notebook Commits

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

## Always Report (never skip)
test data in prod | DB corruption | unbounded WAL | cron not running | prod table 0 rows expected > 0

---

## Agent-Specific Error Cases
- DB integrity check returns non-"ok" → report as CRITICAL anomaly → EXIT after Telegram alert.

## Step 7 — PO handoff if findings require dev work

If audit found anomalies, stale entries, broken pointers, DB issues, or config drift that need code/system fixes:

1. Compile findings summary for PO with:
   - Each issue: what's wrong, which file/module/DB, severity, evidence
   - Suggested fix category: `fix` | `refactor` | `chore`
   - Affected area: file path or system component

2. **Spawn PO agent** with prompt:
   ```
   run .claude/flows/po/main.md

   ## System Auditor Findings (cycle N)
   {paste findings table here}

   Create sprint tasks for these issues. Prioritize by severity.
   ```

Skip this step ONLY if audit found zero anomalies and all checks passed.

## RETURN

```
DONE: Audit complete — N anomalies (C critical, W warn, I info) | M entries fixed
NEXT: po (spawned with findings) | user (if clean) | ops (if critical DB anomaly)
PIPELINE: complete
QUALITY: full | partial (if early exit triggered)
```
