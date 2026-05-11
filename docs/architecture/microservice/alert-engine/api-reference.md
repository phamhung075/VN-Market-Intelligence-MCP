# alert-engine — API Reference

**File:** `apps/alert-engine/src/interface/handlers.ts`

## GET /health
```json
{ "status": "ok", "service": "alert-engine", "port": 5006 }
```

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

**Response (200 — alert fired):**
```json
{
  "fired": true,
  "cooldown_sec": 1800,
  "reason": "alert stored and dispatched",
  "fingerprint": "abc12345"
}
```

**Response (200 — alert suppressed):**
```json
{
  "fired": false,
  "cooldown_sec": 1800,
  "reason": "cooldown: similar alert within 30 minutes",
  "fingerprint": "abc12345"
}
```

**Suppression reasons:**
- "stock muted" — stock in alert_mutes with active mute
- "duplicate fingerprint" — same fingerprint within 60 minutes
- "cooldown: similar alert within N minutes" — same stock+signals within window
- "daily cap: N alerts today" — exceeded maxAlertsPerStockPerDay (default 3)

**Telegram routing:**
- severity critical/high → MARKET channel
- severity medium/low → WORK channel

**400:** Missing required fields, invalid severity, malformed JSON
**500:** Generic error
