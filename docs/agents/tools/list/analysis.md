# Analysis MCP Tools

## Summary

**Category:** Analysis
**Module:** `apps/mcp-server/src/interface/mcp/tools/analysis/`
**Tools:** 2 (core + experimental)

Tools for sequential market thinking and step-by-step causal analysis. Designed to support complex reasoning tasks that require multiple thought steps, branching scenarios, and hypothesis validation.

---

## Core Tool

### 1. `sequential_market_analysis`

**File:** `sequential-market-analysis.ts`
**Type:** Reasoning/thinking tool (Claude-native extended thinking support)

Provides structured step-by-step thinking for complex market analysis tasks. Implements branching, revision, and hypothesis tracking.

#### Use Cases

| Analysis Type | Description | Example |
|---|---|---|
| `causal_chain` | Global event → macro → sector → stock impact | "US rate hike → USD/VND pressure → banking stocks at risk" |
| `bctc_deep_dive` | Detailed financial statement analysis | "Revenue grew 10% YoY but margins compressed 2pp — investigate COGS" |
| `signal_verification` | Multi-source signal confirmation | "Price breakdown + insider selling + BCTC deterioration = strong SELL" |
| `portfolio_risk` | Correlation, concentration, scenario analysis | "Portfolio 40% banking, 25% steel — 95% correlated to index volatility" |
| `hypothesis_test` | Propose and validate trading ideas | "Hypothesis: FPT oversold due to sector rotation, not fundamentals" |

#### Input Schema

```typescript
{
  analysisType: "causal_chain" | "bctc_deep_dive" | "signal_verification" | "portfolio_risk" | "hypothesis_test",

  thought: string,          // Current analytical thought step
  thoughtNumber: number,    // Step number (1, 2, 3, ...)
  totalThoughts: number,    // Estimated total steps needed (can adjust)
  nextThoughtNeeded: boolean, // Proceed to next step?

  context: {
    stocks?: string[],      // ["VCB", "HPG"]
    sectors?: string[],     // ["banking", "steel"]
    event?: string,         // "US rate hike"
    dataPoints?: object,    // { vcb_pe: 12.5, sector_pe: 14.2, ... }
  },

  isRevision?: boolean,     // Revise previous thought?
  revisesThought?: number,  // Which step?

  branchFromThought?: number, // Create bull/bear/base scenarios?
  branchId?: string,        // "bull", "bear", "base"

  hypothesis?: string,      // Proposed solution (mid-analysis)
  confidence?: number,      // 0.0 … 1.0 (current confidence in hypothesis)
}
```

#### Output Schema

```typescript
{
  analysisType: string,
  thoughts: Array<{
    thoughtNumber: number,
    totalEstimate: number,
    content: string,
    isRevision: boolean,
    branchId?: string,
    timestamp: Date,
  }>,
  finalHypothesis: string,
  confidence: number,
  affectedStocks: string[],
  affectedSectors: string[],
  recommendations: string[],
}
```

#### Key Features

**Step-by-Step Progression**
- Start with `thoughtNumber=1`, estimate total steps
- Each step can revise, expand, or branch
- Dynamically adjust `totalThoughts` as understanding deepens

**Branching & Scenarios**
- Create bull/bear/base cases by setting `branchFromThought`
- Each branch tracked separately with `branchId`
- Rejoin branches at hypothesis stage

**Revision Support**
- Set `isRevision=true` to reconsider a prior step
- Original thought preserved, new version tracked
- Allows non-linear reasoning

**Hypothesis Generation**
- Mid-analysis, propose a solution (`hypothesis`)
- Attach confidence (0.0 … 1.0)
- Validate hypothesis against remaining data points

**State Tracking**
- All thoughts stored in session
- References to prior thoughts enable follow-up analysis
- Supports "revises thought #3" patterns

---

## Example Analysis Flow

### Causal Chain: Rate Hike Impact

