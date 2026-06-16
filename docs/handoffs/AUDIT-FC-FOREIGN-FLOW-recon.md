# AUDIT-FC-FOREIGN-FLOW — Recon Findings

**Date:** 2026-06-16  
**Agent:** ops-vps-fetch  
**Status:** RECON COMPLETE — no fix applied  
**Task:** AUDIT-FC-FOREIGN-FLOW (P1)

---

## Summary Answer

**102 is the REAL count of watchlist+ref tickers that passed the non-zero filter.** It is NOT a page cap. The upstream API `bgapidatafeed.vps.com.vn` does NOT paginate — it returns all requested tickers in one call. The 102 figure is produced by 3 compounding factors: (a) 6 codes the API does not know (invalid/delisted), (b) 3 codes returned with fRoom but zero buy+sell (market-hours gap), (c) jq filter excluding all-zero rows. The 102/1569 DB discrepancy is structural: daily_ohlcv accumulates ALL ~1569 traded tickers from OHLCV data, but foreign flow is only fetched for the 111-code watchlist+ref subset.

---

## SOURCE_ENDPOINT

```
https://bgapidatafeed.vps.com.vn/getliststockdata/<CODES>
```

- CODES = comma-joined list, built from watchlist DB + mcp.config.json referenceStocks
- No auth required; `User-Agent: Mozilla/5.0` sufficient
- Single GET call, no pagination
- Returns JSON array of ticker objects with all fields in one shot

---

## FETCHER_PATH

**VPS side (push path):**
- Script: `vps-scripts/fetch-foreign-flow.sh`
- Systemd service: `vps-scripts/vn-foreign-flow.service` (runs on VPS, 60s interval market hours)
- Flow: VPS fetches `bgapidatafeed` → jq filters → POSTs to `https://zenmidi.com/api/push-foreign-flow`

**MCP server side (receive path):**
- Push handler: `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts`
- OHLCV writer: `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts`
- Fallback fetcher (GET, currently dead route): `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts`
  - NOTE: `foreignFlowFetcher.ts` tries `GET http://${VINAHOST_IP}/foreign-flow` which does NOT exist on the VPS proxy (`vps-proxy-server.js`). This path always fails silently.

**Watchlist resolver (in mcp-server `server.ts`):**
- `GET /api/watchlist` — returns watchlist DB codes + all referenceStocks from `mcp.config.json`
- Live count: **111 codes** (33 watchlist-active + 100 refStocks, deduplicated)

---

## PAGE_CAP

**None.** The upstream `bgapidatafeed.vps.com.vn/getliststockdata/<CODES>` API:
- Accepts any number of comma-separated ticker codes
- Returns all matching codes in a single JSON array — no pagination, no page_size param
- RAW-verified: submitted 111 codes, received 105 back (6 unknown to the API)
- The 100-row appearance is coincidental: 100 ref stocks + 11 watchlist-unique = 101 deduped input codes against our earlier estimate, but live watchlist is actually 111 codes

---

## SOURCE_DISTINCT_CODES (one complete fetch)

From live VPS probe with the actual 111-code live watchlist:

| Stage | Count |
|---|---|
| Codes submitted to API | 111 |
| Codes returned by API | 105 |
| Missing (API unknown) | 6 |
| Items with fBVol>0 OR fSVolume>0 | 87 |
| Items with fRoom present | 105 (all returned items) |
| Items passing jq filter (buy OR sell OR room > 0) | **102** |

**6 codes not recognized by bgapidatafeed:** `BDI, DLC, JSH, PME, SIS, VDC`
- Individually queried: API returns 0 items for each
- These are likely delisted, renamed, or UPCOM/HNX tickers not carried by this VPS feed

**18 codes returned with zero fBVol AND zero fSVolume** (but fRoom may be nonzero):
`BCG, DAG, DFF, DMC, HBC, HNG, OIL, OPC, POM, PPC, REE, SAM, SMA, STG, TIS, TMT, VNH, VTP`
- 3 of these also have fRoom=0 → fail the jq filter → not pushed

---

## DB_WRITTEN

- Today (2026-06-16): 102 rows with `foreign_net_vol IS NOT NULL` in `daily_ohlcv`
- Yesterday (2026-06-15, completed trading day): 102 nonnull, **85 with nonzero buy_vol**
- The 102 constant across dates confirms: always same 111-code input, same 6 missing, same jq filter result

**Total `daily_ohlcv` rows for 2026-06-16:** 1569  
**Distinct codes in entire daily_ohlcv table:** 1610 (39 dates of OHLCV data, all traded tickers)

The gap (102 vs 1569) is structural: OHLCV price data covers ALL ~1569 traded tickers on HOSE/HNX/UPCOM, but foreign flow is only fetched for the 111-code subset. Non-watchlist tickers (1457 codes) have `foreign_net_vol = NULL`.

---

## TRUNCATION_VERDICT

**`real-count-no-truncation`**

- No page cap exists at the source
- No truncation at fetcher level (fetcher sends all 111 codes in one call, gets 105 back)
- 102 = correct output after: 111 sent → 105 returned (6 delisted) → 102 pass jq filter (3 with zero buy+sell+room excluded)
- HPG watchlist-verified: buy=158110, sell=61589, net=96521 matches DB exactly (2026-06-15: buy=752687, sell=57261)

