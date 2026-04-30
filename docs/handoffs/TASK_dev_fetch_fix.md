# Handoff: fix/fetch-source-issues

**Branch:** `fix/fetch-source-issues`
**Commit:** `7e6f922b`
**Status:** IMPL_DONE — 19/19 new tests pass, 43/43 existing related tests pass

---

## What was fixed

### Issue 1 — vnstock concurrency (MEDIUM)

**File changed:** `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts`

- `fetchVnstockSnapshot`: replaced `Promise.all([7 calls])` with 7 sequential `await` calls. The old pattern fired all 7 Python subprocesses simultaneously per ticker; with 30 watchlist tickers that was up to 210 concurrent VCI requests, causing the RATE_LIMITED WARNs on D2D, VCB, CTG.
- `fetchVnstockPrices`: switched from bare `runPython` to `runPythonWithBackoff` — price calls now get the same exponential-backoff retry protection as `fetchVnstockFinancials` and `fetchVnstockTradingStats`.
- No changes to callers (`syncVnstockData`, `syncStockLight`) — they already iterate tickers sequentially with `DELAY_MS=1500ms` between each.

### Issue 2 — Disabled/unconfigured sources counted as health failures (LOW)

**Files changed:**
- `apps/mcp-server/src/domain/services/sourceHealthTracker.ts`
- `apps/mcp-server/src/application/usecases/pollNews.ts`

- `SourceHealthTracker`: added `"disabled"` to `SourceStatus` union and a new `recordDisabled(source)` method that sets `status="disabled"` with `consecutiveFailures=0` — being unconfigured is not a failure.
- `pollNews` health loop: added `STUB_CAPABLE_KEYS = Set(["newsapi"])` and a lazy `isNewsapiConfigured()` check. When newsapi returns `[]` and the config shows no API key / `enabled: false`, `recordDisabled` is called instead of `recordFailure`. This eliminates the false "8 consecutive failures" / "down" status for newsapi in deployments without a key.
- Note: `tradingeconomics` is NOT in `STUB_CAPABLE_KEYS` — it uses free public RSS and its empty results are real failures worth tracking.

### Issue 3 — Trading Economics deploy placeholder (MEDIUM)

**Files changed:**
- `vps-scripts/fetch-tradingeconomics.sh`
- `scripts/deploy-vinahost.sh`

- `fetch-tradingeconomics.sh`: added guard at top that exits 0 (gracefully) when `TE_API_KEY` is empty or still the literal `__TE_API_KEY__` placeholder. Logs to `/var/log/vn-tradingeconomics-fetch.log`.
- `deploy-vinahost.sh`:
  - Added `sed -e "s|__TE_API_KEY__|${TRADING_ECONOMICS_API_KEY:-}|g"` substitution in the TE script deploy block.
  - Added a WARN message (not `exit 1`) when `TRADING_ECONOMICS_API_KEY` is absent — deploy continues, script exits gracefully on VPS.
  - Added full Trading Economics service deploy block as section 8 (was previously missing — script was never deployed from this file).
  - Updated summary to "9 services".
- `.env.example` already had `TRADING_ECONOMICS_API_KEY=` documented — no change needed.

---

## Tests

| File | Tests | What they cover |
|------|-------|-----------------|
| `fix-fetch-source-issue1-snapshot-sequential.test.ts` | 4 | snapshot shape, sequential ordering via TimeSlot, contrast test showing concurrent overlaps |
| `fix-fetch-source-issue2-disabled-health.test.ts` | 8 | `recordDisabled` semantics, idempotency, reset after failures, status distinctness, `isDown` guard, pollNews integration |
| `fix-fetch-source-issue3-te-api-key-guard.test.ts` | 7 | guard presence, placeholder check, exit 0, position before loop, sed substitution, WARN not abort, .env.example |

---

## QA validation checklist

1. `bun test src/__tests__/fix-fetch-source-issue*.test.ts` — all 19 pass
2. `bun test src/__tests__/1780-vnstock-backoff.test.ts` — backoff tests still pass (no regression)
3. `bun test src/__tests__/1227-source-health-empty-result.test.ts` — health tracker tests still pass
4. `bun test src/__tests__/1332-pollnews-source-display-name.test.ts` — display name routing still correct
5. Verify `SourceStatus` type is `"ok" | "degraded" | "down" | "disabled"` in `sourceHealthTracker.ts`
6. Verify `fetchVnstockSnapshot` body has 7 sequential `await` (no `Promise.all`) in `vnstockBridge.ts`
7. Verify `fetch-tradingeconomics.sh` guard block exits before `for ITEM in "${INDICATORS[@]}"` loop
8. Verify `deploy-vinahost.sh` section 8 has `sed ... -e "s|__TE_API_KEY__|..."` substitution
