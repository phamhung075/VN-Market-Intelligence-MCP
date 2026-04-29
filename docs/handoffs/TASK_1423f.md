# Handoff — TASK 1423f

## What changed

**One line added** to `formatMacroSnapshot` in `macroTools.ts`.

In the `[SBV Central Bank Rates]` section, after the `Refinancing Rate` line:

```
  Max Deposit Rate:  X.XX%
```

Reads `r.maxDepositRatePct` (already present on `SbvMacroSnapshot`). Shows `0.00%` when value is 0.

## Files modified

- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` — one `lines.push` added inside the SBV rates block
- `apps/mcp-server/src/__tests__/1423f-deposit-rate-display.test.ts` — new test file (3 tests)
- `TASKS.md` — 1423f added as Done

## Test results

```
3 pass / 0 fail
tsc --noEmit: clean
```

## QA checklist

- [ ] `Max Deposit Rate:` line appears in `[SBV Central Bank Rates]` section
- [ ] Positioned after `Refinancing Rate:` line
- [ ] Shows `0.00%` when `maxDepositRatePct` is 0
- [ ] No other output changed
