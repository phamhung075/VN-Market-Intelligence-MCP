# get_agent_signals

**Category:** News-Analysis / Agent Coordination

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`

## Purpose

Retrieve pending signals addressed to an agent. Returns all non-expired signals in the `pending` or `acknowledged` state. Agents call this during their processing cycle to react to upstream findings.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `agent_name` | string | Yes | — | Name of agent receiving signals (e.g. 'alert-commander') |

## Return Format

```
Tín hiệu cho alert-commander (3 tin):

[1234] URGENT_NEWS [VNM] — từ: news-scout
  Tiêu đề: VNM profit surge 15%
  Chi tiết: Q3 earnings beat forecast significantly
  Mức độ ảnh hưởng: 8/10
  Trạng thái: pending | Hết hạn: 2026-05-05T14:30:00Z

[1235] PRICE_CONFIRMATION [VNM] — từ: market-watcher
  Mức độ ảnh hưởng: 7/10
  Trạng thái: acknowledged | Hết hạn: 2026-05-05T15:00:00Z
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

## Related Tools

- `post_agent_signal` — agents send signals to the bus
- `record_signal_outcome` — mark signal as processed
- `get_signal_effectiveness` — review signal quality
- `get_open_chain_findings` — query open findings for enrichment

## Notes

- Returns only non-expired signals (checked against TTL)
- Both `pending` and `acknowledged` states are returned
- Formatted in Vietnamese for consistency with agent ecosystem
- Signal type in uppercase for clarity
