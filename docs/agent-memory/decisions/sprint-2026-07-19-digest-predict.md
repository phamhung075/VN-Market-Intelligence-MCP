# Decision Journal — Sprint 2026-07-19 · digest-predict

**Sprint goal:** no active sprint_id resolvable this session (no Bash/jq tool) — date fallback per skill
**Agent:** digest-predict
**Started:** 2026-07-19T13:47:00Z

---

### STEP digest-predict-S1 · digest-predict · 2026-07-19T13:52:00Z
**what-done:** Compiled + sent Sunday weekly digest (2026-W29, 2026-07-13/2026-07-19) to MARKET+WORK; filed one BUG report for a cross-tool data-gap found mid-cycle.
**what-considered:**
- Escalate correlation/5d data-gap immediately vs fold silently into digest system-improvement section only
- Deep-diagnose OHLCV pipeline root cause myself vs report-and-defer to dev-team
**why-decision:** Anomaly corroborated across 3 independent tools (correlation_matrix 2/33 stocks, market_summary weekly all "no price data", alert_accuracy total ~314 vs ~961) while get_market_snapshot(codes=...) same-cycle returned correct prices — high-confidence real regression, not single-tool flake or market-closed artifact. Filed one consolidated BUG telegram (dedup-checked via get_recent_fixes first) and deferred root-cause to dev-team per digest-predict not_my_job scope (infra diagnosis).
**why-change:** no change from weekly.md's literal step list — added one extra BUG telegram beyond the flow's named outputs, justified by fail-loud-protocol (anomaly discovered live, mid-cycle, not pre-scripted).
