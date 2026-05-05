---
name: get_agent_signals
type: tool
package: digest-synthesis, unified-coordination, market-analysis
related_tools: post_agent_signal, record_signal_outcome
complexity: moderate
---

# get_agent_signals

Retrieve pending signals addressed to the given agent (or broadcast 'all'). **Signals are marked as read on retrieval.** Core component of inter-agent communication via signal bus.

## Arguments

- **agent** (string) — **required**
  - Target agent ID (e.g., "alert-commander") or "all" for broadcast signals (used by synthesis agents)

- **signal_type** (enum) — optional
  - Filter by signal type. Options: `urgent_news`, `price_anomaly`, `verified_chain`, `chain_catalyst`, `fundamental_validation`, `legal_risk`, `crisis_velocity`, `suppress`, `verified_decision`, `price_confirmation`
  - If omitted, return all signal types

- **limit** (number) — optional, default: 50
  - Max signals to return. Helps pagination for high-volume signal periods.

## Return Type

```typescript
{
  success: boolean,
  signals: Array<{
    id: string,
    from_agent: string,
    signal_type: string,
    confidence: number,  // 0-1
    timestamp: string,
    data: {
      // Contents vary by signal_type
      stocks?: string[],
      impact_score?: number,
      reasoning?: string,
      // ... signal-specific fields
    }
  }>,
  unread_count: number,
  total_count: number
}
```

## Example Usage

### Alert Commander — Cycle Start Signal Poll
```typescript
// Fetch all signals directed to alert-commander this cycle
const signals = await call_tool("vn-market", "get_agent_signals", {
  agent: "alert-commander",
  limit: 50
});

// Group by type for evaluation
const byType = {};
for (const sig of signals.signals) {
  if (!byType[sig.signal_type]) byType[sig.signal_type] = [];
  byType[sig.signal_type].push(sig);
}

console.log(`Received ${signals.signals.length} signals (${signals.unread_count} were unread)`);
// Process high-confidence urgent_news signals first
const urgentNews = byType.urgent_news?.filter(s => s.confidence >= 0.75) || [];
for (const news of urgentNews) {
  // Evaluate for market channel alert
  if (await shouldSendAlert(news)) {
    await call_tool("vn-market", "send_telegram", {
      channel: "market",
      message: formatAlert(news)
    });
    await call_tool("vn-market", "record_signal_outcome", {
      signal_id: news.id,
      outcome: "alert_sent",
      conviction: 0.78
    });
  }
}
```

### Digest & Predict — Broadcast Signal Gathering
```typescript
// Synthesis agent gathers all broadcast signals for daily digest
const allSignals = await call_tool("vn-market", "get_agent_signals", {
  agent: "all",  // Broadcast signals
  limit: 100
});

// Categorize by source agent and signal type
const signalMatrix = {};
for (const sig of allSignals.signals) {
  const key = `${sig.from_agent}:${sig.signal_type}`;
  if (!signalMatrix[key]) signalMatrix[key] = { count: 0, avg_confidence: 0, examples: [] };
  signalMatrix[key].count += 1;
  signalMatrix[key].avg_confidence = (signalMatrix[key].avg_confidence + sig.confidence) / 2;
  if (signalMatrix[key].examples.length < 2) signalMatrix[key].examples.push(sig);
}

// Include in digest
const digest = {
  signals_received: allSignals.signals.length,
  signal_matrix: signalMatrix,
  digest_time: new Date().toISOString()
};

await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: `📊 Daily Signal Digest\n${formatSignalDigest(digest)}`
});
```

### Unified Agent — QA Signal Processing
```typescript
// Unified agent (command center) monitors all signals for anomalies
const qaSignals = await call_tool("vn-market", "get_agent_signals", {
  agent: "unified-agent",
  signal_type: "legal_risk",  // Filter to legal risks
  limit: 25
});

// Log for QA analysis
console.log(`Legal risk signals this cycle: ${qaSignals.signals.length}`);
for (const sig of qaSignals.signals) {
  await call_tool("vn-market", "log_agent_work", {
    agent_name: "unified-agent",
    status: "completed",
    summary: `Legal risk assessment: ${sig.data.description}`,
    findings: [sig.data.legal_issue],
    actions: [`Logged legal_risk signal from ${sig.from_agent}`]
  });
}
```

## When to Use

- **At every agent cycle start** — Check for incoming signals from other agents
- **For inter-agent workflows** — When aggregating signals from upstream agents (news-scout → financial-analyst → alert-commander)
- **For synthesis** — Digest & Predict gathers "all" signals for daily briefing
- **For QA monitoring** — Unified Agent uses to track anomalies across all agents
- **NOT for single-shot queries** — If you need just one signal type, filter by `signal_type`

## Related Tools

| Tool | Use Case |
|------|----------|
| `post_agent_signal` | Send signals to other agents (you produce, this retrieves) |
| `record_signal_outcome` — Track whether signal led to alert/suppression |
| `get_agent_signals` itself — Called first to retrieve unread signals |
| `log_agent_work` — Log signal processing in session notebook |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `signals: []` | No pending signals | Proceed with normal cycle (no upstream data) |
| `unread_count > limit` | High volume, pagination needed | Call again with higher `limit` or larger time window |
| `from_agent: "unknown"` | Stale signal from deprecated agent | Log to WORK, skip if agent no longer active |
| `confidence: 0` | Low-confidence signal | Optional: skip or require 2nd confirmation |

## Notes

- **Auto-read:** Signals are marked read immediately on retrieval. No separate "mark as read" call needed.
- **Broadcast vs. unicast:** `agent: "all"` returns only broadcast signals. Unicast signals (to specific agent) are private.
- **Pagination:** Signals are sorted by recency (newest first). Use `limit` to control batch size.
- **Signal types:** See `.claude/knowledge/mcp-tools.md` for complete signal type reference.
- **Per-cycle check:** Usually called once per cycle at start. Multiple calls within same cycle return same signals (read on first call).

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — return schema, 3 workflow examples, filtering, pagination, error handling)
