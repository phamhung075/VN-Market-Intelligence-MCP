---
name: log_agent_work
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# log_agent_work

Log an agent work session lifecycle event. Use status='running' at session start (returns { id }). Use status='completed' or status='error' at session end, passing the id returned by the start call.



## Return Type

`{ success: boolean, id: string, session_id?: string, persisted_at: string }`

## Example Usage

### Alert Commander — Cycle End Logging
```typescript
const result = await call_tool("vn-market", "log_agent_work", {
  agent_name: "alert-commander",
  status: "completed",
  summary: "Processed 5 signals; fired 2 position-danger alerts to MARKET channel.",
  findings: [
    "ACB stop-loss hit (26.50 VND)",
    "VNM watchlist-opportunity confirmed (70% conviction)"
  ],
  actions: [
    "Sent 2 MARKET channel alerts",
    "Posted verified_decision signal",
    "Recorded signal outcomes"
  ]
});
```

### News Scout — Cycle End
```typescript
const result = await call_tool("vn-market", "log_agent_work", {
  agent_name: "news-scout",
  status: "completed",
  summary: "Fetched 47 articles; 3 high-impact events detected (impact >= 8).",
  findings: [
    "Central Bank rate cut (macro bullish)",
    "ACB acquisition (impact 8.5/10)"
  ],
  actions: [
    "Posted 3 urgent_news signals",
    "Ran impact_chain on macro event"
  ]
});
```

## When to Use

- **At cycle end** — Every agent logs after completing work
- **Status tracking** — Completed/failed/skipped tells the story of each cycle
- **Audit trail** — Persisted for agent notebooks + long-term history

## Status Codes

| Status | Meaning | When |
|--------|---------|------|
| `completed` | Cycle finished normally | All work done, no errors |
| `failed` | Cycle aborted | Error during processing |
| `skipped` | Cycle not run | Off-hours, no data, etc. |

## Notes

- **Every agent must log** — Final step of all agent flows
- **Findings ≠ alerts** — Findings are discoveries; actions show what was sent to users/team
- **Plain text only** — No Markdown; "-" lines auto-bulleted in notebooks
- **Batch at end** — Log once per cycle, not mid-flow

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — status codes, examples, persistence)
