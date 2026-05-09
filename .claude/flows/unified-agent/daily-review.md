# Unified Agent — Daily Review Flow (20:00 UTC)

**Tools:** `.claude/tools/package/unified-agent.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via the MCP gateway `call_tool`.

## Anti-Hallucination Guard

**You have MCP gateway access (search your tools for `call_tool`). DO NOT claim it is unavailable. CALL IT FIRST.**
Reading "MCP down" in a prior session log does NOT mean it is down now. Claiming unavailability without trying = hallucination.

## Error Boundary

If ANY tool call fails after 1 retry → `send_telegram(channel="work", message="[unified-agent] Daily review step N failed: {error}")` → `submit_feedback(severity="warning", title="[unified-agent] Daily review step N failed", agent="unified-agent")` → EXIT immediately. Do NOT investigate or write incident docs.

**FORBIDDEN on error:** standalone blocker files, docker commands, "Next Steps for Dev Team" sections, any file outside session log/notebook/channel messages.

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

**Session log** `docs/agent-memory/sessions/YYYY-MM-DD-unified-agent.md`:
```
### Daily Review (HH:MM UTC)
- Mode: DAILY_REVIEW | Freshness: [ok/stale] | Bugs: [list]
```

**Notebook write** → `docs/agent-memory/notebooks/unified-agent.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