```
Thought 1 (USD/VND pressure): "US Fed raised rates 25bp. USD/VND typically widens 3-5 VND per 50bp hike."
→ nextThoughtNeeded=true

Thought 2 (Banking sector concern): "Higher USD → portfolio FX pressure. VCB, ACB, BID have net long USD positions."
→ nextThoughtNeeded=true

Thought 3 (Deposit flight risk): "Rising rates attract USD deposits from institutions. Might reduce VND lending."
→ nextThoughtNeeded=true, branchFromThought=3, branchId="bear"

Thought 4 (Bear branch): "Stress scenario: if VND deposits fall 5%, NIM compression −30bp. ROE falls 3-5pp."
→ Hypothesis: "Banking stocks 5-8% downside in next 2 weeks"
→ confidence=0.72

(Alternative branch: "Bull case — higher rates allow higher lending rates, NIM expands")
→ Hypothesis: "Banking stocks hold; re-rate higher if macro stabilizes"
→ confidence=0.65
```

---

## Implementation

### Function Signature

```typescript
export function createSequentialMarketAnalysisTool() {
  const analysisState = new Map<string, AnalysisResult>();

  return {
    schema: sequentialMarketAnalysisSchema,
    description: "...",
    handler: async (input: SequentialMarketAnalysisInput) => {
      // Track state, update thoughts, validate branching
      return result;
    }
  };
}
```

### State Management

- **Session-scoped:** Each user/agent maintains separate `analysisState`
- **In-memory:** No DB persistence (analysis = ephemeral reasoning)
- **Thought replay:** Can reconstruct full reasoning chain from output

### Validation

- `thoughtNumber` must be sequential (1, 2, 3, ...)
- `totalThoughts` can increase (e.g., 3 → 5) but not decrease mid-stream
- `branchId` must be unique within same branch
- `revisesThought` must reference existing thought number

---

## Database Tables

**None.** Sequential analysis is **ephemeral** (session-scoped, in-memory only).

To persist an analysis:
- Export thoughts as JSON
- Store in a notes/research table manually
- Or use agent notebook (`docs/agent-memory/notebooks/*.md`)

---

## Metrics & Confidence

### Confidence Scoring

| Level | Meaning | Example |
|-------|---------|---------|
| 0.9+ | Very high confidence | "Banking stocks down 10% if rates spike 100bp (historical correlation 0.92)" |
| 0.7-0.9 | Good confidence | "FPT dividend yield 2.5%, above 2% hurdle — likely rally" |
| 0.5-0.7 | Moderate confidence | "Sector rotation likely, but timing unclear" |
| 0.3-0.5 | Low confidence | "Speculative: insider buying might precede announcement" |
| <0.3 | Very low confidence | "Rumor-based only, no fundamental confirmation" |

### Building Confidence

1. **Data validation:** Each thought checks against DB facts
2. **Multi-source:** Combine BCTC, price, sentiment, sector data
3. **Stress testing:** Vary assumptions, check sensitivity
4. **Historical precedent:** "This happened X times before, outcome Y" increases confidence

---

## Integration with Market Agents

### cowork (Unified Agent)

Uses `sequential_market_analysis` for:
- Deep-dive signal validation before Telegram alerts
- Scenario testing (bull/bear/base) for portfolio recommendations
- Causal chain analysis for complex correlations

### market-analyst

Uses for:
- BCTC analysis before generating financial insights
- Signal hypothesis testing (price action + news + insider)

### ta-expert

Uses for:
- Multi-timeframe confluence analysis
- Supply/demand zone validation across timeframes

---

## Related Tools

- `get_bctc_full` — Fetch financial data for BCTC deep-dive
- `ta_alert_scan` — TA signal confirmation for `signal_verification`
- `get_kinhdich_reading` — Hexagram signal for `hypothesis_test`
- `compare_backtest_runs` — Validate hypothesis against backtest results

---

## Error Handling

### Invalid Thought Sequence

```
Error: thoughtNumber must be sequential. Expected 3, got 5.
```

### Circular Revision

```
Error: Cannot revise thought that revises another thought. Chain depth limit 3.
```

