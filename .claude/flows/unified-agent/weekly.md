# Unified Agent — Weekly Verification Flow (Sunday 13:00 UTC)

**Tools:** `.claude/tools/package/unified-agent.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

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

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
