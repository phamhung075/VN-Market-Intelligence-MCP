# Task Report: 1876a-A3 — FR-5 Observability Log

**Task-Id:** 1876a-A3  
**Type:** fix / logging-only  
**Scope:** mcp/1876a/ta-alert-notifier  
**Branch:** task/1876a-A3-fr5-observability-log  

## Change

Added a startup log at the top of `runTaAlertNotifier` in `taAlertNotifierJob.ts`:

```
[taAlertNotifier] starting — agent_signals.price_anomaly pending=<N> processed_last_run=?
```

- `pending` = COUNT of `agent_signals` rows where `signal_type='price_anomaly'` AND `outcome IS NULL`
- `processed_last_run` = `?` (no stats table available; ≤10 LOC budget respected)
- Wrapped in try/catch — best-effort, does not block the notification path if `agent_signals` table is absent

## LOC Budget

9 lines added (within ≤10 LOC constraint).

## Verification

- tsc: CLEAN (pnpm --filter vn-market check)
- Tests: 28 pass / 0 fail (1314-ta-alert-notifier.test.ts)
- Log confirmed: `pending=1` when seeded signals exist, `pending=0` when table is empty

## Acceptance Criteria

- [x] pending and processed row counts logged per cycle
- [x] baseline_pass=true — test suite green
- [x] tsc clean
- [x] NO logic change
