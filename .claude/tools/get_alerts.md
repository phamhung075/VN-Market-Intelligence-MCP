---
name: get_alerts
type: tool
package: alert-control, unified-coordination, market-analysis
related_tools: mark_alert_read, send_alert_digest, get_market_context
complexity: simple
---

# get_alerts

List investment alerts from the database. Use **type='system'** for signal alerts (price drop, news, BCTC reports), **type='price'** for stop-loss/take-profit threshold alerts, or **type='all'** (default) for both sections combined. Filter by severity level, unread-only flag, specific stock code, or date range.

## Arguments

- **type** (enum) — optional, default: "all"
  - `"system"` — signals from news/BCTC/macro
  - `"price"` — server-generated stop-loss/take-profit
  - `"all"` — both types combined

- **severity** (enum) — optional, default: null (all)
  - `"critical"` — position-danger, legal risk
  - `"high"` — significant moves, earnings miss
  - `"medium"` — normal signals
  - `"low"` — informational only

- **unread_only** (boolean) — optional, default: false
  - If true, return only unread alerts. Useful for "what's new" check.

- **stock_code** (string) — optional
  - Filter to single stock code (e.g., "ACB", "FPT")

- **hours_back** (number) — optional, default: 24
  - Time window (in hours). Typical: 6 for market hours, 24 for overnight review.

- **limit** (number) — optional, default: 50
  - Max alerts to return (pagination). Helpful during high-volume periods.

## Return Type

```typescript
{
  success: boolean,
  alerts: Array<{
    id: string,
    type: "system" | "price",
    severity: "critical" | "high" | "medium" | "low",
    stock_code: string,
    title: string,
    message: string,
    timestamp: string,
    read: boolean,
    data?: {
      // Alert-type-specific data
      price?: number,
      stop_loss_level?: number,
      news_headline?: string,
      bctc_metric?: string
    }
  }>,
  unread_count: number,
  total_count: number,
  // Alerts are sorted by severity (critical first) then recency
}
```

## Example Usage

### Alert Commander — Unread Alert Processing
```typescript
// Fetch new alerts this cycle
const newAlerts = await call_tool("vn-market", "get_alerts", {
  type: "all",
  unread_only: true,
  severity: "critical",
  limit: 25
});

console.log(`Critical unread alerts: ${newAlerts.unread_count}`);

// Process critical alerts immediately
for (const alert of newAlerts.alerts.filter(a => a.severity === "critical")) {
  console.log(`📍 ${alert.stock_code}: ${alert.title}`);

  // Send to user
  await call_tool("vn-market", "send_telegram", {
    channel: "market",
    message: `🚨 CRITICAL: ${alert.stock_code}\n${alert.message}`
  });

  // Mark as read
  await call_tool("vn-market", "mark_alert_read", {
    alert_id: alert.id
  });

  // Record outcome
  await call_tool("vn-market", "record_signal_outcome", {
    signal_id: alert.id,
    outcome: "alert_sent",
    conviction: 0.95
  });
}
```

### Market Watcher — Daily Alert Summary (EOD)
```typescript
// Get last 24 hours of alerts for EOD briefing
const eodAlerts = await call_tool("vn-market", "get_alerts", {
  type: "all",
  hours_back: 24,
  limit: 100
});

// Group by severity for EOD report
const bySeverity = {};
for (const alert of eodAlerts.alerts) {
  if (!bySeverity[alert.severity]) bySeverity[alert.severity] = [];
  bySeverity[alert.severity].push(alert);
}

// Compose EOD message
const eodMessage = `📋 **EOD Alert Summary (24h)**

🔴 Critical: ${bySeverity.critical?.length || 0} alerts
🟠 High: ${bySeverity.high?.length || 0} alerts
🟡 Medium: ${bySeverity.medium?.length || 0} alerts
🔵 Low: ${bySeverity.low?.length || 0} alerts

