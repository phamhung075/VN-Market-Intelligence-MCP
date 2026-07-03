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
| `get_credit_flow_signal` | Credit flow analysis (banking sector) | — | creditFlowAnalyzer |
| `get_legal_risk_signals` | Legal/regulatory risk signals | ticker? | market.db (news_items, broker_sanctions) |
| `get_public_contracts` | Public investment announcements | — | market.db (news_items) |
| `compare_stocks` | Multi-metric stock comparison | tickers[] | market.db + domain services |

---

## Invariants

1. Sector classifications and peer groups: `docs/data/stock-classification.json`.
2. Supply chain exposure maps: `tradeRelationships.ts` domain service — VN export/import dependency analysis.
3. `get_legal_risk_signals` sources: `alerts` table + `agent_signals` table (signal_type='legal_risk', news-scout bus).
4. No scheduler jobs — all sector tools are on-demand (agent-triggered).
5. FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK (2026-07-03): `get_legal_risk_signals` gained an additive, opt-in `hours_back` param (`legalRiskTools.ts`) — overrides the shared `days` (default 30, unchanged) with hour-granularity for callers that need a tighter bound. alert-commander passes `hours_back=6` to avoid re-surfacing a stale legal_risk event across many cycles; other consumers (bctc-analyst, digest-predict, unified-agent, fb-market-poster) omit it and keep the 30-day default.
