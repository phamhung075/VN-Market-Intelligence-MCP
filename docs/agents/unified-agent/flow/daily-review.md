# Unified Agent — Daily Review Flow (20:00 UTC)

**Tools:** `docs/agents/tools/package/unified-agent.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Day's coordination data | BUG channel reports

## Output
Daily summary to WORK | freshness flags

---

**1.** `send_telegram(channel="work", message="Daily coordination summary ({date}):\n- News: {N} new, {M} important | Alerts: {sent}/{total} | System: {ok|degraded} | Bugs: {N}")`

**2. BUG observe** `read_telegram_reports(status="new", unclaimed_only=false)` — DO NOT claim or re-file

**3. Freshness**
| Source | Max staleness |
|--------|---------------|
| Prices | 30 min |
| News | 2h |
| BCTC | 48h |
Exceeded → `submit_feedback(agent="unified-agent", category="performance_issue", severity="...", title="...", description="...")`
  Note: `category` is required — use: cascade_rule_gap | data_extraction_error | alert_quality | threshold_issue | performance_issue | other

**Notebook commit**

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/unified-agent.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- NEVER write entries for cycles that have not fired yet

Append to `docs/agent-memory/notebooks/unified-agent.md`:
```
### Daily Review (HH:MM UTC)
- Mode: DAILY_REVIEW | Freshness: [ok/stale] | Bugs: [list]
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/unified-agent.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/unified-agent.md
git commit -m "chore(memory/unified-agent): notebook YYYY-MM-DD"
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
