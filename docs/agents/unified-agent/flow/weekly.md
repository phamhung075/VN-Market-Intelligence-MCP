# Unified Agent — Weekly Verification Flow (Sunday 23:30 UTC)

**Tools:** `docs/agents/tools/package/unified-agent.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

**Ownership:** Weekly analysis owned by `digest-predict/weekly.md` (Sun 16:00 UTC). This flow verifies delivery only.

## Input
MARKET channel messages from digest-predict (or calibration-report — same weekly data, different sender name)

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

**Notebook commit** — append to `docs/agent-memory/notebooks/unified-agent.md`:
```
### Weekly Verification (HH:MM UTC)
- Mode: WEEKLY_VERIFY | Digest sent: [yes/no] | Sunday bugs: [list]
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/unified-agent.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/unified-agent.md
git commit -m "chore(memory/unified-agent): notebook YYYY-MM-DD"
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
