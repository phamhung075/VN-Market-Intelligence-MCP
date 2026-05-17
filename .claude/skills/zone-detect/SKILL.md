---
name: zone-detect
description: >
  Zone→specialist routing logic for all microservice zones.
  2-step inference: explicit path hint → grep files list → Tier-3 fallback.
  Load when routing a task to a dev-* specialist or reporting zone-missing.
---

## Zone → Specialist Table

Data lives in SSOT — do not hardcode here. Query at runtime:

```bash
# All zones with specialists
jq '[.project.zones[] | {zone: .path, specialist, keywords}]' docs/data/system-map.json

# Specialist for a specific zone
jq '.project.zones[] | select(.id=="mcp-server") | .specialist' docs/data/system-map.json

# Match keyword to zone
jq '.project.zones[] | select(.keywords[] | test("MACD"))' docs/data/system-map.json
```

See full query patterns → `.claude/skills/system-map-query/SKILL.md`

## 2-Step Inference Logic

**Tier 1 — Explicit (preferred):**
Task carries `zone: apps/<service>/` → route directly to `dev-<service>`.

**Tier 2 — Infer (fallback):**
No explicit zone → inspect files list:
- ALL files start with `apps/<service>/` → route to `dev-<service>`
- Files span >1 zone OR root/scripts/ → route to `developer` (generic)
- Single keyword match in task description (use hint keywords column above) → route to matching specialist

**Tier 3 — Report (last resort):**
Cannot determine zone from files list or keywords → route to `developer` (generic), emit warning:
```
[dev-team] WARN: task NNN missing zone hint — PM did not propagate from architect
```
Drop signal `docs/signals/zone-missing-{taskId}-{ts}.json`:
```json
{
  "from": "dev-team",
  "to": "po",
  "type": "zone_missing_tier3",
  "priority": "medium",
  "createdAt": "<ISO>",
  "payload": { "taskId": "<id>", "files": [...], "suggestedZone": "<best-guess from Tier-2 step>" }
}
```

**Fail-loud:** If this skill file cannot be loaded → `send_telegram(channel="bug")` + STOP.
`fail_loud: true`
