# Handoff — FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS

**Sprint:** TA-CONSUMER-STALE-INDICATORS (RC3)
**Priority:** high
**Author:** architect
**Date:** 2026-06-30T19:30Z

---

## Context

RC2 (FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE, commit b6055728) fixed the TA svc to read from
the correct `daily_ohlcv` table. Post-RC2: `get_roc_momentum` = 8/8 NON-NULL, `get_52w_proximity`
= 8/8 compute. BUT `get_relative_strength` STILL returns null for all watchlist tickers with
`null_reason="insufficient_history"` (shifted from pre-RC2 `"index_data_absent"`).

The shift confirms VNINDEX now has SOME rows in `daily_ohlcv` (>0) but fewer than 64, which
is the minimum for the h63 horizon. The h252 horizon (most useful) requires 253 bars.

---

## [Architect] Brownfield Findings

### Zone

- **Zone A:** `vps-scripts/` — specialist: developer (scripts/cross-service)
- **Zone B:** `apps/mcp-server/` — specialist: dev-mcp-server
- **Zone C:** `apps/technical-analysis/` — specialist: dev-technical-analysis (watchlist universe — see § Zone C below)
- **Split needed:** PM creates 3 tasks (A + B + C). A+C can run parallel; B can parallelize after A deploys.

### Root Cause — Confirmed Via Brownfield Scan

**File:** `vps-scripts/fetch-ohlcv-backfill.sh:134-139`

The VPS backfill script that fetches 2yr historical bars for all tickers **explicitly skips VNINDEX**
with a documented placeholder comment "SUBTASK-B: add dedicated index fetch":

```bash
if [ "$TICKER" = "VNINDEX" ]; then
    echo "WARN [VNINDEX]: VNDirect stock_prices endpoint has no index data — skipping (SUBTASK-B: add dedicated index fetch)"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
    continue
fi
```

Reason the skip was added: `api-finfo.vndirect.com.vn/v4/stock_prices` returns
`totalElements=0` for VNINDEX queries. This is correct — stock_prices only covers equities.

The **dedicated index endpoint** exists: `api-finfo.vndirect.com.vn/v4/vnmarket_prices`
(already used by `apps/mcp-server/src/scheduler/market-data/vnIndexRefreshJob.ts` via
`fetchVnIndex()`). It returns `open`, `high`, `low`, `close`, `accumulatedVol`, `date` fields
for VNINDEX.

### Verified Paths

- `vps-scripts/fetch-ohlcv-backfill.sh:134-139` — VNINDEX skip guard (THE bug)
- `apps/mcp-server/src/scheduler/market-data/ohlcvHistoryBackfillJob.ts:251` — VNINDEX always in `allCodes` (correct: triggers VPS queue if depth < 500)
- `apps/technical-analysis/pkg/application/relative_strength_usecase.go:43` — prependVNINDEX (correct)
- `apps/technical-analysis/pkg/infrastructure/multi_ticker_ohlcv_repository.go:77-84` — reads `daily_ohlcv WHERE code=?` (correct, VNINDEX works with this query)
- `apps/technical-analysis/pkg/domain/relative_strength_service.go:39-55` — FR-7 guard: null_reason="index_data_absent" when len==0; shifts to "insufficient_history" at per-ticker level when >0 but <63 bars
- `apps/mcp-server/src/interface/mcp/server.ts:1297` — push handler hardcodes `type="stock"` (VNINDEX ~1200 passes this guard since 100 <= 1200 <= 10,000,000)
- `apps/mcp-server/src/interface/mcp/server.ts:1454-1510` — `ohlcv-backfill-done` depth probe: **only checks watchlist tickers** — VNINDEX excluded (secondary gap)
- `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts:84` — `validateOhlcvUnit` already supports `type: "stock" | "index"` — index type exempt from STOCK_MIN_VND rule; VNINDEX ~1200 is within stock range anyway

### Zone C Gap (COORDINATOR-FLAGGED) — TA svc WATCHLIST_TICKERS absent