### Unknown Branch Reference

```
Error: branchFromThought=5 does not exist.
```

### Inconsistent Confidence

```
Warning: Confidence increased from 0.45 (thought 3) to 0.65 (thought 4) — unusual. Verify logic.
```

---

## Vietnamese Notes

- **Phân tích nhân quả** = Causal chain analysis
- **Phân tích sâu BCTC** = Deep BCTC analysis
- **Xác minh tín hiệu** = Signal verification
- **Quản lý rủi ro danh mục** = Portfolio risk management
- **Kiểm định giả thuyết** = Hypothesis testing

---

## Implementation Notes

- **No network calls:** All reasoning is local (uses cached data)
- **Stateless handlers:** Each call is independent; state passed in input
- **Branching limit:** Max 3 concurrent branches per analysis (prevent explosion)
- **Thought limit:** Max 20 thoughts per analysis (encourage conciseness)
- **Revision depth:** Max 3 levels of revision chains (prevent loops)

---

## Experimental Features

### 2. `sequential_thinking` (Planned)

**Status:** Design phase
**Purpose:** Generic step-by-step thinking for non-market tasks

Not yet implemented. Placeholder for future expansion beyond market-specific reasoning.

---

## Advanced Use Cases

### 1. Portfolio Rebalancing Decision

**Analysis Type:** `portfolio_risk`

```
Thought 1: "Current allocation: 40% banking, 25% steel, 35% tech"
Thought 2: "Banking correlation to VNINDEX: 0.92 (very high)"
Thought 3: "Steel correlation: 0.78 (high)"
Thought 4: "Tech correlation: 0.45 (low) — diversifier"
Thought 5: "Recommendation: Increase tech to 45%, reduce banking to 30%"
Hypothesis: "Rebalanced portfolio volatility drops 8-10%"
Confidence: 0.78
```

### 2. Earnings Surprise Analysis

**Analysis Type:** `bctc_deep_dive`

```
Thought 1: "VCB Q1 2025 revenue +12% YoY"
Thought 2: "But cost of funds up 40bp (interest expenses rising)"
Thought 3: "Gross NIM likely fell 30-50bp despite revenue growth"
Thought 4: "Check: historical ratio of revenue growth to NIM change"
Thought 5: "If NIM fell 50bp, ROE might be flat despite topline growth"
Hypothesis: "Stock overvalued on revenue surprise; earnings miss likely"
Confidence: 0.68
```

### 3. Macro Shock Scenario

**Analysis Type:** `causal_chain` with branching

```
Thought 1: "Assume oil price falls 20% (global recession)"
Branch: "Bear case" (branchFromThought=1, branchId="bear")

Thought 2 (bear): "Lower energy costs → inflation pressure eases"
Thought 3 (bear): "VND weakens (carry unwind)"
Thought 4 (bear): "Banking stocks down 15%, steel stocks down 25%"

Branch: "Bull case" (branchFromThought=1, branchId="bull")
Thought 2 (bull): "Lower oil → global growth stabilizes"
Thought 3 (bull): "Risk appetite returns, VND strengthens"
Thought 4 (bull): "Tech stocks outperform, banking flat"

Rejoin: "Most likely outcome: bear case (70% prob), bull case (30% prob)"
```

---

## Testing

### Unit Test Example

```typescript
describe("Sequential Market Analysis", () => {
  it("tracks thought sequence and validates numbering", async () => {
    const tool = createSequentialMarketAnalysisTool();

    const thought1 = await tool.handler({
      analysisType: "causal_chain",
      thought: "US rates rose 50bp",
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });

    expect(thought1.thoughts).toHaveLength(1);
    expect(thought1.thoughts[0].thoughtNumber).toBe(1);
  });

  it("rejects non-sequential thought numbers", async () => {
    // ...expect error when thoughtNumber jumps
  });

  it("supports branching and merging", async () => {
    // ...create bull/bear branches, rejoin with hypothesis
  });
});
```

