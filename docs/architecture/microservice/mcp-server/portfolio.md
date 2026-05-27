# Tool Group: portfolio (mcp-server)

**Module path:** `src/interface/mcp/tools/portfolio/`
**Scheduler:** `src/scheduler/portfolio/` (1 job)
**Domain services:** portfolioPnlCalculator, portfolioRiskCalculator, rebalancingCalculator, performanceAttribution, correlationCalculator

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_positions` | All current positions with live P&L | — | market.db (positions, pnl_snapshots) |
| `get_user_positions_for_analysis` | Positions formatted for agent analysis | — | market.db |
| `set_position` | Add or update a position | ticker, size, entry_price | market.db (positions) |
| `close_position` | Close an existing position | ticker | market.db (positions) |
| `get_portfolio_risk` | Portfolio risk score + metrics | — | portfolioRiskCalculator |
| `get_portfolio_conviction` | Conviction score per holding | — | convictionScorer + market.db |
| `get_rebalancing_signals` | Signals to rebalance toward target allocation | — | rebalancingCalculator + market.db |
| `get_target_allocation` | Current target allocation settings | — | market.db (target_allocations) |
| `get_performance_attribution` | P&L attribution by sector/factor | days? | performanceAttribution |
| `get_correlation_matrix` | Ticker correlation matrix | tickers[] | correlationCalculator + market.db |
| `get_bond_maturity_ladder` | Bond maturity schedule | — | market.db |
| `add_to_watchlist` | Add ticker to watchlist | ticker, sector | market.db |
| `remove_from_watchlist` | Remove ticker from watchlist | ticker | market.db |
| `get_watchlist` | Current watchlist with metadata | — | market.db |

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `weeklyPortfolioReportJob` | Weekly (Friday 17:00 VN) | Send portfolio performance report to Telegram |

---

## Invariants

1. Position ledger rules: see `docs/standards/portfolio-schema.md`.
2. Stop-loss formula and TP ladder: `docs/standards/portfolio-schema.md`.
3. Stock classification (sectors, peers): `docs/data/stock-classification.json`.
4. Alert policy for position-danger: `docs/policies/alert-policy.md`.
5. `get_user_positions_for_analysis` is formatted for Cowork agents (compact, analysis-ready).