---

## DROPPED_IMPORTANT

**Yes — structurally — all ~1457 non-watchlist tickers have no foreign flow data.**

The 102 are not "the only tickers with foreign activity." The full VN market has ~750+ tickers on HOSE alone. The `bgapidatafeed` API would return foreign flow for any valid ticker code. The system only asks for 111.

**Examples of commonly-traded tickers with likely foreign activity that are NOT queried:**
- Any HOSE/HNX/UPCOM ticker outside the 111-code list
- The API was NOT tested against the full market (no "all tickers" endpoint found)
- Impact: for the ~1457 other tickers in daily_ohlcv, `foreign_net_vol = NULL` permanently, even on days when foreign investors trade those stocks

The 6 missing codes (`BDI, DLC, JSH, PME, SIS, VDC`) are confirmed as not recognized by bgapidatafeed individually — these appear to be tickers not carried by this feed. No false alarm on those 6.

---

## FIELD_COMPLETENESS

**Source fields per ticker object (confirmed from live probe):**

| Field | Present | Notes |
|---|---|---|
| `sym` | Yes | ticker code |
| `fBVol` | Yes | foreign buy vol (string, cast to number) |
| `fSVolume` | Yes | foreign sell vol (string, cast to number) |
| `fRoom` | Yes | remaining buy room (float as string) |
| `fBValue` | Yes | foreign buy value (NOT extracted currently) |
| `fSValue` | Yes | foreign sell value (NOT extracted currently) |
| `ptVol` | Yes | put-through volume (partially extracted as `putThroughVol`) |

**Fields extracted by jq in fetch-foreign-flow.sh:**
- `fBVol` → `foreignBuyVol` (used)
- `fSVolume` → `foreignSellVol` (used)
- `fRoom` → `foreignRoom` (used for filtering, persisted to `foreign_room` in vnstock table)

**Fields NOT extracted (dropped):**
- `fBValue` — foreign buy value in VND (not collected)
- `fSValue` — foreign sell value in VND (not collected)

**Fields NOT present in the VPS response:**
- `holding_ratio` — not available from this endpoint (persisted as NULL)
- `net_vol` — computed at write time: `foreign_buy_vol - foreign_sell_vol`

**pushForeignFlowHandler.ts normalization:**
- Computes `foreign_volume = foreignBuyVol - foreignSellVol` (net) for vnstock table
- Writes `foreign_buy_vol`, `foreign_sell_vol`, `foreign_net_vol`, `put_through_vol` to daily_ohlcv

---

## WORKING REQUEST RECIPE

```bash
# From VPS (required — bgapidatafeed is not geo-blocked but VPS is already deployed)
CODES="HPG,VCB,FPT,VHM,..."  # comma-joined watchlist codes

curl -s --connect-timeout 10 --max-time 60 \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/${CODES}" \
  -H "User-Agent: Mozilla/5.0"
# Returns: JSON array, ~105 items for 111-code input, ~98KB
# No auth required
# No pagination params available or needed

# Local machine also works (not geo-blocked from France)
# Tested successfully via VPS SSH probe
```

---

## FIX_NEEDED

**Yes — two independent issues:**

### FIX-1 (Structural / scope: `apps/mcp-server` config + `vps-scripts/fetch-foreign-flow.sh`)**
**Zone: mcp-server (config layer)**
**Scope:** Foreign flow coverage is bounded to the 111-code watchlist+ref subset. The full VN market (~750+ HOSE tickers) has no foreign flow data. If the user goal is "verify foreign flow for important info," the important class is: any stock in the 1569-code daily_ohlcv set that has actual foreign trading. Expanding the query list to cover the full OHLCV code universe would close this gap. The bgapidatafeed API supports arbitrary code lists in one call.
**One-line scope:** Expand CODES input to the full set of tickers in daily_ohlcv (not just 111-code watchlist+ref) so foreign flow covers all traded names.

### FIX-2 (Dead code / scope: `foreignFlowFetcher.ts`)**
**Zone: mcp-server infra**
**Scope:** `fetchPrimaryVpsEndpoint()` in `foreignFlowFetcher.ts` GETs `http://${VINAHOST_IP}/foreign-flow` which does NOT exist — the VPS proxy has no such route. This silent 404 hits every minute during market hours. The fallback chain activates unnecessarily. Dead code should be removed or the fallback fetcher rewired to query the push path's cache (or removed entirely given the push model already works).
**One-line scope:** Remove or stub `fetchPrimaryVpsEndpoint` — the push model (VPS → POST /api/push-foreign-flow) is the only live path; the GET fallback is a dangling 404.

---

## RECON_DOC

This file: `docs/handoffs/AUDIT-FC-FOREIGN-FLOW-recon.md`

VPS service log evidence path: `/var/log/vn-foreign-flow.log` on `root@125.212.251.27`
Live log: `VPS_API_FETCH_SUCCESS: 105 raw items` → `JQ_TRANSFORM_SUCCESS: extracted 102 items` (confirmed stable across multiple cron cycles at 04:48–04:55 UTC 2026-06-16)
