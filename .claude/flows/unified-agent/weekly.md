# Unified Agent — Weekly Verification Flow (Sunday 13:00 UTC)

**Tools:** `.claude/tools/package/unified-agent.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via `mcp__claude_ai_gateway__call_tool`.

## Anti-Hallucination Guard

**You have `mcp__claude_ai_gateway__call_tool`. CALL IT. Do not claim unavailability without trying.**
Blocked = one-line WORK telegram + EXIT. No incident files, no docker commands, no "Next Steps" sections.

## Error Boundary

If ANY tool call fails after 1 retry → `send_telegram(channel="work", message="[unified-agent] Weekly step N failed: {error}")` → EXIT immediately. Do NOT investigate or write incident docs.

---

**Ownership:** Weekly analysis owned by `digest-predict/weekly.md` (Sun 16:00 UTC). This flow verifies delivery only.

## Input
MARKET channel messages from digest-predict

## Output
Verification log | escalation if digest missing

---

**1. Verify digest-predict weekly was sent**
`get_unreviewed_market_messages(limit=10)` — check for digest-predict weekly message from today.
- Found → log confirmation, no further action.
- Missing AND current time > 17:00 UTC → `submit_feedback(agent="unified-agent", category="digest_missing", severity="medium")` + WORK alert:
  ```
  [Unified] Weekly digest NOT detected in MARKET channel — digest-predict may have failed.
  ```

**2. BUG channel observe** `read_telegram_reports(status="new", unclaimed_only=false)` — flag any Sunday bugs to session log. DO NOT claim or re-file.

**Session log** `docs/agent-memory/sessions/YYYY-MM-DD-unified-agent.md`:
```
### Weekly Verification (HH:MM UTC)
- Mode: WEEKLY_VERIFY | Digest sent: [yes/no] | Sunday bugs: [list]
```

**Notebook write** → `docs/agent-memory/notebooks/unified-agent.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
