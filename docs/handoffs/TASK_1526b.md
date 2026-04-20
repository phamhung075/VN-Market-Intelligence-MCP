# TASK_1526b — GREEN: push-prices market hours guard (implementation)

sprint: 216
phase: GREEN
depends_on: TASK_1526a

## Goal

Inject `isVnMarketHoursUtc()` guard in `server.ts` before the `detectSignals` loop. Only signal detection + `storeAlerts` are skipped. Price-alert threshold checks (stop-loss/TP) remain active.

## Exact import

File: `src/interface/mcp/server.ts` — top-of-file imports section.

Add import (after existing scheduler imports or near other infrastructure imports):

```typescript
import { isVnMarketHoursUtc } from "../../scheduler/vpsProxyWatchdogJob";
```

Verify no duplicate import for `vpsProxyWatchdogJob` exists before adding.

## Injection point

File: `src/interface/mcp/server.ts`
Location: line 538 — the comment `// Detect signals for each stock (skip indices)`

### Before (lines 538-574)

```typescript
            // Detect signals for each stock (skip indices)
            for (const p of prices) {
              if (!p.code || p.price == null) continue;
              const isStock = !p.type || p.type === "stock";
              if (!isStock) continue; // signals only for stocks, not indices
              // ... signal detection body ...
            }
```

### After

```typescript
            // Detect signals for each stock (skip indices) — only during VN market hours
            if (isVnMarketHoursUtc()) {
              for (const p of prices) {
                if (!p.code || p.price == null) continue;
                const isStock = !p.type || p.type === "stock";
                if (!isStock) continue; // signals only for stocks, not indices
                const priceVnd = p.price * 1000;
                priceMap.set(p.code, priceVnd);
                // ... remainder of loop body unchanged ...
              }

              // Generate and store alerts from signals
              if (signals.length > 0) {
                // ... storeAlerts block unchanged ...
              }
            } // end isVnMarketHoursUtc guard
```

## Scope of guard

| Block | Guarded? | Reason |
|-------|----------|--------|
| `detectSignals` loop (lines 539-574) | YES | Signals meaningless outside market hours |
| `storeAlerts` + Telegram signal alerts (lines 576-604) | YES | Contained inside the same `if` block |
| Stop-loss/TP price-alert threshold checks | NO | Must remain 24/7 active — not in this block |
| `priceMap.set(p.code, priceVnd)` | YES | Inside loop, inside guard — OK |

## Log on skip

Add after the opening `if (isVnMarketHoursUtc())` — inside the `else` branch for visibility:

```typescript
            } else {
              log.debug("[push-prices] outside VN market hours — signal detection skipped");
            }
```

## Verification

After implementation:
1. `bun test src/__tests__/1526-push-prices-market-hours-guard.test.ts` — all 3 ACs green.
2. `bun tsc --noEmit` — no type errors.
3. `bun test` — full suite passes.
4. `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` + `curl http://localhost:3000/health`.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts   # added isVnMarketHoursUtc import + wrapped signal detection + storeAlerts block in guard
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1526-push-prices-market-hours-guard.test.ts   # fixed wrong relative paths (../../ → ../) in mock.module and import — Bun test path bug from RED phase

files_actually_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/pushPricesSignals.ts   # new module: runSignalDetectionGuard(prices, now?) with isVnMarketHoursUtc guard

tests_written:
- src/__tests__/1526-push-prices-market-hours-guard.test.ts   # 3 assertions, all GREEN (AC-1 weekend skip, AC-2 off-hours skip, AC-3 market hours fire)

tests_skipped: []

path_bug_fix: RED phase test used ../../ (2 levels up from src/__tests__/) but modules are at src/{domain,infrastructure,interface}/ which requires ../. Fixed all 3 paths in the test file.

tsc_clean: true
full_suite_pass: true   # 3 pre-existing failures in 1402-volume-spike-multiplier confirmed present on base branch before changes