**File:** `docker-compose.yml:171-175` — NO `WATCHLIST_TICKERS` env var in technical-analysis block.
**File:** `apps/technical-analysis/cmd/server/main.go:46` — `parseWatchlist(envStr("WATCHLIST_TICKERS", ""))` defaults to empty; logs warn and continues with empty list.

**Impact:** The DEFAULT no-arg consumer of `get_relative_strength` (and ROC/52w) gets an empty response because `uc.watchlist = []`. Only callers that pass EXPLICIT `watchlist_tickers` in the request body get results. The MCP proxy tool currently passes explicit tickers — so the RC3 acceptance gate can pass — but production consumers expecting server-side universe resolution will fail.

**Architect Decision: Include as Zone C (TASK-VNINDEX-RS-C, parallel to A+B)**

VNINDEX data depth (Zone A) + watchlist universe (Zone C) are BOTH required for RS to serve correctly. The acceptance gate uses explicit tickers so technically Zone C doesn't block the gate, but including it in the same sprint avoids a follow-on RC4 cycle.

**FR-C1: Read watchlist from SQLite at startup (not env var)**

In `apps/technical-analysis/cmd/server/main.go`, after `parseWatchlist()`:
```go
// FR-C1: watchlist fallback — read from SQLite watchlist table when env is empty
if len(watchlist) == 0 {
    dbPath := envStr("DB_PATH", "./data/market.db")
    if rows, err := readWatchlistFromDB(dbPath); err == nil && len(rows) > 0 {
        watchlist = rows
        slog.Info("WATCHLIST_TICKERS not set — resolved from DB watchlist table",
            "count", len(watchlist))
    } else {
        slog.Warn("WATCHLIST_TICKERS not set and DB watchlist empty — RS/momentum outputs will be empty")
    }
}
```

**Helper function (same file or new `startup.go`):**
```go
func readWatchlistFromDB(dbPath string) ([]string, error) {
    db, err := sql.Open("sqlite", dbPath+"?mode=ro")
    if err != nil { return nil, err }
    defer db.Close()
    rows, err := db.Query("SELECT code FROM watchlist ORDER BY code")
    if err != nil { return nil, err }
    defer rows.Close()
    var codes []string
    for rows.Next() {
        var code string
        if err := rows.Scan(&code); err != nil { continue }
        codes = append(codes, code)
    }
    return codes, rows.Err()
}
```

**DDD layer:** composition root (`cmd/server/main.go`) — permitted to read DB for wiring.
**RULE:** Do NOT hardcode tickers in `docker-compose.yml` — watchlist SSOT = SQLite `watchlist` table (populated by MCP server from `system-map.json`).
**RULE:** Do NOT add VNINDEX to the watchlist table — VNINDEX is the benchmark, not a cross-section ticker. The `readWatchlistFromDB` result is passed directly as the cross-section universe.

### Why TA svc RS computation needs NO structural changes

The TA svc RS computation code is architecturally correct:
1. `ComputeRelativeStrengthUseCase.Execute` always prepends VNINDEX to fetchCodes
2. `SQLiteMultiTickerOHLCVRepository.GetMultiTickerCandles` uses per-code subqueries (post-RC2 fix) — handles VNINDEX identically to stocks
3. `RelativeStrengthService.ComputeCrossSection` correctly applies FR-6 partial RS rules
4. Uses `limit=260` (> horizonBars252=252) per ticker — correct

The only missing piece is VNINDEX data depth in `daily_ohlcv`. The TA svc will compute
correctly once daily_ohlcv has >= 64 bars for VNINDEX (h63), >= 127 for h126, >= 253 for h252.

### Reuse Patterns

- Reuse existing `/api/push-ohlcv-history` endpoint — no new endpoint needed
- Reuse existing `validateOhlcvUnit` type="stock" path — VNINDEX ~1200 passes stock range
- Add `type` field to push payload for semantic correctness (optional but clean)
- Reuse `ohlcvHistoryBackfillJob` queue trigger mechanism — already fires if VNINDEX depth < 500

