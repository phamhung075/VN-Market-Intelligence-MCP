# set_price_alert & delete_price_alert

**Module:** `interface/mcp/tools/market-data/priceAlertTools.ts`

**Category:** Market Data (Alerts)

## Overview

Two MCP tools for price threshold management (stop-loss and take-profit alerts):
- `set_price_alert` — Create a stop-loss or take-profit price threshold
- `delete_price_alert` — Cancel an alert by ID

All prices are in VND (Vietnamese Dong).

## Tool Signatures

```typescript
set_price_alert(
  code: string,
  alert_type: "stop_loss" | "take_profit",
  threshold: number,
  notes?: string
) → string

delete_price_alert(alert_id: number) → string
```

## Input Parameters

### set_price_alert

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `code` | string | yes | — | Stock ticker code (must be in watchlist) |
| `alert_type` | string | yes | — | "stop_loss" or "take_profit" |
| `threshold` | number | yes | — | Price threshold in VND (e.g., 85000) |
| `notes` | string | no | null | Optional notes (e.g., "tech setup broken", "exit target") |

### delete_price_alert

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `alert_id` | number | yes | — | Alert ID to cancel (from previous set_price_alert response) |

## Output Format

### set_price_alert Success

```
Price Alert Created

Stock: VCB
Type: stop_loss
Threshold: 80,000 VND
Status: active
Created: 2026-05-05 14:30:00 UTC
Alert ID: 12345
Notes: Daily trend broken

Next steps: Monitor for trigger. Use delete_price_alert(alert_id=12345) to cancel.
```

### delete_price_alert Success

```
Price Alert Deleted

Alert ID: 12345
Stock: VCB
Type: stop_loss
Threshold: 80,000 VND
Status: deleted
Deleted: 2026-05-05 14:35:00 UTC

This alert will no longer trigger.
```

## Data Model

**Stored in:** `price_alerts` table

| Field | Type | Notes |
|-------|------|-------|
| id | INT | Auto-increment primary key |
| code | VARCHAR | Stock code (validated against watchlist) |
| alert_type | VARCHAR | "stop_loss" or "take_profit" |
| threshold | DECIMAL | Price in VND |
| status | VARCHAR | "active" or "triggered" or "deleted" |
| created_at | TIMESTAMP | ISO 8601 creation time |
| triggered_at | TIMESTAMP | When alert fired (null if not triggered) |
| notes | TEXT | User notes (optional) |

## Key Characteristics

- **Stock validation:** Code must exist in watchlist (validated on creation)
- **Price precision:** Stored as DECIMAL for accuracy
- **VND format:** Prices are always in Vietnamese Dong
- **Status tracking:** Alerts move to "triggered" when price crosses threshold
- **Soft delete:** Deleted alerts kept in DB (status='deleted') for audit trail
- **Best-effort firing:** Server scheduler checks price_alerts every 5 minutes

## Alert Triggering Logic

**For stop_loss:**
- Triggers when live price <= threshold
- Example: alert at 80,000 fires when VCB closes at or below 80,000 VND

**For take_profit:**
- Triggers when live price >= threshold
- Example: alert at 90,000 fires when VCB closes at or above 90,000 VND

**Firing process:**
1. Server checks all active alerts every 5 minutes (scheduler job)
2. Compares threshold to live market snapshot (via get_market_snapshot)
3. If triggered, sets status='triggered', records triggered_at timestamp
4. Posts signal to Alert Commander for further action

## Usage Examples

```
User → set_price_alert(code="VCB", alert_type="stop_loss", threshold=80000, notes="Daily trend broken")
Alert ID: 12345 created

User → set_price_alert(code="SAB", alert_type="take_profit", threshold=95000, notes="Target hit")
Alert ID: 12346 created

User → delete_price_alert(alert_id=12345)
Alert 12345 deleted (will not trigger)
```

## Error Handling

### set_price_alert Errors

- **Code not in watchlist:** "Stock VCB is not in your watchlist"
- **Invalid type:** "alert_type must be 'stop_loss' or 'take_profit'"
- **Invalid threshold:** "threshold must be a positive number"
- **Database error:** "Failed to create alert: [error message]"

### delete_price_alert Errors

- **Alert not found:** "Alert with ID 12345 not found"
- **Already deleted:** "Alert 12345 is already deleted"
- **Database error:** "Failed to delete alert: [error message]"

## Integration Notes

- Called by: Users via Command interface, Market Watcher (auto-create for detected patterns)
- Firing checked by: scheduler/alertScanJob (5-minute cycle)
- Signals sent to: Alert Commander for verification and action
- Related to: `get_alerts(type="price")` to view all price alerts

## Price Alert Validation

Before firing, Alert Commander validates signal via `validate_signal_price`:
- Checks current price vs. live market snapshot
- Allows ±5% tolerance (market volatility cushion)
- Prevents false alarms from stale data

## Related Tools

- **`get_alerts(type="price")`** — List all active price alerts
- **`get_market_snapshot()`** — Get current live prices (used to trigger alerts)
- **`validate_signal_price(code, price)`** — Verify signal price is reasonable

## Deprecated

- **`get_price_alerts`** (removed) — Use `get_alerts(type="price")` instead

---

**Added:** Task 206 (Stop-loss / Take-profit Price Alert MCP Tools)
**Updated:** Task 241 (merged get_price_alerts into get_alerts)
**Status:** STABLE
