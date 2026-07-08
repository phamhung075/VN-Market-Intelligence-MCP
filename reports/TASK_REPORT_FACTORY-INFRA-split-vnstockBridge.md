# Task Report: FACTORY-INFRA-split-vnstockBridge — Docker Close Gate Step 5 (qa RAW-verify)

date: 2026-07-08
outcome: **STEP 5 PASS** — board held at REVIEW, `next_agent` qa→po (po performs the Step 6 DONE_VERIFIED flip)
scope: `docs/protocols/docker-deployment-runbook.md` § Microservice Code-Change Close Gate — Step 5 only (qa liveness/behaviour verification on the rebuilt container). Steps 1-4 (rebuild + SHA-gate) already independently RAW-verified complete by ops at commit `0a44fe472`, deployed SHA `91c9d19b0`.

## What this gate verifies

Step 5 requires: hit `/health` + verify tool count/key behaviour matches the NEW code on the rebuilt container — independently, not trusting the prior actor's badges/numbers. This report documents that independent verification, using a **different ticker (FPT)** than ops's own spot-check (VNM) and **more split domains** than ops covered (prices/tradingStats/financials/shareholders/balanceSheet/cashFlow/officers vs ops's prices/tradingStats only).

## Container / deploy identity (independently re-derived)

- `docker ps` / `docker inspect vn-market-intelligence-mcp-mcp-server-1`: `Up (healthy)`, `StartedAt=2026-07-08T21:00:57Z` (fresh post-rebuild instance, ~10 min old at verification time).
- `docker port` re-discovered (not assumed static): `3000/tcp -> 0.0.0.0:3000` and `-> 0.0.0.0:4004`.
- `docker inspect --format '{{ index .Config.Labels "vn.market.git_sha" }}'` → `91c9d19b0b19359efaaa6773fb754e5b89efc392` — matches the split-commit SHA ops rebuilt from.
- `docker exec ... find . -path '*fetchers/vnstock*'` confirms all 11 split files (`fetchers/vnstock/{runtime.ts,index.ts,scripts/{balanceSheet,cashFlow,events,financials,intraday,news,officers,orderBook,prices,shareholders,tradingStats}.ts}`) + `vnstockBridge.ts` physically present inside the running image.

## `/health` — independently re-curled on both discovered ports

```
curl http://localhost:3000/health → {"status":"ok","name":"vn-market","version":"1.0.0","toolCount":183,"sessions":0,"uptime":286.4}
curl http://localhost:4004/health → {"status":"ok","name":"vn-market","version":"1.0.0","toolCount":183,"sessions":0,"uptime":286.4}
```
`toolCount=183` matches baseline; `status=ok` on both.

## Live-fetch spot-check — 7 of the 11 split domains, ticker FPT (different from ops's VNM)

Invoked via `docker exec` + `bun run` against a script placed at `/app` (so relative imports resolve), calling the split module's public functions directly:

| Domain | Result | Cross-check |
|---|---|---|
| `fetchVnstockPrices(["FPT"])` | open=72400 high=72800 low=71500 close=72100 vol=6741600 date=2026-07-08 | **Byte-identical** to `daily_ohlcv` row for FPT/2026-07-08 in the live named-volume `market.db` (bun:sqlite readonly) |
| `fetchVnstockTradingStats("FPT")` | high52w=110120 low52w=69048 marketCapBn=125488.69 currentHoldingRatio=0.2776 maxHoldingRatio=0.49 pctFromHigh52w=-33.53 pctFromLow52w=6.01 | Matches `vnstock_trading_stats` DB row persisted by the scheduler ~16 min earlier (2026-07-08T20:50:14Z) on every shared field |
| `fetchVnstockShareholders("FPT")` | Top holder Trương Gia Bình 117,347,966 sh / 6.89%, then 96,585,637/5.67%, 54,303,923/3.69%, 9,604,598/2.42%, ... | **Byte-identical** (name/quantity/ownPercent) to `vnstock_shareholders` DB rows (86 total rows, latest `fetched_at` 2026-07-08T17:54:24Z) |
| `fetchVnstockOfficers("FPT")` | Trương Gia Bình — Chủ tịch HĐQT, 6.89%; Bùi Quang Ngọc — Phó CT HĐQT, 1.48%; ... | Real, plausible, consistent with shareholders list |
| `fetchVnstockFinancials("FPT")` and `("VNM")` | Both return `yearReport=0 quarter=0 revenue=0 eps=0`, `pe/pb/roe/roa=null` | See below — investigated, confirmed pre-existing |
| `fetchVnstockBalanceSheet("FPT")` | `totalAssets=0` (same zero pattern) | See below |
| `fetchVnstockCashFlow("FPT")` | `operatingCashFlow=null netCashFlow=0` (same zero pattern) | See below |

### Financials/balanceSheet/cashFlow zero-value pattern — investigated, NOT a split regression

Rather than wave off the zero/null result, cross-checked:
1. **Diffed the generated Python** for `financials.ts` against the pre-split `FINANCE_SCRIPT` (`git show 9f4a8eef6:...vnstockBridge.ts`) — the `body` (column keys, fallback logic, `Chỉ tiêu định giá`/`Chỉ tiêu khả năng sinh lợi` lookups) is **byte-identical**. The split did not change this code at all.
2. **Queried DB history** for `vnstock_balance_sheet` (FPT): a row from **2026-04-15** (months before this split, `fetched_at=2026-04-15T05:49:28Z`) has real non-zero data (`total_assets_bn=88141.99` etc.), while the most recent row (**2026-07-08T19:08:36Z — before this container's own 21:00:57Z startup**) already shows the same zero pattern.
3. Conclusion: this is a **pre-existing upstream vnstock data-availability/schema characteristic** (quarterly-report source not returning current-period data at fetch time), reproducible identically before and after the split — out of scope for this Step-5 gate (no regression introduced).

## Test suite (fresh, uncached — host, not container)

- `bun tsc --noEmit` (apps/mcp-server): **0 errors**.
- Targeted vnstock suite, 18 files re-run fresh: **210 pass / 0 fail / 406 expect() calls**.
- **Full `bun test` suite, fresh (not cached)**: `14383 pass / 40 skip / 60 fail / 4 errors / 45067 expect() calls`, 14483 tests across 1181 files, **653.38s**, then the documented Bun 1.3.13 crash-at-teardown (exit 132 — occurs strictly AFTER the pass/fail summary line prints; same non-authoritative crash class already recorded twice in this task's own `review_note`).
  - Grepped all 60 `(fail)` lines + all 4 `error:` stack traces: **zero mention** vnstockBridge/vnstock/runtime/scripts/wrapVnstockScript/any `buildXxxScript` name.
  - All 60 fails map to known-unrelated classes: `1898b-rss-degradation-regression.test.ts` (documented pre-existing RSS/VPS-push flake), `src/_deprecated/1302-technical-indicators.test.ts` (deprecated dir), plus a cluster of `insider-transactions`/`get_market_cap`/`push-news`/`vps-proxy-health`/`get_company_profile`/`FIX-1267 bctc PDF timeout`/`search_similar_context` tests that time out at the fixed 5000ms bun-test default (host-contention artifact of running the suite while Docker + this verification's own docker execs were concurrently active) or hit pre-existing missing-table gaps (`no such table: imf_indicators`, `market_messages`) unrelated to `apps/mcp-server/src/infrastructure/fetchers/vnstock*`.

## SHA-gate re-run — benign drift, confirmed not a regression

`bash scripts/verify-deploy-sha.sh mcp-server` now reports drift (`deployed=91c9d19b0` vs `expected=e12b4e569`, current HEAD) because HEAD advanced via **2 unrelated docs-only commits** after this task's deploy (`0a44fe472` — ops's own board write; `e12b4e569` — an unrelated task's po close). Confirmed via `git diff --stat 91c9d19b0..HEAD -- apps/` → **empty**. The deployed container's code is the correct, current code for this task.

## Verdict

Step 5 **PASS**. No regression detected in any of the 7 sampled split domains, tsc, targeted suite, or full suite. The one anomaly investigated (financials/balanceSheet/cashFlow zero-value pattern) is confirmed pre-existing and unrelated to the split via byte-identical Python-generation diff + DB history.

Board row: `next_agent` qa → po (status stays `REVIEW` — po performs Step 6 DONE_VERIFIED per the Close Gate delegation rule; qa does not self-close a `rebuild_required=true` FACTORY task). `.head` synced in the same write.
