# Tool Package — QA Responder

**Location:** `docs/agents/tools/package/qa-responder.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-15

## How to Invoke Tools

All VN Market MCP tools are accessed via the MCP gateway `call_tool` (server="vn-market").
Server name: **`vn-market`** (exact, no variants).

```
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

⚠️ **Wrong** → ~~`tool_name`~~ use `tool` | ~~`input`~~ use `arguments` | ~~`vnmarket-mcp`~~ use `"vn-market"`

For detailed parameters and return signatures: `docs/agents/tools/list/<tool_name>.md`

---

## Tools — QA Responder

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "qa-responder"` |

### User Questions & Answers
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_pending_ask_questions` | Fetch pending questions from user ask-queue | — |
| `answer_ask_question` | Provide answer and send response | `question_id: string, answer: string, sources?: string[]` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_market_context` | Market snapshot, trading window, VN-Index status | — |
| `get_market_snapshot` | Price, volume, sector sentiment, trading halt status | — |
| `get_watchlist` | Current watchlist tickers and metadata | — |

### Financial Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_kinhdich_reading` | Hexagram reading for specific stock | `ticker: string` |
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `ticker: string, period?: string` |
| `get_insider_transactions` | Detailed insider transaction history | — |

### Macro & Prediction
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_macro_snapshot` | Macro environment (rates, FX, credit, inflation) | — |
| `get_prediction_markets` | Market-wide prediction accuracy by signal type | — |

### Risk & Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_crisis_early_warning` | Crisis velocity, mention spikes, severity trends | — |

### QA-Specific Tools
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `run_qa_responder` | Execute QA responder cycle (process pending questions) | — |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle lifecycle — **two-call pattern required** (see recipe below) | Call 1: `agent_name, status: "running"` → `{ id }`. Call 2: `agent_name, id, status: "completed"\|"error", summary?, findings?, actions?` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

#### `log_agent_work` — Two-Call Recipe

```
// Call 1 — session START (at top of cycle, before any work)
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "qa-responder",
  "status": "running"
})
// startResult → { "id": <number> }
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (at bottom of cycle, after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "qa-responder",
  "id": logId,
  "status": "completed",
  "summary": "one-line description of what was done",
  "findings": "optional: signals found, alerts fired, etc.",
  "actions": ["optional: list of actions taken"]
})
// Returns → { "ok": true, "id": <number> }
```

**Error path:** if cycle errors, pass `status: "error"` in Call 2 instead of `"completed"`. The `id` from Call 1 is always required for Call 2.

---

## Question Categories

QA Responder handles user questions about:

- **Stock Analysis:** BCTC, insider activity, technical patterns
- **Portfolio:** Holdings, risk, rebalancing recommendations
- **Market:** Sector rotation, macro conditions, trading halts
- **Predictions:** Forecast outlook, confidence levels
- **System:** Tool availability, data freshness, alert accuracy

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ❌ | Not used |
| **work** | ✅ | Cycle completion, response summaries |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap
const bootstrap = await call_tool(
  server: "vn-market", tool: "get_cycle_bootstrap",
  arguments: { agent_name: "qa-responder" }
);

if (bootstrap.market_context?.trading_window === "closed") {
  // Can still answer questions during closed market
}
```

### Processing Pending Questions

```typescript
// Execute full QA cycle
const result = await call_tool(
  server: "vn-market", tool: "run_qa_responder",
  arguments: {}
);

// result contains:
// - questions_processed: number
// - responses_sent: number
// - errors: Error[]
```

### Manual Question Processing

```typescript
// Fetch pending questions
const pending = await call_tool(
  server: "vn-market", tool: "get_pending_ask_questions",
  arguments: {}
);

