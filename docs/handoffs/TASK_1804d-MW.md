# TASK 1804d-MW — market-watcher cycle.md: write move_sigma into price_anomaly finding_data

## Wave
Wave 2 — depends on 1804d-A (schema must exist before referencing field names)

## Scope
- `.claude/flows/market-watcher/cycle.md`

## What to build

Update the market-watcher cycle to populate `move_sigma` when it posts a `price_anomaly` signal. Locate the step in cycle.md where the agent calls `postSignal` (or equivalent MCP tool) for a price anomaly finding and add explicit instruction to include `move_sigma` in `finding_data`.

Specifically, the cycle step must:
1. Compute or retrieve `move_sigma` for the ticker (sigma = price_move_pct / rolling_stddev)
2. Pass it in `finding_data` matching `PriceAnomalyFindingData`:
   ```json
   {
     "move_pct": <number>,
     "move_sigma": <number>,
     "ref_price": <number>,
     "window_days": <integer>
   }
   ```
3. Document which data source provides `move_sigma` (e.g. TA service response, computed inline, etc.)

This is a flow/agent instruction file — no TypeScript code. Clear, imperative prose only. Existing steps must not be removed or reordered.

## Acceptance criteria
- `move_sigma` explicitly named in the price_anomaly postSignal step
- All four `PriceAnomalyFindingData` fields listed with their source
- No existing cycle steps removed
- File remains under 250 lines (or note if already over)

## Commit format
```
task(1804d-MW): market-watcher cycle — write move_sigma into price_anomaly finding_data
```
