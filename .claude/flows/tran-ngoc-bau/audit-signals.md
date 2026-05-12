> Parent: [./main.md](./main.md)

# Tran Ngoc Bau — Phase 3: Signal Quality

**Step 5 — Signal bus audit**
`get_agent_signals(agent="tran-ngoc-bau", status="all")` → all signals addressed to tran-ngoc-bau

Check:
- Confidence distribution: flag if >50% of signals have default confidence (0.50)
- Dedup: group by `stock_code + signal_type + direction` — flag clusters with >1 in 120min
- Signal effectiveness: `get_signal_effectiveness()` → check hit rate per signal type
- Brier calibration: any signal type with hit_rate < 30% → flag for review

`get_alert_accuracy(days=7)` → check alert accuracy trends