---

## Design Decisions

### Zone A — VPS Script (`vps-scripts/fetch-ohlcv-backfill.sh`)

**FR-A1: Add dedicated VNINDEX historical fetch**

Before the watchlist ticker loop (or as a separate block after the guard is removed), add:

```bash
# ── VNINDEX dedicated fetch (SUBTASK-B) ──────────────────────────────────────
# stock_prices has no index data; use vnmarket_prices dedicated index endpoint.
VNMARKET_BASE="https://api-finfo.vndirect.com.vn/v4/vnmarket_prices"

VNINDEX_RESP=$(curl -s --connect-timeout 10 --max-time 30 \
  "${VNMARKET_BASE}?q=code:VNINDEX&fromDate=${FROM_DATE}&toDate=${TO_DATE}&sort=date&size=750" \
  -H "User-Agent: ${VNDIRECT_UA}" \
  -H "Accept: application/json" 2>/dev/null || echo "")

VNINDEX_LEN=$(echo "$VNINDEX_RESP" | jq '.data | length' 2>/dev/null || echo "0")
if [ "$VNINDEX_LEN" -gt 0 ]; then
  VNINDEX_BARS=$(echo "$VNINDEX_RESP" | jq -c '[
    .data[]? |
    select(.date != null and .close != null and (.close | tonumber? // null) != null) |
    {
      date:   .date,
      open:   ((.open  // .close) | tonumber),
      high:   ((.high  // .close) | tonumber),
      low:    ((.low   // .close) | tonumber),
      close:  (.close             | tonumber),
      volume: ((.accumulatedVol // .nmVolume // 0) | tonumber)
    } |
    select(.close > 0 and .open > 0 and .high > 0 and .low > 0)
  ]' 2>/dev/null || echo "[]")

  VNINDEX_BAR_COUNT=$(echo "$VNINDEX_BARS" | jq 'length' 2>/dev/null || echo 0)
  if [ "$VNINDEX_BAR_COUNT" -gt 0 ]; then
    VNINDEX_PAYLOAD=$(jq -n --arg code "VNINDEX" --argjson bars "$VNINDEX_BARS" \
      '{"code": $code, "bars": $bars, "type": "index"}')
    VNINDEX_PUSH=$(curl -s --connect-timeout 10 --max-time 20 \
      -X POST "$OHLCV_API_URL" \
      -H "Content-Type: application/json" \
      -H "X-API-Key: $API_KEY" \
      -d "$VNINDEX_PAYLOAD" 2>/dev/null || echo "")
    VNINDEX_OK=$(echo "$VNINDEX_PUSH" | jq -r '.ok // false' 2>/dev/null || echo "false")
    VNINDEX_INS=$(echo "$VNINDEX_PUSH" | jq -r '.inserted // 0' 2>/dev/null || echo "0")
    echo "$(ts) OK [VNINDEX]: ${VNINDEX_BAR_COUNT} bars fetched from vnmarket_prices, ${VNINDEX_INS} inserted"
    TOTAL_OK=$(( TOTAL_OK + 1 ))
    BARS_PUSHED_TOTAL=$(( BARS_PUSHED_TOTAL + VNINDEX_INS ))
  else
    echo "$(ts) SKIP [VNINDEX]: 0 usable bars from vnmarket_prices response"
    TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
  fi
else
  echo "$(ts) WARN [VNINDEX]: vnmarket_prices returned 0 records (range=${FROM_DATE}..${TO_DATE})"
  TOTAL_SKIP=$(( TOTAL_SKIP + 1 ))
fi
```

**FR-A2: Remove the old VNINDEX guard** (lines 134-139) or convert to a no-op comment.

**CRITICAL RISK-1**: Verify `vnmarket_prices` supports `fromDate`/`toDate` query params for
historical range. The existing `fetchVnIndex` only uses `size=1`. If the endpoint doesn't support
date-range filtering, fallback: use `size=750&sort=date` to get the latest 750 records (which
should cover ~3yr on a daily endpoint). Dev must RAW-verify from VPS before implementation.

