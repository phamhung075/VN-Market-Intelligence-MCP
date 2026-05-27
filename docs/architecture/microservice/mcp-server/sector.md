# Tool Group: sector (mcp-server)

**Module path:** `src/interface/mcp/tools/sector/`
**Scheduler:** none (on-demand only)
**Domain services:** sectorRotationDetector, sectorValuationComparator, creditFlowAnalyzer, energyMarketAnalyzer, pharmaEventMapper, tradeRelationships, sectorPeers

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_sector_comparison` | Sector performance comparison | sectors[], days? | market.db + sectorValuationComparator |
| `get_sector_rotation` | Sector rotation signals | — | sectorRotationDetector |
| `get_supply_chain_exposure` | Supply chain risk for a ticker | ticker | tradeRelationships + market.db |
| `get_climate_risk_signals` | Climate/ESG risk signals by sector | sector? | market.db |
| `get_energy_grid_signals` | Energy sector signals | — | energyMarketAnalyzer |
| `get_pharma_signals` | Pharma sector event signals | — | pharmaEventMapper |
| `get_credit_flow_signals` | Credit flow analysis (banking sector) | — | creditFlowAnalyzer |
| `get_legal_risk_signals` | Legal/regulatory risk signals | ticker? | market.db (news_items, broker_sanctions) |
| `get_public_investment_signals` | Public investment announcements | — | market.db (news_items) |
| `compare_stocks` | Multi-metric stock comparison | tickers[] | market.db + domain services |

---

## Invariants

1. Sector classifications and peer groups: `docs/data/stock-classification.json`.
2. Supply chain exposure maps: `tradeRelationships.ts` domain service — VN export/import dependency analysis.
3. `get_legal_risk_signals` sources: news prosecution/tax items + broker_sanctions table.
4. No scheduler jobs — all sector tools are on-demand (agent-triggered).
