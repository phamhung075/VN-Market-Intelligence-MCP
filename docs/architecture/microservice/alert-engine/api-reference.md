# alert-engine — API Reference

**File:** `apps/alert-engine/pkg/interface/http/router.go`

## GET /health
```json
{ "status": "ok", "service": "alert-engine", "port": 5006 }
```
`port` reflects the live `cfg.Port` (env `PORT`, default 5006) — not hardcoded (FACTORY-ALERT-router-cleanups).

## POST /evaluate
Evaluate alert request against dedup, cooldown, mute rules.

**Request:**
```json
{
  "stock": "VCB",
  "severity": "high",
  "message": "Price dropped 5% in 30 minutes",
  "signalTypes": ["price_drop", "volume_spike"],
  "actionCode": "SELL",
  "sendTelegram": true
}
```

**Required fields:** stock (non-empty), severity (low|medium|high|critical), message (non-empty)

**Optional:** signalTypes (string[]), actionCode (string), sendTelegram (boolean, default false)

**Response (200 — alert fired):** `fired` is true once the alert passed every
gate AND was recorded — independent of whether Telegram delivery succeeds
(`telegram_sent` reports delivery separately; see reconciliation record in
`docs/architecture/microservice/alert-engine/usecases.md`).
```json
{
  "fired": true,
  "cooldown_sec": 1800,
  "reason": "alert fired",
  "fingerprint": "abc12345",
  "alert_id": "42",
  "code": "VCB",
  "telegram_sent": true
}
```

**Response (200 — alert suppressed):** `alert_id` is `""` whenever `fired` is
false. `cooldown_sec` is always the constant configured window
(`cfg.CooldownMinutes*60`, default 1800) regardless of which gate suppressed
the alert.
```json
{
  "fired": false,
  "cooldown_sec": 1800,
  "reason": "cooldown: same signal within 30min",
  "fingerprint": "abc12345",
  "alert_id": "",
  "code": "VCB",
  "telegram_sent": false
}
```

**Suppression reasons** (exact strings, `pkg/module/alert_pipeline/pipeline.go`):
- `invalid severity: "<value>"` — severity not one of low/medium/high/critical (dead-in-practice on this HTTP path — already 400'd by `router.go` before evaluation runs; matters for future non-HTTP callers of the module)
- `duplicate: fingerprint seen within <N>min` — same fingerprint within `cfg.DedupWindowMinutes` (default 60 — a named field, distinct from `cfg.CooldownMinutes`; FACTORY-ALERT-dedup-window-config)
- `cooldown: same signal within Nmin` / `daily cap: N/M alerts for <stock>` — cooldown-gate primitive
- `muted: stock is muted` — stock has an active mute

**Telegram routing** (via `signal-classifier` primitive):
- severity critical/high → MARKET channel
- severity medium/low → WORK channel
- only dispatched when `sendTelegram: true` in the request (default false); a
  fired+stored alert with `sendTelegram: false` or a Telegram-side skip/error
  returns `telegram_sent: false` without affecting `fired`.

**400:** Missing required fields, invalid severity, malformed JSON
**500:** Generic error (e.g. repository I/O failure)
