# Tool Group: analysis (mcp-server)

**Module path:** `src/interface/mcp/tools/analysis/`
**Scheduler:** none (on-demand only)
**Domain services:** All domain services combined — TA + macro + news + cascade + signal synthesis

Individual tool signatures: `docs/agents/tools/list/analysis.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `sequential_market_analysis` | Multi-step market analysis: combines TA signals, macro context, news cascade, and Kinh Dich into a structured investment narrative | ticker, depth? | technical-analysis + macro-indicators + rag-service + kinh-dich-service + market.db |

---

## Design

`sequential_market_analysis` is the highest-level tool. It runs a sequential pipeline:
1. Price + OHLCV (market-data)
2. Technical indicators (technical-analysis svc)
3. Macro context (macro-indicators svc)
4. News + cascade (news-analysis)
5. Kinh Dich reading (kinh-dich svc)
6. Synthesize narrative with conviction score

Output is structured for agent consumption: separate sections per step, final recommendation with conviction level.

---

## Invariants

1. All downstream HTTP calls use circuit breakers.
2. Output format: structured object with sections — compatible with agent context injection.
3. On-demand only — no scheduled execution.