for (const question of pending.questions) {
  let answer = "";
  let sources = [];

  // Route question to appropriate analysis
  if (question.category === "stock_analysis") {
    const bctc = await call_tool(
      server: "vn-market", tool: "get_bctc_full",
      arguments: { ticker: question.ticker }
    );
    sources.push(`BCTC: ${bctc.filing_date}`);
    answer = `Based on latest BCTC (${bctc.period}): Revenue ${bctc.revenue}, Profit ${bctc.profit}...`;
  }

  else if (question.category === "portfolio") {
    // Portfolio analysis
  }

  else if (question.category === "market") {
    const market = await call_tool(
      server: "vn-market", tool: "get_market_snapshot",
      arguments: {}
    );
    sources.push(`Market snapshot: ${market.timestamp}`);
    answer = `Current VN-Index: ${market.index_value}...`;
  }

  // Send answer
  await call_tool(
    server: "vn-market", tool: "answer_ask_question",
    arguments: {
      question_id: question.id,
      answer: answer,
      sources: sources
    }
  );
}
```

### Answering Stock Analysis Questions

```typescript
// User asks: "What's VCB's latest financial situation?"
const question = pending.questions[0]; // VCB analysis

const bctc = await call_tool(
  server: "vn-market", tool: "get_bctc_full",
  arguments: {
    ticker: "VCB",
    period: "Q1"
  }
);

const insider = await call_tool(
  server: "vn-market", tool: "get_insider_transactions",
  arguments: {}
);

const kinhdich = await call_tool(
  server: "vn-market", tool: "get_kinhdich_reading",
  arguments: { ticker: "VCB" }
);

const answer = `VCB Q1 2026 Financial Summary:
- Revenue: ${bctc.snapshot.revenue} tỷ VND
- Net Profit: ${bctc.snapshot.profit} tỷ VND
- Growth YoY: ${bctc.comparison.YoY_growth}
- Insider Activity: ${insider.recent_count} transactions
- Market Hexagram: ${kinhdich.hexagram_id} (${kinhdich.meaning})`;

await call_tool(
  server: "vn-market", tool: "answer_ask_question",
  arguments: {
    question_id: question.id,
    answer: answer,
    sources: ["BCTC", "Insider Database", "Kinh Dich"]
  }
);
```

### Answering Portfolio Questions

```typescript
// User asks: "Should I rebalance my portfolio?"
// (This would normally come from unified-agent, but QA can answer about it)

const question = pending.questions[0];
const answer = `Based on current market conditions, a portfolio rebalance may be advisable. Please check the latest rebalancing signals in the market channel for specific recommendations.`;

await call_tool(
  server: "vn-market", tool: "answer_ask_question",
  arguments: {
    question_id: question.id,
    answer: answer,
    sources: ["Portfolio Risk Analysis"]
  }
);
```

### Answering Macro/Prediction Questions

```typescript
// User asks: "What's the market outlook?"
const macro = await call_tool(
  server: "vn-market", tool: "get_macro_snapshot",
  arguments: {}
);

const predictions = await call_tool(
  server: "vn-market", tool: "get_prediction_markets",
  arguments: {}
);

const answer = `Market Outlook:
- Macro Environment: Interest rates ${macro.interest_rate}, FX ${macro.fx_rate}
- Prediction Accuracy: ${predictions.overall_accuracy}%
- Current Theme: Based on Kinh Dich hexagram readings`;

await call_tool(
  server: "vn-market", tool: "answer_ask_question",
  arguments: {
    question_id: question.id,
    answer: answer,
    sources: ["Macro Data", "Prediction Models"]
  }
);
```

---

## Task-Lock Coordination Tools (Phase 2 Ready)

Tool ready — flow-level claim/heartbeat wiring lands in Phase 2/3 (not yet active in cycle.md).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim a coordination lock before exclusive work | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew a held lock every 5 min (prove-alive) | `task_id` |
| `task_release` | Release lock on completion | `task_id` |
| `task_list_held` | List held locks for debug/audit | `kind?, owner_agent?, expired?` |

Full protocol: `docs/protocols/task-lock-protocol.md` | Skill: `.claude/skills/task-lock/SKILL.md`

---

## Related Documentation

- **All Tools Index:** `docs/agents/tools/list/README.md`
- **Ask Queue Protocol:** `docs/protocols/ask-queue-protocol.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
