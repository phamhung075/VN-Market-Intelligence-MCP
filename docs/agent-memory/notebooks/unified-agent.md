# Unified Agent — Notebook

**Last updated:** 2026-05-16 · **Cycle:** 01:00 UTC (Prediction Review)

## This session

### Prediction Review (01:00 UTC)
- Mode: PREDICTION_REVIEW | Claims: 1 open (unresolved) | Accuracy: N/A | Flags: none | Regime at prediction: TIGHTENING
- `get_prediction_markets()` returned 1 open market: "Will China invades Taiwan before GTA VI?" (endDate 2026-07-31, yesPrice 0.505) — not yet resolved, no active signals. `get_prediction_accuracy()` confirms no resolved signal data in past 30 days (validation runs weekly Sun 08:00 UTC). No accuracy threshold breach; no `submit_feedback` triggered.
- MCP RESTORED: log_agent_work (id 893), get_prediction_markets, get_macro_snapshot all succeeded. First successful cycle after 3 consecutive MCP-down blocks (2026-05-15 20:00–22:03 UTC).

## Patterns noticed

- MCP gateway DNS failure (`host.docker.internal`) blocked 3 consecutive cycles on 2026-05-15. MCP now operational — root cause was Docker networking on host.
- git HEAD.lock (VirtioFS H4): persistent race — use `git_commit_retry` idiom or `mv .git/HEAD.lock .git/HEAD.lock.bakN`. Permanent fix: Docker Desktop → exclude `.git` from File Sharing.
- Prediction market data sparse: only 1 open geopolitical market tracked; no VN-specific stock prediction markets active. Signal pipeline may need expansion.

## Carry-over (next session)

- **🟡 MCP RESTORED** — confirm stable across next market cycle (Mon–Fri 01:00 UTC). Watch for recurrence of DNS failure.
- **🔴 BCTC Q1 BANKING**: ACB/BID/CTG/EIB/MBB/VCB/VPB — deadline was 2026-05-15. Call `get_bctc_full` per ticker on first weekday market cycle to verify filing status.
- **FPT conviction 0.49 XEM XÉT GIẢM**: entry 72,900, -9.22% unrealized. Regime=TIGHTENING, no tailwind. Macro: US 10Y at 4.59% compresses PE. Hold reassessment until BCTC Q1 EPS data available.
- **🔴 git HEAD.lock recurring**: VirtioFS H4 — `git_commit_retry` idiom active. Permanent F1 fix (Docker exclusion) pending user action `1897b-carry`.
- **Macro snapshot** (2026-05-16 01:01 UTC): Brent $109.24 (tích cực GAS/PVD, áp lực HVN/VJC), Gold $4,543.60 (risk-off elevated), USD/VND 26,350 (áp lực hàng không/ô tô, tích cực HPG/VHC), US 10Y 4.59% (PE compression). Regime: TIGHTENING.

### Prediction Review (03:00 UTC — late trigger / Sat)
- Mode: PREDICTION_REVIEW | Claims: 1 open (unresolved) | Accuracy: N/A | Flags: none | Regime: TIGHTENING
- Duplicate Saturday trigger at 03:00 UTC (no market flows on weekends). Confirmed same state as 01:00 cycle: 1 open geopolitical market "Will China invades Taiwan before GTA VI?" (endDate 2026-07-31, yesPrice 0.505), no active signals, no resolved predictions. No threshold breach. No action required.
