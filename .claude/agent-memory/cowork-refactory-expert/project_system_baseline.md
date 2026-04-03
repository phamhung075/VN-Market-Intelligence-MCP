---
name: System baseline
description: 68 tools, 19 crons, Sprint 044 state as of 2026-04-03
type: project
---

System baseline as of 2026-04-03:
- 68 MCP tools registered (verified via /health endpoint)
- 19 cron jobs (including weatherCheck, franceSummary, devTeamHeartbeat, userRequestCheck, predictionOutcome, davPharmacyCheck)
- Sprint 039-044 complete: capital protection, macro catalyst, supply chain, climate/energy, crisis radar, pharma radar
- New domain tools (Sprint 039-044): get_legal_risk_signals, get_policy_signals, get_bond_maturity_calendar, get_public_contracts, get_credit_flow_signal, get_insider_signals, get_supply_chain_exposure, get_climate_risk_signals, get_energy_grid_signals, get_crisis_early_warning, get_pharma_signals
- Agent signal bus live with 6 signal types: urgent_news, price_anomaly, cross_validate, suppress, legal_risk, crisis_velocity

**Why:** This is the reference point for detecting drift. Before every rewrite, run Discovery Protocol and compare against this baseline.
**How to apply:** If tool count differs from this baseline, investigate what changed before rewriting.
