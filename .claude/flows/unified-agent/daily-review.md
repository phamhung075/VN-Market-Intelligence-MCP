# Unified Agent — Daily Review Flow (20:00 UTC)

**Tools:** `.claude/tools/package/unified-agent.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Day's coordination data | BUG channel reports

## Output
Daily summary to WORK | freshness flags

---

**1.** `send_telegram(channel="work")`:
```
Daily coordination summary ({date}):
- News: {N} new, {M} important | Alerts: {sent}/{total} | System: {ok|degraded} | Bugs: {N}
```

**2. BUG observe** `read_telegram_reports(status="new", unclaimed_only=false)` — DO NOT claim or re-file

**3. Freshness**
| Source | Max staleness |
|--------|---------------|
| Prices | 30 min |
| News | 2h |
| BCTC | 48h |
Exceeded → `submit_feedback(agent="unified-agent", ...)`

**Notebook commit** — append to `docs/agent-memory/notebooks/unified-agent.md`:
```
### Daily Review (HH:MM UTC)
- Mode: DAILY_REVIEW | Freshness: [ok/stale] | Bugs: [list]
```
```bash
git add docs/agent-memory/notebooks/unified-agent.md
git commit -m "chore(memory/unified-agent): notebook YYYY-MM-DD"
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
