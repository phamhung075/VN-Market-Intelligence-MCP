---
name: zone-detect
description: >
  SSOT zone→specialist routing table for all 9 microservice zones.
  2-step inference: explicit path hint → grep files list → Tier-3 fallback.
  Load when routing a task to a dev-* specialist or reporting zone-missing.
---

## Zone → Specialist Table (canonical)

| Zone path | Hint keywords | dev-* specialist |
|---|---|---|
| `apps/mcp-server/` | MCP tool, cron, market orchestration | `dev-mcp-server` |
| `apps/api-gateway/` | HTTP routing, gateway, health aggregation | `dev-api-gateway` |
| `apps/stock-price/` | price fallback, VPS bridge, quote agg | `dev-stock-price` |
| `apps/technical-analysis/` | RSI, MACD, BB, indicator math | `dev-technical-analysis` |
| `apps/macro-indicators/` | SBV FX, commodity, macro trend | `dev-macro-indicators` |
| `apps/kinh-dich-service/` | hexagram, I-Ching, kinh dich | `dev-kinh-dich` |
| `apps/alert-engine/` | dedup, cooldown, Telegram dispatch | `dev-alert-engine` |
| `apps/pdf-extractor/` | BCTC, OCR, Vietnamese parse | `dev-pdf-extractor` |
| `apps/rag-service/` | embeddings, LanceDB, semantic search | `dev-rag-service` |
| cross-service / root / scripts/ | multi-zone or root-level | `developer` (generic) |

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
