---
name: post_agent_signal
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# post_agent_signal

Post a signal to the agent coordination bus. Agents use this to share findings (news events, price confirmations, fundamental validations) that participate in the enrichment chain. The chain synthesizer automatically forms causal chains when 2+ agents post about the same stock in the same 15-min cycle. Signals expire after ttl_minutes and are automatically cleaned up.



## Arguments

- **from_agent** (string) — **required**
  - Name of agent posting the signal (e.g., "news-scout", "market-watcher", "financial-analyst")

- **signal_type** (enum) — **required**
  - Type of signal: `urgent_news`, `price_anomaly`, `chain_catalyst`, `fundamental_validation`, `verified_chain`, `legal_risk`, `crisis_velocity`, `suppress`, `verified_decision`, `price_confirmation`

- **stock_code** (string) — **required**
  - Vietnamese stock ticker (e.g., "ACB", "BID", "HPG", "VNM")

- **payload** (object) — **required**
  - Signal data structure (varies by signal_type)
  - Examples: `{ impact_score: 8.5, headline: "...", timestamp: ... }` for urgent_news

- **cycle_id** (string) — optional
  - Unique cycle identifier; if omitted, server assigns current cycle

- **to_agent** (string) — optional
  - Target agent for direct signal (e.g., "alert-commander"); if omitted, all agents can see via get_agent_signals

- **finding_data** (object) — optional
  - Detailed analysis context; persisted with signal for downstream agents

- **causal_ref** (string) — optional
  - Reference to prior signal to form causal chain

- **chain_depth** (integer) — optional
  - Depth in causal chain (incremented by chain synthesizer)

- **ttl_minutes** (integer) — optional
  - Time-to-live; signal auto-deleted after ttl_minutes (default: 15 min)

## Return Type

`{ signal_id: string, accepted: boolean, cycle_id: string, error?: string }`

## Example Usage

### News Scout — Urgent News Signal
```typescript
const result = await call_tool("vn-market", "post_agent_signal", {
  from_agent: "news-scout",
  signal_type: "urgent_news",
  stock_code: "ACB",
  payload: {
    headline: "ACB acquires fintech startup for $50M",
    source: "CafeF News",
    impact_score: 8.5,
    sentiment: 0.8,
    timestamp: "2026-05-04T10:35:00Z"
  },
  ttl_minutes: 15
});
// Returns: { signal_id: "sig_abc123", accepted: true, cycle_id: "cycle_2026050410" }
```

### Market Watcher — Price Anomaly Signal
```typescript
const result = await call_tool("vn-market", "post_agent_signal", {
  from_agent: "market-watcher",
  signal_type: "price_anomaly",
  stock_code: "BID",
  to_agent: "alert-commander",
  payload: {
    current_price: 28.5,
    prev_close: 27.8,
    move_percent: 2.5,
    zscore: 2.3,
    volume_spike: true,
    volume_ratio: 1.8
  },
  ttl_minutes: 10
});
```

### Financial Analyst — Fundamental Validation Signal
```typescript
const result = await call_tool("vn-market", "post_agent_signal", {
  from_agent: "financial-analyst",
  signal_type: "fundamental_validation",
  stock_code: "VNM",
  causal_ref: "sig_xyz789",
  payload: {
    bctc_finding: "Q1 2026 revenue +15% YoY, beat guidance",
    confidence: 0.92,
    earnings_beat: true,
    validation: "confirmed"
  },
  finding_data: {
    revenue_2025q1: 45200000000,
    revenue_2026q1: 51980000000,
    eps_beat_percent: 8.5
  },
  ttl_minutes: 20
});
```

### Chain Catalyst Signal (News Scout → Alert Commander)
```typescript
const result = await call_tool("vn-market", "post_agent_signal", {
  from_agent: "news-scout",
  signal_type: "chain_catalyst",
  stock_code: "ACB",
  to_agent: "alert-commander",
  payload: {
    event: "Central Bank cuts rates by 50bps",
    impact_chain: {
      macro: "banking sector bullish",
      sector: "ACB benefits from lower funding costs",
      stock: "acb_buy_signal"
    },
    cascade_confidence: 0.85,
    affected_watchlist: ["ACB", "CTG", "VIB", "TPB"]
  },
  ttl_minutes: 30
});
```

## When to Use

**Key Signal Types & When:**

| Signal | From | When | Triggers |
|--------|------|------|----------|
| `urgent_news` | News Scout | Impact >= 8/10 detected | Market Watcher + Alert Commander review |
| `price_anomaly` | Market Watcher | >2σ move detected | Alert Commander evaluates → fire if verified |
| `chain_catalyst` | News Scout | Impact >= 7, causal chain clear | Financial Analyst validates fundamentals |
| `fundamental_validation` | Financial Analyst | BCTC signal confirms/contradicts catalyst | Alert Commander + Digest use for synthesis |
| `verified_chain` | Server (synthesizer) | 2+ agent confirmations | Alert Commander fires verified_decision alert |

## Signal Bus Architecture (mcp-tools.md)

Signals flow through inter-agent communication layer:
1. **Origination**: Individual agent posts signal (post_agent_signal)
2. **Discovery**: Other agents retrieve via get_agent_signals (filters by type, stock, cycle)
3. **Synthesis**: Server forms chains when 2+ agents signal same stock in 15-min window
4. **Action**: Alert Commander fires → send_telegram(market)

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `invalid_signal_type` | typo in signal_type enum | Check mcp-tools.md inter-agent section |
| `stock_not_in_watchlist` | stock_code doesn't exist | Verify stock is in watchlist or post as exploratory |
| `cycle_expired` | cycle_id too old (>24h) | Omit cycle_id; server assigns current |
| `ttl_too_long` | ttl_minutes > 1440 | Cap at 24h; signals are near-term only |

## Notes

- Signals are ephemeral coordination mechanism (not historical archive)
- Server synthesizer auto-forms causal chains: if News Scout + Financial Analyst both signal ACB in same 15-min cycle → sends verified_chain to Alert Commander
- From `.claude/knowledge/mcp-tools.md`: signal types and flows defined there
- Always include `timestamp` in payload for audit trail
- Use `to_agent` sparingly; default (no to_agent) → all agents see signal

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — all args, signal types, chain examples, synthesis flow)
