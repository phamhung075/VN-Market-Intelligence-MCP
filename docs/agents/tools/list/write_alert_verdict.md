---
tool: write_alert_verdict
category: alerts
agents: [alert-commander]
---

# `write_alert_verdict`

**Category:** alerts | **Used by:** alert-commander
**Description:** Record a pending verdict after alert-commander fires a MARKET alert. Generates a UUID, writes one AlertVerdict row with verdict='pending' to the alert-verdicts store. Used by alert-commander at fire time (step 4a).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| ticker | string | yes | — | Stock code (e.g. "VNM"). Automatically uppercased. |
| direction | string | yes | — | Alert direction: "bullish" or "bearish". |
| conviction | number | yes | — | Conviction score 0.0–1.0. |
| alertSource | string | yes | — | Signal type: one of urgent_news, verified_chain, chain_catalyst, price_anomaly, position_danger, watchlist_opportunity, legal_risk, crisis_velocity. |
| firedAt | string | yes | — | ISO 8601 UTC timestamp of MARKET alert fire (e.g. "2026-05-10T09:00:00Z"). |

## Returns

```json
{
  "success": true,
  "id": "uuid-v4-generated",
  "ticker": "VNM",
  "verdict": "pending"
}
```

## Usage

```json
{
  "tool": "write_alert_verdict",
  "arguments": {
    "ticker": "VNM",
    "direction": "bullish",
    "conviction": 0.82,
    "alertSource": "verified_chain",
    "firedAt": "2026-05-10T09:00:00Z"
  }
}
```

## Notes

- Writes to `docs/data/alert-verdicts.json` via atomic rename (POSIX-safe)
- Dedup-safe: if the same UUID already exists, the write is skipped
- verdict is always "pending" at write time; resolved by verdictResolutionJob (Task 1863b/c)
- Task 1863d — tool #126
- Task 1967-01 — added legal_risk + crisis_velocity to alertSource enum