**FR-A3: No ×1000 normalization for VNINDEX**
The ×1000 normalization in the existing loop (`if (.close > 0 and .close < 100)`) is for stocks
in thousand-VND scale. VNINDEX values (~800-1500) do NOT need this. The R-1 normalizeThousandVnd
rule WILL NOT fire for VNINDEX since `close` (~1200) is NOT < 100. But to be explicit and safe,
the VNINDEX-specific block should NOT apply the ×1000 rule (as shown in the pseudocode above).

### Zone B — MCP Server (`apps/mcp-server/`)

**FR-B1: Add `type` field support in push-ohlcv-history handler** (`server.ts:~1246`)

Extend the handler to read optional `type` from payload (default "stock"):
```typescript
const type = (typeof payload.type === "string" && payload.type === "index") ? "index" : "stock";
// ...
const guardResult = validateOhlcvUnit(code, type, open, high, low, close);
```

This is a 2-line change. It enables correct semantic validation for VNINDEX as "index" type.
VNINDEX ~1200 already passes the "stock" guard (100 <= 1200 <= 10,000,000), so this is a
correctness improvement, not a functional blocker.

**FR-B2: Extend `ohlcv-backfill-done` depth probe to include VNINDEX** (`server.ts:~1457`)

Add VNINDEX to the depth query:
```typescript
// Current: only watchlist
const depthRows = db.prepare(`
  SELECT w.code, COUNT(d.code) AS cnt
  FROM watchlist w LEFT JOIN daily_ohlcv d ON d.code = w.code
  GROUP BY w.code
`).all();

// Extend: also include VNINDEX
const vnidexRow = db.prepare<{ cnt: number }, []>(
  "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = 'VNINDEX'"
).get();
const vnindexDepth = vnidexRow?.cnt ?? 0;
if (vnindexDepth < DEPTH_FLOOR) {
  shallowCodes.push({ code: 'VNINDEX', cnt: vnindexDepth });
}
```

This closes the loop so depth shortfall for VNINDEX triggers a re-queue even when all
watchlist tickers have sufficient depth.

**FR-B3: (Optional, medium priority) ohlcvStalenessCheckJob coverage**

Currently `ohlcvStalenessCheckJob` only checks watchlist tickers. Adding VNINDEX to the staleness
check is future-proofing. The dev can decide if this is in scope for this sprint.

### DDD Layer Assignment

| Change | Layer | File |
|--------|-------|------|
| VPS script VNINDEX fetch block | interface/scripts (VPS side) | `vps-scripts/fetch-ohlcv-backfill.sh` |
| push handler `type` param | interface/http | `apps/mcp-server/src/interface/mcp/server.ts` |
| backfill-done VNINDEX depth | interface/http | `apps/mcp-server/src/interface/mcp/server.ts` |

No domain or infrastructure changes required.

### Test Strategy

**Unit tests:**
- `apps/mcp-server/src/__tests__/` — extend or add push-ohlcv-history test to verify `type="index"` payload accepted; validateOhlcvUnit called with `"index"` type for code=VNINDEX
- Test `type` defaults to "stock" when omitted (backward compat)
- Test depth probe includes VNINDEX in shortfall detection

**Integration acceptance gate (RAW):**
After VPS push completes (VNINDEX bars in daily_ohlcv >= 64), verify via:
```
mcp__gateway__call_tool(server="vn-market", tool="get_relative_strength",
  arguments={"watchlist_tickers": ["VCB","FPT","HPG","BID","VHM","VIC","SSI","MSN"]})
```
Gate: `rs` non-null + `percentile` non-null for at least 1 ticker (h63 pass = 64+ bars);
full non-null for all = h252 pass (253+ bars).

---

## Risk Flags

