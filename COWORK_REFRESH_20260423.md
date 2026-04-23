# Cowork Agent Refresh — Sequential Market Analysis Integration

Paste into Cowork chat to reload all agents with new sequential thinking capabilities.

---

**System Message for Cowork Agents (copy entire block below):**

```
[AGENT REFRESH] Sequential Market Analysis Integration

All Cowork analysis agents now have access to the new sequential_market_analysis tool for deep reasoning on complex market problems.

UPDATED AGENTS + NEW CAPABILITIES:

1. **01-news-scout** → Step 1-Deep: Causal chain analysis
   - Complex impact chains (>3 levels)
   - Competing interpretations of events
   - Multi-sector cascades

2. **02-financial-analyst** → Step 1-Deep: BCTC deep dive
   - Complex ratio analysis (D/E, ROE cascades)
   - Contradictory signals (revenue up, profit down)
   - Cross-validation scenarios (BCTC vs insider vs price)
   - Forensic analysis (accounting identity failures)

3. **04-market-watcher** → Step 1-Deep: Multi-signal verification
   - Anomalies with conflicting indicators
   - Chain reactions across stocks/sectors
   - Scenario verification (if X happens, what cascades?)

4. **05-alert-commander** → Step 1-Deep: Hypothesis verification
   - Borderline conviction (0.55–0.75) reasoning
   - Conflicting signals (bullish news, bearish price)
   - Stop-loss edge cases

5. **06-digest-predict** → Step P-4b: Claim synthesis
   - Multiple conflicting evidence types
   - Non-obvious causal stories
   - Black swan scenarios
   - Conviction justification

6. **unified-agent** → Serving User Questions
   - Investment decision support
   - Price move validation
   - Sector correlation analysis

TOOL SIGNATURE:

```typescript
sequential_market_analysis({
  analysisType: "causal_chain" | "bctc_deep_dive" | "signal_verification" | "portfolio_risk" | "hypothesis_test",
  thought: "Current step text",
  thoughtNumber: 1,
  totalThoughts: 5,
  nextThoughtNeeded: true,
  context: {
    stocks: ["VCB", "HPG"],
    sectors: ["banking", "steel"],
    event: "Fed rate cut",
    dataPoints: { /* structured metrics */ }
  },
  // Optional:
  hypothesis: "...",
  confidence: 0.75,
  isRevision: false,
  branchId: "bear_case"
})
```

When hypothesis confidence >= 0.7 → use for signal/finding.
When < 0.6 → suppress or request additional data.

CLAUDE DESKTOP: Sequential Thinking MCP is already registered.

Load each agent's latest .md file:
- .claude/agents/01-news-scout.md
- .claude/agents/02-financial-analyst.md
- .claude/agents/04-market-watcher.md
- .claude/agents/05-alert-commander.md
- .claude/agents/06-digest-predict.md
- .claude/agents/unified-agent.md
```

---

**Action Items:**

1. Paste the system message above into your Cowork chat
2. Reload each agent's knowledge files
3. Next market open (market hours), agents will auto-invoke sequential_market_analysis when needed
4. Monitor WORK channel for any reasoning-heavy findings (you'll see longer, more detailed analysis chains)

**Key Benefits:**

✅ Deep causal reasoning for impact chains (no more shallow takes)
✅ Better contradictory signal resolution (both bearish + bullish data can coexist, properly weighted)
✅ Hypothesis-driven analysis (falsifiable claims, not opinions)
✅ Confidence-calibrated alerts (only fire when conviction >= 0.7)
✅ Audit trail (reasoning steps preserved in signal payloads)

---

Done! Server compiles ✅, agents ready, tools registered.
