# get_agent_signals

**Category:** News-Analysis / Agent Coordination

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`

## Purpose

Retrieve pending signals addressed to an agent. Returns all non-expired signals in the `unread` or `all` state. Agents call this during their processing cycle to react to upstream findings.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `agent` | string | Yes | — | Name of agent receiving signals (e.g. 'alert-commander') |
| `status` | enum | No | `"unread"` | `"unread"` returns only unread signals (marks as read); `"all"` returns all non-expired |
| `from_agent` | string | No | — | If provided, returns signals sent BY this agent (sender-history). Read-mark suppressed. |
| `hours_back` | number | No | — | Restrict results to signals created within the last N hours (e.g. `6` = 360 min). When omitted, all non-expired signals are returned (backward-compatible). |

## Key Notes on `hours_back`

- Designed for the L-4 consolidation pattern: news-scout calls `get_agent_signals(from_agent="news-scout", status="all", hours_back=6)` once per cycle to populate a `SELF_SIGNALS_CACHE`. Client-side filters on that cache replace 2 additional MCP calls per cycle.
- The 6-hour (360-min) window covers the `legal_risk` dedup window.
- When combined with `from_agent`, filters the sender-history by creation age.
- Uses `created_at` column (not `expires_at`) for the lookback filter.

## Return Format

```
Tín hiệu cho alert-commander (3 tin):

[1234] URGENT_NEWS [VNM] — từ: news-scout
  Tiêu đề: VNM profit surge 15%
  Chi tiết: Q3 earnings beat forecast significantly
  Mức độ ảnh hưởng: 8/10
  Trạng thái: unread | Hết hạn: 2026-05-05T14:30:00Z

[1235] PRICE_CONFIRMATION [VNM] — từ: market-watcher
  Mức độ ảnh hưởng: 7/10
  Trạng thái: read | Hết hạn: 2026-05-05T15:00:00Z
```

**Empty State:**
```
Không có tín hiệu mới.
```

## Return Values (Plain Text)

Vietnamese formatted plain-text output with:
- Signal count in header
- Signal ID, type, stock code (if present), and source agent
- Payload title and detail
- Impact score (if provided)
- Current status and expiration time

## Use Cases

- **Alert Commander** calls at cycle start to get urgent_news, price_anomaly, cross_validate signals
- **Report Analyzer** calls to get fundamental_validation signals from Financial Analyst
- **Market Watcher** calls to get suppress signals to cancel false positives
- **News Scout** calls once per cycle with `from_agent="news-scout", status="all", hours_back=6` to populate `SELF_SIGNALS_CACHE` for dedup (L-4 pattern — replaces 3 separate calls)

## Related Tools

- `post_agent_signal` — agents send signals to the bus
- `record_signal_outcome` — mark signal as processed
- `get_signal_effectiveness` — review signal quality
- `get_open_chain_findings` — query open findings for enrichment

## Notes

- Returns only non-expired signals (checked against TTL via `expires_at`)
- `hours_back` applies an additional `created_at >= datetime('now', '-N minutes')` filter
- Formatted in Vietnamese for consistency with agent ecosystem
- Signal type in uppercase for clarity
