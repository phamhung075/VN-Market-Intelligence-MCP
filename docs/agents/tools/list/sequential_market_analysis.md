# sequential_market_analysis

**Category:** Analysis

**Module:** `apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts`

## Purpose

Deep market analysis using sequential thinking for complex reasoning tasks: causal chain analysis (global → sector → stock), BCTC deep financial analysis, multi-signal verification chains, portfolio risk assessment, and signal hypothesis generation & validation.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `analysisType` | enum | Yes | — | Type of analysis: `causal_chain`, `bctc_deep_dive`, `signal_verification`, `portfolio_risk`, `hypothesis_test` |
| `thought` | string | Yes | — | Current analytical thinking step |
| `thoughtNumber` | integer | Yes | — | Current thought step number (1, 2, 3, ...) |
| `totalThoughts` | integer | Yes | — | Estimated total thoughts needed (can adjust up/down) |
| `nextThoughtNeeded` | boolean | Yes | — | Whether another thinking step is required |
| `context` | object | No | {} | Analysis context with optional `stocks` (array), `sectors` (array), `event` (string), `dataPoints` (object) |
| `isRevision` | boolean | No | false | Whether this thought revises previous analysis |
| `revisesThought` | integer | No | — | Which thought number is being reconsidered |
| `branchFromThought` | integer | No | — | Thought number where this analysis branches |
| `branchId` | string | No | — | Branch identifier for alternative scenarios |
| `hypothesis` | string | No | — | Solution hypothesis (generated mid-analysis) |
| `confidence` | number | No | — | Confidence in current hypothesis (0-1 scale) |

## Return Format

```
{
  "status": "thinking" | "complete",
  "thought": {
    "thoughtNumber": 1,
    "totalEstimate": 4,
    "content": "First analytical step...",
    "isRevision": false,
    "branchId": null,
    "timestamp": "2026-06-07T12:00:00Z"
  },
  "progress": "Analysis progress: 1/4 thoughts",
  "nextSteps": [
    "Continue with thought 2",
    "Build on current analysis"
  ]
}
```

When analysis is complete (status="complete"), `nextSteps` is undefined.

## Analysis Types

| Type | Purpose | Typical Thoughts |
|------|---------|-----------------|
| **causal_chain** | Trace global events → macro impact → sector impact → stock impact | 4-6 steps |
| **bctc_deep_dive** | Examine financial statements, ratios, trends, quality flags | 5-8 steps |
| **signal_verification** | Validate multi-source alerts (price, news, insider, BCTC) | 3-5 steps |
| **portfolio_risk** | Analyze correlations, VaR, concentration, scenario stress-tests | 4-7 steps |
| **hypothesis_test** | Propose and verify trading signals | 3-6 steps |

## Key Features

- **Revisions**: Change previous thoughts as understanding deepens by setting `isRevision=true` and `revisesThought=N`
- **Branching**: Explore alternative scenarios (bull/bear/base cases) with `branchId`
- **Dynamic adjustment**: Modify `totalThoughts` to continue beyond initial estimate
- **Confidence scoring**: Generate falsifiable hypotheses with 0-1 confidence
- **State tracking**: Tool maintains analysis state per session (analysisType + timestamp)

## Example Usage

```javascript
// Step 1: Start causal chain analysis
call_tool(
  server: "vn-market",
  tool: "sequential_market_analysis",
  arguments: {
    analysisType: "causal_chain",
    thought: "Fed raises rates 0.5% — will increase funding costs globally",
    thoughtNumber: 1,
    totalThoughts: 4,
    nextThoughtNeeded: true,
    context: {
      event: "Fed rate increase 0.5%",
      dataPoints: { fed_rate: 5.5, prior_rate: 5.0 }
    }
  }
)

// Step 2: Continue with thought 2
call_tool(
  server: "vn-market",
  tool: "sequential_market_analysis",
  arguments: {
    analysisType: "causal_chain",
    thought: "Higher rates weaken carry trade → outflow from Vietnam equities",
    thoughtNumber: 2,
    totalThoughts: 4,
    nextThoughtNeeded: true,
    context: {
      sectors: ["banking", "real_estate"],
      dataPoints: { carry_trade_position: "high", foreign_ownership: "25%" }
    }
  }
)

// Step 3: Form hypothesis after additional analysis
call_tool(
  server: "vn-market",
  tool: "sequential_market_analysis",
  arguments: {
    analysisType: "causal_chain",
    thought: "Banking sector most vulnerable due to high NIM exposure",
    thoughtNumber: 3,
    totalThoughts: 4,
    nextThoughtNeeded: true,
    hypothesis: "Sell VCB and TCB on further Fed rate guidance",
    confidence: 0.72,
    context: {
      stocks: ["VCB", "TCB"],
      dataPoints: { nim_sensitivity: "high", rate_beta: 1.8 }
    }
  }
)

// Step 4: Complete analysis
call_tool(
  server: "vn-market",
  tool: "sequential_market_analysis",
  arguments: {
    analysisType: "causal_chain",
    thought: "Recommendation: Monitor VCB/TCB for 2-week horizon",
    thoughtNumber: 4,
    totalThoughts: 4,
    nextThoughtNeeded: false
  }
)
```

## Recommendations Generation

When analysis completes, recommendations are auto-generated based on confidence:

| Confidence | Recommendation |
|-----------|-----------------|
| **≥ 0.8** | High confidence hypothesis |
| **0.6–0.79** | Moderate confidence — validate with additional signals |
| **< 0.6** | Low confidence — requires more data or analysis |

If affected stocks are tracked, recommendations include monitoring guidance.

## Branching & Revisions

### Branching Example: Bull vs. Bear Cases

```javascript
// Bull case branch (branchId="bull_case")
call_tool(..., {
  analysisType: "causal_chain",
  thought: "If Fed pauses rates, carry trade reverts",
  branchFromThought: 1,
  branchId: "bull_case",
  ...
})

// Bear case branch (branchId="bear_case")
call_tool(..., {
  analysisType: "causal_chain",
  thought: "If Fed accelerates, outflow accelerates",
  branchFromThought: 1,
  branchId: "bear_case",
  ...
})
```

### Revision Example

```javascript
// Revise thought 2 based on new data
call_tool(..., {
  analysisType: "causal_chain",
  thought: "Actually, FII position is moderate (18%, not 25%)",
  thoughtNumber: 2,
  totalThoughts: 4,
  isRevision: true,
  revisesThought: 2,
  ...
})
```

## Related Tools

- `run_impact_chain` — quick cascade analysis for headlines
- `get_bctc_full` — fetch BCTC data for financial deep dives
- `get_portfolio_risk` — portfolio-level risk metrics
- `post_agent_signal` — publish analysis findings as signals

## Notes

- Tool maintains in-memory analysis state per session (cleared on server restart)
- Sessions identified by `analysisType:timestamp` pattern
- Thoughts are accumulated; revisions filter out revisited steps and beyond
- Branch IDs allow parallel exploration without interfering
- Total thoughts can be adjusted upward during analysis (set `nextThoughtNeeded=true` even if current ≥ total)
- Empty `thought` parameter will error
- Confidence should reflect degree of belief in hypothesis (calibrated against historical accuracy)
