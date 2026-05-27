---
tool: get_analysis_history
category: alerts
agents: [digest-predict, unified-agent]
---

# `get_analysis_history`

**Category:** alerts | **Used by:** Digest & Predict, Unified Coordinator
**Description:** Retrieve the history of AI analyses stored in the RAG database. Filter by stock code, analysis level (global/country/domain/action), or date range.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| actionCode | string | ❌ | — | Filter analyses that mention this stock code, e.g. VCB |
| domain | string | ❌ | — | Filter by affected sector/domain, e.g. oil_gas, banking |
| level | enum (global, country, domain, action) | ❌ | — | Filter by analysis level in the causal hierarchy |
| fromDate | string (ISO 8601) | ❌ | — | Start of date range (e.g. 2026-01-01) |
| toDate | string (ISO 8601) | ❌ | — | End of date range (e.g. 2026-12-31) |
| limit | number (1-50) | ❌ | 10 | Maximum number of entries to return (default: 10) |

## Returns

Formatted plain-text output:

```
Analysis History — 8 entries

[GLOBAL] 2026-05-05 15:30 | bullish | impact 8.2/10 up
  VN Market Macro: Dong tang GDP va…
  FED cuts rates trigger risk-on in …

[DOMAIN] 2026-05-04 12:15 | neutral | impact 6.5/10 neutral
  Banking Sector Outlook
  Interest rate hold maintains margin …
```

## Usage

```json
{
  "tool_name": "get_analysis_history",
  "input": {
    "actionCode": "VCB",
    "domain": "banking",
    "level": "action",
    "fromDate": "2026-04-01",
    "toDate": "2026-05-05",
    "limit": 10
  }
}
```

## Notes

- Levels: global (macro), country (VN market), domain (sector), action (stock)
- Sentiment: bullish, bearish, neutral
- Impact score: 0–10 with direction (up, neutral, down)
- Summary truncated at 120 chars
- Useful for tracking historical reasoning and causal chains
