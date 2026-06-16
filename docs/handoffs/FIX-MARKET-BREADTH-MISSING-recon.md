# FIX-MARKET-BREADTH-MISSING — ops-vps-fetch Recon

**Date:** 2026-06-16
**Agent:** ops-vps-fetch
**Status:** RECON COMPLETE — endpoint found, recipe confirmed
**Task:** FIX-MARKET-BREADTH-MISSING (HIGH, P1)
**VPS probe performed:** 2026-06-16 via SSH root@125.212.251.27

---

## RESULT: FOUND

The VnDirect `vnmarket_prices` endpoint carries full market breadth fields. This is the **same endpoint already used by `fetchVnIndex()`** in `hose.ts` — it just needs the breadth fields extracted and surfaced.

---

## ENDPOINT

```
GET https://api-finfo.vndirect.com.vn/v4/vnmarket_prices?sort=date&q=code:VNINDEX&size=1&page=1
```

No auth required. `User-Agent: Mozilla/5.0` sufficient. Responds in < 500ms from VPS.

---

## LIVE SAMPLE (probed 2026-06-16 15:06 VN time, mid-session)

```json
{
  "code": "VNINDEX",
  "floor": "HOSE",
  "date": "2026-06-16",
  "time": "15:06:06",
  "type": "COMPOSITE",
  "open": 1808.56,
  "high": 1811.59,
  "low": 1799.86,
  "close": 1807.94,
  "change": 8.63,
  "pctChange": 0.4796,
  "accumulatedVol": 672837809.0,
  "accumulatedVal": 16650836352800.0,
  "nmVolume": 573796720.0,
  "nmValue": 14327052375030.0,
  "ptVolume": 99148089.0,
  "ptValue": 2327610939770.0,
  "advances": 179.0,
  "declines": 109.0,
  "noChange": 74.0,
  "noTrade": 31.0,
  "ceilingStocks": 8.0,
  "floorStocks": 4.0,
  "valChgPctCr1d": 0.0
}
```

---

## BREADTH FIELD MAP

| API Field | Semantic | Type | Notes |
|-----------|----------|------|-------|
| `advances` | Mã tăng giá (số mã) | float → int | HOSE session tăng (today) |
| `declines` | Mã giảm giá | float → int | HOSE session giảm |
| `noChange` | Mã đứng giá | float → int | giá không đổi |
| `noTrade` | Mã không có khớp | float → int | |
| `ceilingStocks` | Mã trần | float → int | |
| `floorStocks` | Mã sàn | float → int | |

**Plausibility check (06-16, 15:06 VN time):** advances=179, declines=109, noChange=74, noTrade=31 → total=393. HOSE has ~400-420 listed stocks; this is consistent. VN-Index close +0.48% correlates correctly with advances > declines.

**Historical breadth available:** the endpoint supports `size=N` for recent sessions. Verified: `size=10` returns 10 daily VNINDEX rows, each with advances/declines/noChange, confirming historical depth is accessible.

---

## WORKING REQUEST RECIPE

```bash
# Single call — breadth for latest session
curl -s --connect-timeout 10 --max-time 30 \
  "https://api-finfo.vndirect.com.vn/v4/vnmarket_prices?sort=date&q=code:VNINDEX&size=1&page=1" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json"

# Parse: .data[0].advances  → int (mã tăng)
#        .data[0].declines  → int (mã giảm)
#        .data[0].noChange  → int (mã đứng)
#        .data[0].noTrade   → int (mã không khớp)
#        .data[0].ceilingStocks → int (mã trần)
#        .data[0].floorStocks   → int (mã sàn)
```

**Anti-bot:** None detected. The endpoint returns clean JSON with no Cloudflare headers or JS challenges. Same domain/endpoint already in use by the production `fetchVnIndex()` function — no new auth or headers required beyond User-Agent.

**Note on exchange coverage:** This call returns HOSE breadth only (VNINDEX = HOSE composite). For HNX and UPCOM, query `HNXINDEX` and `UPCOMINDEX` with the same endpoint. The API returns an empty `data[]` when no data is available for those codes at the moment — confirmed: the HNXINDEX query returned empty during VN market hours today (possible data lag on HNX index breadth). For MVP, HOSE breadth (VNINDEX) is sufficient.

---

## IMPLEMENTATION PATH FOR dev-mcp-server

### Option A (recommended — cheapest): Extend `fetchVnIndex()` in `hose.ts`
`fetchVnIndex()` already fetches the same URL and parses `VnMarketPriceRecord`. Just add the breadth fields to the parsed result and surface them.

1. Add `advances`, `declines`, `noChange`, `noTrade`, `ceilingStocks`, `floorStocks` to `VnMarketPriceRecord` interface
2. Add breadth fields to `MarketPrice` or return a new `MarketBreadth` object alongside the index price
3. Extend `get_market_snapshot` tool to include breadth in its response
4. Frontend breadth card reads the new fields and links source URL to the VnDirect endpoint

### Option B: Add `get_market_breadth` as a separate new tool
Separate MCP tool calling the same URL, returns advances/declines/noChange + prior-session delta.

**Recommended:** Option A. The endpoint is already polled every 5 min by `vnIndexRefreshJob.ts`. Zero extra network cost; just parse more fields from the response already in-flight.

---

## FILES TO CHANGE

| File | Change |
|------|--------|
| `apps/mcp-server/src/infrastructure/fetchers/hose.ts` | Add breadth fields to `VnMarketPriceRecord` + `MarketPrice`; parse from response |
| `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` | Add breadth fields to `get_market_snapshot` response |
| Frontend breadth card | Read `advances/declines/noChange` from `get_market_snapshot`, link source |

---

## VERIFICATION GATE

RAW: `get_market_snapshot` returns non-null `advances` + `declines` + `noChange` values; magnitudes consistent with HOSE constituent count (~400-420); direction consistent with VN-Index pctChange sign.

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/fetchers/hose.ts` — extended VnMarketPriceRecord interface + new MarketBreadthAndLiquidity export type + new fetchVnIndexBreadthAndLiquidity() function (size=2 query for delta)
  - `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` — get_market_snapshot now fetches breadth concurrently (breadthResult in Promise.all); appends Vietnamese prose summary; breadth struct in JSON response; new get_market_breadth tool added
- **Tests written:**
  - `apps/mcp-server/src/__tests__/FIX-MARKET-BREADTH-LIQUIDITY.test.ts` — 21 assertions, GREEN (breadth parsing tests co-located with liquidity)
- **Git commits:** (see combined commit)
- **Type check:** clean (bun tsc --noEmit)
- **bun test:** 21 pass / 0 fail (targeted)
- **Tool count:** 165 (pre-task: 164 — new get_market_breadth tool)
- **Scheduler count:** 3 (unchanged)
- **Docs updated:** `docs/architecture/microservice/mcp-server/market-data.md` — added get_market_breadth row, invariant #7
- **Graphify:** skipped

**REBUILD_REQUIRED:** YES — new fetchVnIndexBreadthAndLiquidity() function in mcp-server; get_market_snapshot now fetches breadth in parallel.

**done_verified gate:** call get_market_breadth via gateway; advances integer in [100, 500]; declines integer in [100, 500]; totalTurnoverBn in [5000, 30000] tỷ on trading days.