${Object.entries(bySeverity.critical || []).slice(0, 3).map(a => `  • ${a.stock_code}: ${a.title}`).join("\n")}`;

await call_tool("vn-market", "send_telegram", {
  channel: "work",
  message: eodMessage
});
```

### Digest & Predict — Macro Alert Synthesis
```typescript
// Get system alerts (no price alerts) for synthesis
const systemAlerts = await call_tool("vn-market", "get_alerts", {
  type: "system",
  severity: "high",
  hours_back: 24,
  limit: 50
});

// Filter to macro/sector alerts (news, BCTC)
const macroAlerts = systemAlerts.alerts.filter(a =>
  a.message.includes("news") || a.message.includes("BCTC") || a.message.includes("macro")
);

// Include in daily digest
const digestData = {
  total_system_alerts: systemAlerts.total_count,
  macro_alert_highlights: macroAlerts.slice(0, 5),
  alert_categories: systemAlerts.alerts
    .reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {})
};

// Send to Telegram MARKET channel
const digestMsg = `📊 **Daily Alert Digest**\nSystem alerts: ${systemAlerts.total_count}\nMacro alerts: ${macroAlerts.length}`;
await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: digestMsg
});
```

### Risk Monitor — Stock-Specific Alert Drill
```typescript
// Get all alerts for ACB over last week
const acbAlerts = await call_tool("vn-market", "get_alerts", {
  type: "all",
  stock_code: "ACB",
  hours_back: 168,  // 7 days
  limit: 100
});

// Analyze alert patterns
const patterns = {
  critical_count: acbAlerts.alerts.filter(a => a.severity === "critical").length,
  price_alerts: acbAlerts.alerts.filter(a => a.type === "price").length,
  system_alerts: acbAlerts.alerts.filter(a => a.type === "system").length
};

console.log(`ACB alerts (7d): ${patterns.critical_count} critical, ${patterns.price_alerts} price, ${patterns.system_alerts} system`);

// If too many critical, it may signal underlying problem
if (patterns.critical_count > 5) {
  await call_tool("vn-market", "submit_feedback", {
    agent: "market-watcher",
    title: "ACB: Excessive critical alerts (7 in 7 days)",
    category: "alert_quality",
    detail: `${patterns.critical_count} critical alerts for ACB. May indicate: (1) real risk, (2) threshold miscalibration, or (3) noisy signals.`,
    to: "@dev"
  });
}
```

## When to Use

- **At every cycle start** — Alert Commander calls with `unread_only: true` to process new alerts
- **For EOD reviews** — Market Watcher summarizes daily alert activity
- **Stock-specific monitoring** — Risk analyst reviews alert history for specific stocks
- **Macro synthesis** — Digest & Predict filters to system alerts for briefings
- **NOT for real-time streams** — Use server-side stop-loss for real-time price alerts

## Related Tools

| Tool | Use Case |
|------|----------|
| `mark_alert_read` | Mark alerts as processed (reduces clutter on next call) |
| `send_alert_digest` — Batch-send multiple alerts to Telegram |
| `get_market_context` | Includes open alert count in unified context snapshot |
| `record_signal_outcome` | Track which alerts led to user-facing messages |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `alerts: []` | No alerts in requested window | Proceed; normal when market is calm |
| `unread_count > limit` | High volume, pagination needed | Call again with higher `limit` or larger `hours_back` |
| `alert.data: null` | Alert metadata incomplete | Log to WORK, proceed with `title` + `message` only |

## Notes

- **Auto-sorting:** Alerts returned sorted by severity (critical → low) then recency (newest first).
- **Read status:** Calling `get_alerts` does NOT auto-mark as read. Use `mark_alert_read()` explicitly.
- **Unread workflow:** New alerts are unread until you call `mark_alert_read()`. Useful for "what's new" queries.
- **Price vs. system:** Price alerts are server-generated (stop-loss hits). System alerts are signal-driven (news, BCTC, macro).
- **Pagination:** `limit: 50` is typical. Increase if you need more history or lower during backlog periods.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, filtering by severity, EOD summary)