**RISK-1 [HIGH]**: `vnmarket_prices` date-range support unverified from VPS. The existing
`fetchVnIndex` uses `size=1` without `fromDate`/`toDate`. If the endpoint doesn't support
date range, use `size=750&sort=date` as fallback to get latest 750 sessions.
**Mitigation**: Dev must RAW-probe from VPS before implementing: `curl -s "https://api-finfo.vndirect.com.vn/v4/vnmarket_prices?q=code:VNINDEX&fromDate=2024-01-01&toDate=2024-01-31&size=30&sort=date"` and verify `data` array has records with `date` field spanning the requested range.

**RISK-2 [HIGH]**: VPS script changes must be deployed to the live Vinahost VPS, not just committed locally. Ops must rsync/scp the updated `fetch-ohlcv-backfill.sh` to `/root/` on the VPS after commit. Use existing deploy procedure from `docs/policies/dev-standards.md` or `scripts/deploy-vinahost.sh`.

**RISK-3 [MEDIUM]**: `vnmarket_prices` field mapping — response has `accumulatedVol` not `nmVolume`. Jq extraction must use `(.accumulatedVol // .nmVolume // 0)` to handle API field name variation across versions.

**RISK-4 [MEDIUM]**: The TA svc uses `limit=260` for RS computation. With 253 bars needed for h252 horizon, the existing limit is correct (260 >= 253). However, if VNINDEX backfill only returns 252 bars (rare date boundary), h252 remains null. This is acceptable per FR-6 partial RS rule — only h63 and h126 would be computed.

**RISK-5 [LOW]**: `push-ohlcv-history` handler uses a direct SQLite INSERT (not `writeOhlcvBatch`). The VNINDEX bars bypass the seed-bar rejection (FR-S1), detectAndNormalizeScale, etc. This is acceptable: VNINDEX data from vnmarket_prices is already in correct scale (actual index points, no ×1000 needed, no seed-bar pattern).

**RISK-6 [LOW]**: `ohlcv_backfill_queue` may already have `retry_count >= 5` due to prior failed cycles (VNINDEX skip caused all tickers to pass stock depth check while VNINDEX remained shallow). If retry_count >= 5, the re-queue is suppressed and BUG is sent. Developer should reset retry_count on the live queue before deploying.

---

## Scan Clean

- No DDD violations — all changes in interface/scripts layer
- No new cross-service HTTP added (reuses existing /api/push-ohlcv-history)
- No security surface added (VPS script uses existing API key)
- No memory leak risk
- BUILD-STANDARD: lean (brownfield only, no new service)

---

## BUILD-STANDARD

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: dev-mcp-server drives Zone B end-to-end; developer handles Zone A VPS script
```

---

## PM Notes

Split into 3 tasks:
- **TASK-VNINDEX-RS-A** (developer, vps-scripts): FR-A1 + FR-A2 VPS script dedicated VNINDEX fetch + VPS deploy
- **TASK-VNINDEX-RS-B** (dev-mcp-server): FR-B1 type field support + FR-B2 depth probe VNINDEX extension
- **TASK-VNINDEX-RS-C** (dev-technical-analysis): FR-C1 watchlist DB fallback in main.go + unit tests

TASK-A MUST deploy to VPS (not just commit) — only then will VNINDEX bars appear in daily_ohlcv.
TASK-B and TASK-C can run in parallel.
Acceptance gate requires TASK-A to be live on VPS + VNINDEX to have >= 64 bars in daily_ohlcv.
Full h252 RS (all horizons) requires 253 VNINDEX bars — VPS may need 1-2 daily cron cycles to reach this.

Acceptance gate command:
```
mcp__gateway__call_tool(server="vn-market", tool="get_relative_strength",
  arguments={"watchlist_tickers":["VCB","FPT","HPG","BID","VHM","VIC","SSI","MSN"]})
```
Gate: `rs` non-null + `percentile` non-null for at least 1 ticker (h63 requires 64+ VNINDEX bars).
Full non-null across all 3 horizons for all tickers = h252 pass (requires 253+ VNINDEX bars + 253+ per-stock).
