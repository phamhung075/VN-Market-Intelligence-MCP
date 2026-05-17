---
name: telegram-channel-routing
description: >
  Rules for Telegram channel routing. Every send_telegram call MUST specify
  channel= explicitly. Channel detail data lives in system-map.json.
---

## Rules (logic — never changes)

**EVERY `send_telegram` call MUST include `channel=` explicitly. Never omit, never guess.**

1. **`market`** — actionable user content only: verified alerts, digests, EOD summaries. **NEVER** errors/status/heartbeats.
2. **`work`** — agent operational status: `[Agent Name] HH:MM UTC — summary`. ONE per cycle.
3. **`bug`** — errors only. Check `get_recent_fixes(limit=20)` first — skip if already fixed.

### Call Pattern
```
send_telegram(channel="work",   message="[Agent] HH:MM UTC — ...")
send_telegram(channel="market", message="...")
send_telegram(channel="bug",    message="[Agent] ⚠️ SEVERITY\n  Issue: ... | Impact: ... | Status: ...")
```

### Anti-Pattern (FORBIDDEN)
```
send_telegram(message="...")           ← missing channel
send_telegram(channel="market", ...)  ← for status/errors
```

## Channel Detail Data (env vars, allowed senders, rules)

Query from SSOT:
```bash
jq '.project.channels[]' docs/data/system-map.json
jq '.project.channels[] | select(.id=="market") | .allowed_senders' docs/data/system-map.json
jq '.project.channels[] | select(.id=="bug") | .env_var' docs/data/system-map.json
```

See full query patterns → `.claude/skills/system-map-query/SKILL.md`
