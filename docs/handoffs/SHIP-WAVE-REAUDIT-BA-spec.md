<!-- BA spec — SHIP-WAVE-REAUDIT — generated 2026-06-11 -->
<!-- status: APPROVED by po 2026-06-11 — see § PO Sign-off -->
# Requirement Spec: SHIP-WAVE-REAUDIT Live-Probe Audit Matrix

## PO Sign-off

**status: APPROVED** — po, 2026-06-11. Spec matches vision (19 ship-wave items, live-probe methodology, memory lessons embedded), AC clear (per-item GOOD/DEGRADED/BROKEN rubrics with thresholds), no PO blockers.

**PO product rulings (binding for architect):**
1. **A-16 reputation trend=stable → ruled DEGRADED, in-scope for a fix task (NOT monitor-only).** All 41 leaderboard items showing identical `trend="stable"` is exactly the "code not give best result" the user flagged. Architect must probe `reputation_scores` trend-column distribution; if the compute produces only "stable", fix the trend-delta logic in the scheduler. This is a required deliverable, not a deferred investigation.
2. **NFR-C-1 stale-flag (Option A handler-level vs Option B middleware decorator) is a TECHNICAL-design decision — architect rules it, no PO input needed.** Whichever is chosen, the user-visible outcome is non-negotiable: any endpoint serving data past its staleness threshold MUST surface a consumer-visible stale indicator. That is product AC; the implementation mechanism is architect's call.
3. **Fix priority is correct as written:** BROKEN → DEGRADED → improvement-lane NFR. NFR-C-8 (news-buzz no-direction) is correctly out-of-scope (buzz is magnitude). 
4. **B-01/B-02 are verify-only** unless live probe proves the shipped fix ineffective — concur. QA waits for the next cron cycle before judging B-02 (evidence pipeline), per Edge Cases.

---

**Sprint:** SHIP-WAVE-REAUDIT
**BA task:** BA-SHIP-WAVE-REAUDIT
**Produced by:** ba
**Date:** 2026-06-11
**Handoff to:** architect

---

## Probe Methodology (applies to all 19 items)

- **Live DB:** named volume `vn-market-intelligence-mcp_market_data` mounted at `/app/data/market.db` inside container `vn-market-intelligence-mcp-mcp-server-1`. Host `./data/market.db` is a stale decoy. All DB freshness checks must query via `docker exec`.
- **Contract source:** live payload from probed endpoints, not schema comments.
- **Verdict rubric:** GOOD = non-empty, well-shaped, directional where required, stale-flagged when stale, no prose-where-structured. DEGRADED = 200 + data present but shape/direction/staleness defect. BROKEN = 200 + empty data that should not be empty, or structural contract violation.
- **mcp-server base:** `http://localhost:3000`
- **Frontend base:** `http://localhost:3001` (Remix dev) or `:3001/dashboard/<page>`

---

## Part A — 17 TASK-17 Endpoint + Page Pairs

---

### A-01 · alerts

**Curl probe:**
```
curl -s http://localhost:3000/api/alerts?limit=100
```
**Frontend loader path:** `dashboard.alerts.tsx` → `GET /api/alerts?limit=100` via proxy `api.alerts.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "items": [
    {
      "id": "string",
      "triggeredAt": "ISO8601",
      "severity": "low|medium|high|critical",
      "signals": [{ "type": "string", "severity": "string", "message": "string", "confidence": 0.0 }],
      "affectedActions": [{ "code": "string", "expectedImpact": "string", "confidence": 0.0 }],
      "message": "string|null",
      "read": 0,
      "sentBy": "string",
      "confidenceScore": 0.0,
      "outcome": "string|null"
    }
  ],
  "count": 50,
  "fetchedAt": "ISO8601"
}
```
Live: count=50, severity distribution present, triggeredAt up to 2026-06-11T18:15Z.

**GOOD rubric:**
- `count ≥ 1`, `items.length ≥ 1`
- All items have `severity` in `{low,medium,high,critical}`
- `triggeredAt` within last 24h (live trading day)
- `signals[].message` in Vietnamese where type=macro_deviation

**DEGRADED rubric:**
- `count > 0` but `signals[].confidence === 0` on all items (zero-confidence across board)
- `triggeredAt` > 48h stale with no `stale: true` flag

**BROKEN rubric:**
- `items === []` or `count === 0` on any active trading day
- HTTP 200 + `{ error: "..." }` JSON

**Improvement NFR (NFR-A01-1):** `signals[].confidence === 0` on 100% of items is a data-quality flag, not a rubric failure by itself, but architect must note whether zero-confidence is a known default or a missing-compute defect.

---

### A-02 · foreign-flow

**Curl probe:**
```
curl -s http://localhost:3000/api/foreign-flow?limit=200
```
**Frontend loader path:** `dashboard.foreign-flow.tsx` → proxy `api.foreign-flow.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "tradingDate": "2026-06-11",
  "items": [
    {
      "code": "string",
      "foreignVolume": 50000,
      "direction": "BUY|SELL|FLAT",
      "foreignRoom": 53829910.7,
      "currentHoldingRatio": null,
      "maxHoldingRatio": null,
      "marketCapBn": null,
      "fetchedAt": "2026-06-11 08:59:55"
    }
  ],
  "summary": { "netBuyCount": N, "netSellCount": N, "topBuys": [...], "topSells": [...] },
  "count": 103,
  "fetchedAt": "ISO8601"
}
```
Live: count=103, direction populated, but `currentHoldingRatio/maxHoldingRatio/marketCapBn` are NULL on 100% of rows.

**GOOD rubric:**
- `count ≥ 1`, `tradingDate` = today or last trading day
- `direction` ∈ `{BUY, SELL, FLAT}` on all items (not null)
- `foreignRoom` non-null on majority of items
- Frontend renders null `currentHoldingRatio` as "—" (not 0, not crash)

**DEGRADED rubric:**
- `currentHoldingRatio` null on >90% of items AND no `stale_fields: ["currentHoldingRatio","maxHoldingRatio","marketCapBn"]` field in response
- Frontend renders null as "0" instead of "—"

**BROKEN rubric:**
- `items === []`, or `direction` missing/null on all rows

**Improvement NFR (NFR-A02-1):** Response SHOULD carry `stale_fields: string[]` listing columns that could not be fetched this run, so frontend can show a targeted "unavailable" badge rather than a generic "—". Architect to decide whether to add this to the endpoint contract or leave as is with documented limitation.

---

### A-03 · agm-plan-actual

**Curl probe:**
```
curl -s "http://localhost:3000/api/agm-plan-actual?year=2025"
```
**Frontend loader path:** `dashboard.agm-plan-actual.tsx` → proxy via `api.agm-plan-actual.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "defaultYear": 2025,
  "availableYears": [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019],
  "items": [
    {
      "stockCode": "string",
      "year": 2025,
      "metrics": [
        {
          "ptid": 5,
          "label": "Doanh thu",
          "plan_ty": null,
          "actual_ty": 154992.934,
          "completion_pct": null,
          "status": "IN_PROGRESS",
          "ytd_ty": 43796.484,
          "ytd_term_id": 5
        }
      ]
    }
  ],
  "summary": { "year": 2025, "exceeded": 37, "onTrack": 10, "behind": 13, "inProgress": 36, "total": 96 },
  "count": 32
}
```
Live: 32 items, 96 metrics total, 36 IN_PROGRESS (plan_ty null = normal for open year), `agm_actuals` freshest row 2026-06-09T20:30Z.

**GOOD rubric:**
- `count ≥ 1`, `availableYears` includes current year and prior year
- `summary.total > 0`
- `IN_PROGRESS` items rendered as "Đang thực hiện" with "—" for plan, NOT as "0" or red BEHIND bar
- `completion_pct` null rendered as "—" not "0%"

**DEGRADED rubric:**
- Frontend renders `IN_PROGRESS` with null `plan_ty` as "0 tỷ" or "0%" or red
- `agm_actuals.fetched_at` > 3 days stale with no stale notice

**BROKEN rubric:**
- `items === []` for a year that has known AGM data

---

### A-04 · prediction-claims

**Curl probe:**
```
curl -s http://localhost:3000/api/prediction-claims
```
**Frontend loader path:** `dashboard.prediction-claims.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "calibration": {
    "total": 7, "resolved": 4, "correct": 3, "wrong": 1,
    "pending": 3, "hitRate": 0.75, "avgBrier": 0.138
  },
  "claims": [
    {
      "id": 7, "stock": "GAS", "agentId": "08-prediction-synthesizer",
      "claimText": "string (Vietnamese)",
      "direction": "bullish|bearish",
      "targetPrice": 78960, "creationPrice": 75200,
      "confidence": 0.61,
      "resolutionDate": "2026-05-23",
      "outcome": "pending|correct|wrong",
      "actualPrice": null, "brierScore": null,
      "createdAt": "string", "resolvedAt": "string|null"
    }
  ],
  "count": 7
}
```
Live: 7 claims (3 pending, 3 correct, 1 wrong), hitRate=0.75.

**GOOD rubric:**
- `count ≥ 1`, `calibration.total ≥ 1`
- `claims[].claimText` is Vietnamese prose (not JSON blob)
- `claims[].direction` ∈ `{bullish, bearish, neutral}`
- Pending claims with `actualPrice: null` rendered as "Đang chờ" not "null" or crash

**DEGRADED rubric:**
- All claims `outcome === "pending"` with `resolutionDate` in the past (overdue, not resolved)
- `count === 7` unchanged for >30 days = no new predictions being generated

**BROKEN rubric:**
- `claims === []` with no explanation

---

### A-05 · conviction-history

**Curl probe:**
```
curl -s http://localhost:3000/api/conviction-history
```
**Frontend loader path:** `dashboard.conviction-history.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "tradingDate": "2026-06-09",
  "snapshot": [
    { "symbol": "BSR", "date": "2026-06-09", "peakScore": 0.58, "signal": "bearish" }
  ],
  "series": {
    "HPG": [ { "date": "2026-04-01", "peakScore": 0.56, "signal": "neutral" } ]
  },
  "summary": { "symbols": 52, "bullish": 12, "bearish": 19, "neutral": 21, "unknown": 0, ... }
}
```
Live: snapshot=52 symbols, series=52 symbols (full coverage), tradingDate=2026-06-09 (2 days behind today 2026-06-11).

**GOOD rubric:**
- `snapshot.length ≥ 1`, `series` keys cover all snapshot symbols
- `tradingDate` within last 3 trading days
- `signal` ∈ `{bullish, bearish, neutral, unknown}` — no null
- `peakScore` ∈ [0.0, 1.0]

**DEGRADED rubric:**
- `tradingDate` is 2026-06-09 while today is 2026-06-11 = 2-day staleness (2 trading days). Response carries no `stale: true` flag. This is DEGRADED: stale data served without staleness annotation.
- All `signal` values concentrate to a single bucket (e.g. 100% neutral = compute defect)

**BROKEN rubric:**
- `snapshot === []` or `series === {}`

**Improvement NFR (NFR-A05-1):** Response must carry `stale: boolean` and `staleByDays: number` when `tradingDate < today - 1 trading day`. Architect determines whether this is added at handler or mcp-server scheduler layer.

---

### A-06 · market-summaries

**Curl probe (LIST):**
```
curl -s "http://localhost:3000/api/market-summaries?period=daily&limit=5"
```
**Curl probe (DETAIL):**
```
curl -s "http://localhost:3000/api/market-summaries?id=daily-2026-06-11"
```
**Frontend loader path:** `dashboard.market-summaries.tsx` (dual-mode SSR)

**Live contract LIST (probed):**
```json
{
  "generatedAt": "ISO8601",
  "periods": { "daily": 77, "weekly": 13, "monthly": 5, "quarterly": 2, "yearly": 1 },
  "items": [
    {
      "id": "daily-2026-06-11",
      "periodType": "daily",
      "periodStart": "2026-06-11", "periodEnd": "2026-06-11",
      "createdAt": "ISO8601",
      "newsCount": 62, "alertCount": 38, "reportCount": 3,
      "summaryPreview": "=== Daily Market Intelligence Summary ===\nPeriod: ...",
      "keyEventCount": 49, "stockCount": 121
    }
  ],
  "count": 60
}
```
**Live contract DETAIL (probed):**
```json
{
  "generatedAt": "ISO8601",
  "item": {
    "summaryText": "=== Daily Market Intelligence Summary ===\nPeriod: ...",
    "keyEvents": [ { "date": "ISO8601", "title": "string", "impact": "string", "direction": "up|down|" } ],
    "stockPerformance": [ { "symbol": "VCB", "firstPrice": 61600, "lastPrice": 61600, "changePct": -0.16, "alertCount": 1 } ],
    "recommendations": [ { "symbol": "VCB", "outlook": "neutral|bullish|bearish", "confidence": 0.5, "reasoning": "string" } ]
  }
}
```

**GOOD rubric:**
- LIST: `periods.daily ≥ 1`, latest item has today's date
- DETAIL: `item.summaryText` is non-empty, `stockPerformance.length ≥ 1`, `changePct` is a signed number
- Frontend renders `summaryText` with `whitespace-pre-wrap` (verified: L840 `whitespace-pre-wrap`) — prose format is intentional

**DEGRADED rubric (Improvement lane):**
- `summaryText` is ASCII-art prose (`=== ... ===` format) exposed in structured JSON field. Frontend renders it as `whitespace-pre-wrap` which is readable but not structured. This is the "prose-where-JSON" improvement-lane item: the field is technically rendered, but the content model is sub-optimal for frontend consumers that could benefit from structured sections.
- `stockPerformance[].changePct` present but no `direction` field — consumer must infer sign manually. NFR: add `direction: "up"|"down"|"flat"` to stockPerformance items.

**BROKEN rubric:**
- DETAIL: `item === null` for a known existing id
- LIST: `items === []` when summaries table has rows

**Improvement NFR (NFR-A06-1):** `summaryText` SHOULD either (a) be replaced by a structured object `{ sections: [{title, lines}] }` or (b) carry a `format: "ascii_prose"` field so consumers can select appropriate renderer. Improvement lane, not blocking GOOD verdict.

**Improvement NFR (NFR-A06-2):** `stockPerformance` items SHOULD carry `direction: "up"|"down"|"flat"` derived from sign of `changePct` for consistent directional rendering.

---

### A-07 · sector-rotation

**Curl probe:**
```
curl -s http://localhost:3000/api/sector-rotation
```
**Frontend loader path:** `dashboard.sector-rotation.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "tradingDate": "2026-06-11T18:45:03Z",
  "priceSource": "stored",
  "only1dAvailable": true,
  "sectors": [
    {
      "sector": "agriculture",
      "sectorNameVi": "Nông nghiệp & Thủy sản",
      "classification": "NEUTRAL",
      "avg1dReturn": 2.135,
      "avg5dReturn": null,
      "stockCount": 2,
      "stocks": ["GVR", "VNH"],
      "watchlistWarning": false
    }
  ]
}
```
Live: 14 sectors, `only1dAvailable: true`, ALL `avg5dReturn: null`. Frontend explicitly handles `only1dAvailable` flag (verified L395+ in dashboard.sector-rotation.tsx).

**GOOD rubric:**
- `sectors.length ≥ 1`
- `tradingDate` within last trading day
- `only1dAvailable` flag present (boolean); when true, `avg5dReturn: null` is expected and frontend shows info banner
- `classification` ∈ `{LEADING, LAGGING, NEUTRAL}`
- `avg1dReturn` is a signed float (not null) on all sectors

**DEGRADED rubric:**
- `only1dAvailable: true` persists for more than 5 consecutive trading days (data pipeline not building 5d history)
- `avg1dReturn: null` on any sectors even when `only1dAvailable: false`

**BROKEN rubric:**
- `sectors === []`
- `only1dAvailable` field missing (breaks frontend logic)

---

### A-08 · sector-cascade

**Curl probe:**
```
curl -s "http://localhost:3000/api/sector-cascade?days=7"
```
**Frontend loader path:** `dashboard.sector-cascade.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "windowDays": 7,
  "windowStart": "2026-06-04 19:19:07",
  "source": "cascade_rules",
  "sectors": [
    { "sector": "tech", "up": 21, "down": 2, "neutral": 16, "total": 39, "netBias": 19 }
  ]
}
```
Live: 17 sectors, window=7 days, source=cascade_rules, netBias computed.

**GOOD rubric:**
- `sectors.length ≥ 1`
- `windowStart` within `windowDays` days of today
- `total = up + down + neutral` for every sector
- `netBias = up - down` for every sector

**DEGRADED rubric:**
- `windowStart` is > `windowDays + 1` days stale (data not refreshing)
- `source` is not `cascade_rules` without explanation

**BROKEN rubric:**
- `sectors === []`
- Any sector has `total === 0` (impossible if cascade_rules ran)

---

### A-09 · kinh-dich-signals

**Curl probe:**
```
curl -s "http://localhost:3000/api/kinh-dich-signals?source=cycle"
```
**Frontend loader path:** `dashboard.kinh-dich-signals.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "tradingDate": "2026-06-11",
  "source": "cycle",
  "snapshot": [
    {
      "stockCode": "string",
      "timestamp": "2026-06-11 08:17:03",
      "hexagramNumber": N,
      "hoQueNumber": N,
      "bienQueNumber": N,
      "hexagramName": "string",
      "action": "string",
      "sentiment": "string",
      "trend": "string",
      "confidence": 0.5,
      "actionNote": "string",
      "source": "string"
    }
  ],
  "flips": [
    { "stockCode": "string", "fromAction": "THAN TRONG", "toAction": "MUA", "toSentiment": "positive", "confidence": 0.563, "timestamp": "2026-04-23 08:30:05" }
  ],
  "summary": { ... }
}
```
Live: snapshot=57 stocks, `tradingDate=2026-06-11`, `kinhdich_readings` latest=2026-06-11 08:17Z. Flips count=1, flip timestamp=2026-04-23 (old).

**GOOD rubric:**
- `snapshot.length ≥ 1`
- `tradingDate` = today (readings confirmed live at 08:17 today)
- `source` = "cycle"
- `confidence` ∈ [0.0, 1.0] on all snapshot items

**DEGRADED rubric:**
- `flips` has entries with `timestamp` older than 30 days while `snapshot` is fresh = flip detection not firing on recent data. Not necessarily broken (market may not have flips), but requires architect check on whether flip detection runs on each cycle.
- `action` values are Vietnamese strings — must map to frontend display labels via `actionLabel()`. If unmapped values appear, frontend falls back to raw string.

**BROKEN rubric:**
- `snapshot === []`
- `tradingDate` > 2 days stale

---

### A-10 · global-markets

**Curl probe:**
```
curl -s "http://localhost:3000/api/global-markets?window=7"
```
**Frontend loader path:** `dashboard.global-markets.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "currentAt": "2026-06-11T18:15:02.974Z",
  "source": "yahoo",
  "window": 7,
  "indicators": [
    {
      "key": "brent_crude_usd",
      "label": "Dầu Brent",
      "unit": "USD/thùng",
      "group": "commodities",
      "current": 90.7,
      "prev24h": 94.29, "delta24h": -3.59, "deltaPct24h": -3.807, "direction24h": "down",
      "prev7d": 94.6, "delta7d": -3.9, "deltaPct7d": -4.123, "direction7d": "down"
    }
  ],
  "series": { ... }
}
```
Live: 12 indicators, all have `direction24h` non-null, all `delta24h` non-null, `currentAt` = today.

**GOOD rubric:**
- `indicators.length ≥ 1`
- ALL indicators: `direction24h` ∈ `{up, down, flat}` (non-null)
- ALL indicators: `delta24h` non-null, `deltaPct24h` non-null
- `currentAt` within last 4h
- Labels in Vietnamese

**DEGRADED rubric:**
- Any indicator has `current === null` (data fetch failure, source down)
- `currentAt` > 8h stale

**BROKEN rubric:**
- `indicators === []`
- Any indicator missing `direction24h` field

This endpoint is GOOD per live probe. Direction and delta are fully populated.

---

### A-11 · corporate-events

**Curl probe:**
```
curl -s "http://localhost:3000/api/corporate-events?days=90"
```
**Frontend loader path:** `dashboard.corporate-events.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "windowDays": 90,
  "since": "2026-03-13",
  "asOf": "2026-06-11",
  "typeFilter": null,
  "events": [
    {
      "code": "VJC",
      "eventType": "ISS",
      "category": "issuance",
      "categoryLabel": "Phát hành cổ phiếu",
      "title": "string",
      "detail": "string",
      "eventDate": "2026-06-08"
    }
  ]
}
```
Live: 242 events, `vnstock_events` latest event_date=2026-06-08 (3 days stale).

**GOOD rubric:**
- `events.length ≥ 1`
- `asOf` within last 3 days
- `categoryLabel` is Vietnamese
- `eventDate` within `windowDays` range

**DEGRADED rubric:**
- `asOf` or latest `eventDate` > 3 days stale (vnstock_events shows latest=2026-06-08 vs today 2026-06-11)

**BROKEN rubric:**
- `events === []` for a 90-day window

---

### A-12 · shareholders

**Curl probe:**
```
curl -s "http://localhost:3000/api/shareholders?code=BID"
```
**Frontend loader path:** `dashboard.shareholders.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "asOf": "2026-04-14T18:08:47.720Z",
  "codes": ["BID", "BSR", "DGC", ...],
  "selectedCode": "BID",
  "holders": [
    { "rank": 1, "name": "Ngân Hàng Nhà Nước Việt Nam", "quantity": 5586154083, "ownPercent": 79.56 }
  ],
  "selectedSummary": { ... }
}
```
Live: 77 holders for BID, `asOf=2026-04-14` (58 days stale), 32 distinct codes in vnstock_shareholders.

**GOOD rubric:**
- `holders.length ≥ 1` for a valid code
- `asOf` present (stale data is expected for quarterly filings — this is a slow-changing dataset)
- `ownPercent` is non-null
- `codes` list non-empty

**DEGRADED rubric:**
- `asOf` > 90 days stale without a `stale_notice: true` flag. Currently 58 days (2026-04-14) — borderline. Add `stale_notice: true` when `asOf` > 60 days.

**BROKEN rubric:**
- `holders === []` for a code that has known shareholders

---

### A-13 · officers

**Curl probe:**
```
curl -s "http://localhost:3000/api/officers?code=BID"
```
**Frontend loader path:** `dashboard.officers.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "asOf": "ISO8601",
  "codes": ["BID", ...],
  "selectedCode": "BID",
  "officers": [
    { "rank": 1, "name": "Lê Kim Hòa", "position": "string", "ownPercent": 0, "quantity": 73713, "appointmentYear": 1997 }
  ],
  "selectedSummary": { ... }
}
```
Live: 24 officers for BID, `vnstock_officers` latest=2026-06-10T21:00Z (fresh), 32 codes.

**GOOD rubric:**
- `officers.length ≥ 1` for valid code
- `asOf` within last 7 days (officers table refreshes nightly)
- `position` is non-null Vietnamese string

**DEGRADED rubric:**
- `asOf` > 7 days stale
- `ownPercent` = 0 for ALL officers (expected for most, but some execs hold shares — not a defect by itself)

**BROKEN rubric:**
- `officers === []` for a code that has known officers

---

### A-14 · financials

**Curl probe:**
```
curl -s http://localhost:3000/api/financials
```
**Frontend loader path:** `dashboard.financials.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "asOf": "2026-04-15T10:00:15Z",
  "count": 78,
  "rows": [
    {
      "code": "ACB",
      "period": "2025Q4",
      "yearReport": 2025, "quarter": 4,
      "revenueBn": 16080.42, "revenueYoy": 18.95,
      "netProfitBn": 2784.68, "netProfitYoy": -38.74,
      "eps": 542, "pe": 7.81, "pb": 1.29,
      "roe": 17.56, "roa": 1.65,
      "debtToEquity": 9.85, "netProfitMargin": 39.26,
      "nim": null, "npl": null
    }
  ],
  "summary": { "count": 78, "medianPe": 14.09, "medianPb": 1.62, "medianRoe": 12.53 },
  "rankings": { "cheapestPe": [...], "highestRoe": [...], "highestRevenueYoy": [...] }
}
```
Live: 78 rows, `asOf=2026-04-15` (57 days stale).

**GOOD rubric:**
- `count ≥ 1`
- `rows[].period` in format `YYYYQn`
- `summary.medianPe`, `medianPb`, `medianRoe` non-null
- `rankings` arrays non-empty

**DEGRADED rubric:**
- `asOf=2026-04-15` = 57 days stale. No `stale_notice` in response. FIX-VNSTOCK-FUNDAMENTALS (commit f4f5ce65) adds fail-loud observability when next refresh writes 0 rows, but the periodic refresh is weekly (Mon 01:00 UTC). For this endpoint to reach GOOD: `asOf` must be within 14 days, or response must carry `stale_notice: true` with `asOf` date.

**BROKEN rubric:**
- `count === 0` or `rows === []`
- `summary.medianPe === null` when rows exist

**Improvement NFR (NFR-A14-1):** `revenueYoy` and `netProfitYoy` are present as signed floats but no `direction` field. Screener renders color via sign of value (correct), but should also carry `yoyDirection: "up"|"down"|"flat"` for accessibility and filter use.

---

### A-15 · fed-rates

**Curl probe:**
```
curl -s http://localhost:3000/api/fed-rates
```
**Frontend loader path:** `dashboard.fed-rates.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "asOf": "2026-06-09",
  "effr": 3.62,
  "iorb": 3.65,
  "spread": -0.03,
  "trend30d": "stable",
  "sampleCount": 122,
  "series": [
    { "date": "2025-12-15", "effr": 3.64, "iorb": 3.65, "spread": -0.01 }
  ]
}
```
Live: `fred_series_daily` has 8290 rows, latest date=2026-06-11, `asOf=2026-06-09` (2 days).

**GOOD rubric:**
- `effr` and `iorb` are non-null floats
- `trend30d` ∈ `{rising, falling, stable}`
- `series.length ≥ 30` (enough for 30d trend chart)
- `asOf` within last 3 business days

**DEGRADED rubric:**
- `asOf=2026-06-09` vs `fred_series_daily.MAX(date)=2026-06-11` = 2-day gap in served `asOf` vs underlying data. The response `asOf` may lag the DB. Architect must confirm whether `asOf` is MAX(date) from DB query or is calculated differently.

**BROKEN rubric:**
- `effr === null` or `iorb === null`
- `series === []`

---

### A-16 · reputation

**Curl probe:**
```
curl -s http://localhost:3000/api/reputation
```
**Frontend loader path:** `dashboard.reputation.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "asOf": "2026-06-09",
  "summary": { "total": 41, "avgScore": N, "byRisk": { ... } },
  "leaderboard": [
    { "code": "CTG", "score": 70, "trend": "stable", "riskLevel": "safe" }
  ],
  "history": {
    "ACB": [ { "date": "2026-05-18", "score": 50 }, ... ]
  }
}
```
Live: 41 leaderboard items, `asOf=2026-06-09` (2 days), `reputation_scores` computed_at=2026-06-09. ALL trend values = "stable".

**GOOD rubric:**
- `leaderboard.length ≥ 1`
- `asOf` within last 3 days
- `trend` ∈ `{improving, stable, deteriorating}` (not all same value)
- `history` is a dict keyed by code, each value is a non-empty array

**DEGRADED rubric (Improvement lane):**
- ALL 41 leaderboard items have `trend === "stable"`. This is statistically improbable for a real market dataset covering 30 tickers over weeks. Either the trend-computation logic produces only "stable" (compute defect) or all stocks genuinely stabilized (unlikely). Architect must probe the `reputation_scores` table for trend column distribution and verify the trend-compute logic in the scheduler.
- `history[code]` arrays have only 5-6 data points (sparse) — sparklines will appear flat even when movement occurred.

**BROKEN rubric:**
- `leaderboard === []`
- `history === {}` or `history === []` (wrong type)

---

### A-17 · news-buzz

**Curl probe:**
```
curl -s http://localhost:3000/api/news-buzz
```
**Frontend loader path:** `dashboard.news-buzz.tsx`

**Live contract (probed 2026-06-11):**
```json
{
  "generatedAt": "ISO8601",
  "windowStart": "2026-06-04 14:00:00",
  "windowEnd": "2026-06-11T14:00:00Z",
  "summary": { "distinctCodes": 26, "totalMentions": 94, "totalNegative": 43, "totalSources": 74 },
  "leaderboard": [
    {
      "code": "VIC",
      "mentions": 17, "negative": 3, "sources": 13,
      "hoursActive": 12, "negativeRatio": 0.18
    }
  ]
}
```
Live: 26 tickers, 7-day window, `negativeRatio` ∈ [0.0, 1.0] (raw fraction, not percent).

**GOOD rubric:**
- `leaderboard.length ≥ 1`
- `windowEnd` within last 24h
- `negativeRatio` ∈ [0.0, 1.0] rendered as `%` by frontend via `formatNegativeRatioPct`
- No `direction` field needed here — buzz is magnitude, not directional

**DEGRADED rubric:**
- `totalMentions === 0` on a news-active day
- `windowEnd` > 48h stale

**BROKEN rubric:**
- `leaderboard === []`

---

## Part B — 2 Fix Items

---

### B-01 · FIX-VNSTOCK-FUNDAMENTALS (commit f4f5ce65)

**What was fixed:** 4 fixes to the vnstock fundamentals scheduler:
- Fix 4 (critical): `vnstockStartupProbe` now distinguishes DB write-wedge errors (`"Cannot use a closed database"`, `"unable to open database"`, `"disk I/O error"`) and returns early without firing the sweep, breaking the OOM restart cascade (Mode B).
- Fix 3: Startup probe wrapped in `jobRunRepo.wrapRun` — probe crashes now appear in `cron_job_runs` with `status=error`.
- Fix 2: `runVnstockFundamentalsJob` measures actual DB row delta before/after and fires WORK alert when `rowsWritten=0` with `tickers>0` (Mode A silent-drop).
- Fix 1: datetime('now') in `storeFinancials`.

**Live probe to verify fix is active:**
```
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e "
const {Database} = await import('bun:sqlite');
const db = new Database('/app/data/market.db', {readonly: true});
const runs = db.query(\"SELECT job_name, status, rows_written, started_at FROM cron_job_runs WHERE job_name='vnstockFundamentalsRefresh' ORDER BY started_at DESC LIMIT 5\").all();
console.log(JSON.stringify(runs));
db.close();
"
```
Expected: entries for `vnstockFundamentalsRefresh` with `status` ∈ `{success, error}` and `rows_written` populated.

**GOOD rubric:**
- `cron_job_runs` has at least 1 entry for `vnstockFundamentalsRefresh` with `status` field populated
- No row with `status=running` stuck for > 30min (concurrency guard active)
- `vnstock_financials` table has data (`count > 0`)

**DEGRADED rubric:**
- `vnstock_financials.fetched_at` > 14 days (weekly refresh may have silently dropped) AND `cron_job_runs` shows `rows_written=0` — FIX-2 fail-loud should have fired WORK alert in that case
- Startup probe entries absent from `cron_job_runs` (Fix 3 not effective)

**BROKEN rubric:**
- `cron_job_runs` has NO entries for `vnstockFundamentalsRefresh` at all
- `vnstock_financials` has `count=0`

**MCP tool probe:** No direct HTTP endpoint exposes fundamentals raw fetch status. Probe via `cron_job_runs` as above. The `financials` HTTP endpoint (A-14) is the downstream consumer.

---

### B-02 · FIX-EVIDENCE-PIPELINE-STARVED (commit 27eaece9)

**What was fixed:**
- `foreignFlowAlertJob`: changed query from `ORDER BY date ASC LIMIT 10` (oldest 10 rows, all April 2026 zero-flow) to `ORDER BY date DESC LIMIT N` then reverse in-memory. Old query produced cumsum=0 → zero-data guard fired → all 41 watchlist stocks skipped → `evidence_fragments` empty since 2026-05-27.
- `evidenceAccumulatorJob`: now throws when `evidence_fragments` is empty, so `recordJobRun` stamps `status='error'` (was silent success).

**Live probe:**
```
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e "
const {Database} = await import('bun:sqlite');
const db = new Database('/app/data/market.db', {readonly: true});
const ef = db.query('SELECT COUNT(*) as c, MAX(timestamp) as latest FROM evidence_fragments').get();
console.log('evidence_fragments:', JSON.stringify(ef));
const runs = db.query(\"SELECT job_name, status, rows_written, started_at FROM cron_job_runs WHERE job_name LIKE '%evidence%' OR job_name LIKE '%foreignFlow%' ORDER BY started_at DESC LIMIT 5\").all();
console.log('cron_job_runs:', JSON.stringify(runs));
db.close();
"
```
**Current live state (probed 2026-06-11):** `evidence_fragments.count=0`. The fix was deployed (commit 27eaece9 is in HEAD), but the job runs on a cron schedule — it may not have fired yet since the fix was deployed. QA must wait for the next scheduled run and re-verify.

**GOOD rubric:**
- `evidence_fragments.count > 0` after the next scheduled job run
- `evidence_fragments.MAX(timestamp)` within last 24h
- `cron_job_runs` shows `foreignFlowAlertJob` (or equivalent) with `status=success` and `rows_written > 0` after the fix was deployed

**DEGRADED rubric:**
- `evidence_fragments.count > 0` but `MAX(timestamp)` > 48h stale
- `cron_job_runs` for accumulator job shows recurring `status=error` after fix

**BROKEN rubric:**
- `evidence_fragments.count=0` after 48h+ post-fix-deploy with cron confirmed running

**Downstream:** `evidence_fragments` feeds the `get_portfolio_conviction` tool and kinh-dich evidence pipeline. If empty, conviction signals may degrade. This is a producer-side fix; consumer endpoints (conviction-history A-05) may lag by 1 cron cycle.

---

## Part C — Improvement-Lane NFRs (cross-cutting)

These apply to items that return HTTP 200 + non-empty data, but have UX or contract quality gaps.

| NFR ID | Item | Gap | Required Action |
|---|---|---|---|
| NFR-C-1 | All endpoints | Stale data served without `stale: boolean` flag | Endpoints with `asOf` > threshold SHOULD add `stale: true, staleByDays: N` to response. Threshold: market data ≥ 2 trading days; financial filings ≥ 90 days. |
| NFR-C-2 | conviction-history, reputation | `tradingDate` / `asOf` lags by 2 days without consumer-visible flag | Add `stale` flag per NFR-C-1. |
| NFR-C-3 | market-summaries (summaryText) | ASCII-prose format (`=== ... ===`) in structured JSON field | Improvement lane: add `format: "ascii_prose"` or refactor to structured sections object. Not blocking GOOD verdict. |
| NFR-C-4 | market-summaries (stockPerformance) | No `direction` field on changePct | Add `direction: "up"\|"down"\|"flat"` derived from sign(changePct). |
| NFR-C-5 | foreign-flow | All of `currentHoldingRatio/maxHoldingRatio/marketCapBn` null with no explicit notice | Add `stale_fields: string[]` to response when fields could not be populated. |
| NFR-C-6 | financials | `revenueYoy`/`netProfitYoy` has no direction field | Add `yoyDirection: "up"\|"down"\|"flat"` for improved filter UX. |
| NFR-C-7 | reputation | ALL `trend === "stable"` — probable compute defect | Probe `reputation_scores` trend column distribution in DB. If compute defect confirmed, fix trend-delta logic in scheduler. This may be DEGRADED not improvement-lane. |
| NFR-C-8 | news-buzz | No `direction` field (buzz is magnitude — intentional) | No action required. Document as out-of-scope. |
| NFR-C-9 | prediction-claims | Only 7 claims, 3 pending, last `created_at=2026-05-03` = 39 days no new predictions | Probe whether prediction-synthesizer cron is active. If stale, this is a producer defect upstream of this endpoint. |

---

## Part D — DDD Layer Mapping

| Item | Fix Type | DDD Layer |
|---|---|---|
| A-01 alerts | Read-only probe + NFR | interface |
| A-02 foreign-flow | Null-fields + stale_fields NFR | interface + infrastructure |
| A-03 agm-plan-actual | Read-only probe | interface |
| A-04 prediction-claims | Read-only probe + staleness | interface |
| A-05 conviction-history | Stale flag NFR | interface |
| A-06 market-summaries | summaryText format NFR | interface |
| A-07 sector-rotation | Read-only probe | interface |
| A-08 sector-cascade | Read-only probe | interface |
| A-09 kinh-dich-signals | Read-only probe | interface |
| A-10 global-markets | GOOD — no change needed | interface |
| A-11 corporate-events | Staleness flag | interface |
| A-12 shareholders | Stale threshold NFR | interface |
| A-13 officers | Read-only probe | interface |
| A-14 financials | Stale flag + yoyDirection NFR | interface |
| A-15 fed-rates | asOf lag probe | interface |
| A-16 reputation | trend=stable defect (possible domain/infra bug in scheduler) | domain + infrastructure |
| A-17 news-buzz | Read-only probe | interface |
| B-01 VNSTOCK-FUNDAMENTALS | Scheduler + DB fix (already shipped — verify) | infrastructure |
| B-02 EVIDENCE-PIPELINE | Job fix (already shipped — verify via cron run) | infrastructure |
| NFR-C-1..9 (stale flags, direction fields) | Response contract extensions | interface |

**Zone-multi items** (fix spans mcp-server endpoint + frontend page — architect must designate `zone: multi`):
- NFR-C-4 (stockPerformance direction) — mcp-server handler change + frontend type update
- NFR-C-5 (foreign-flow stale_fields) — mcp-server handler + frontend render update
- NFR-C-7 (reputation trend defect) — infrastructure scheduler + interface handler if contract changes

---

## Blockers (PO-only decisions)

None. All items are diagnosable from live probes and code. The audit matrix above is complete with GOOD/DEGRADED/BROKEN rubrics. QA executes the probes and assigns verdicts; dev fixes DEGRADED/BROKEN; architect designs NFR implementations.

**One architect decision required before coding NFR-C-1 (stale flag):**
- Option A: Add `stale: boolean, staleByDays: number` to every endpoint response at handler level (each handler computes its own threshold).
- Option B: Add a middleware-level stale-annotation decorator that injects stale fields based on `generatedAt`/`asOf` fields.
- Architect rules on Option A vs B before dev implements.

---

## Edge Cases

- `evidence_fragments.count=0` (confirmed live): downstream conviction signals are starved. QA re-verifies AFTER next cron run (not immediately after deploy).
- `only1dAvailable: true` on sector-rotation: expected when price history < 5 days deep. Not a defect. GOOD if flag is present and frontend info banner renders.
- `IN_PROGRESS` status in AGM with null `plan_ty`: this is the normal state for the current fiscal year. Not a defect. GOOD if frontend renders "—" not "0".
- `flips` with 1 entry dated 2026-04-23 while snapshot is fresh: flip detection may not have found any recent flips. Not necessarily broken — analyst must verify whether flip-detection cron ran on recent data.
- `reputation_scores` ALL `trend=stable`: requires manual verification. If confirmed compute defect → DEGRADED verdict for A-16.

---

## Architect Handoff Notes

1. Architect must split any fix that touches both `apps/mcp-server/` and `apps/frontend/` as `zone: multi`.
2. Fix order: BROKEN items before DEGRADED items before NFR improvements.
3. FIX-VNSTOCK-FUNDAMENTALS (B-01) and FIX-EVIDENCE-PIPELINE (B-02) are already in codebase — QA verifies, no new dev work needed unless live probe shows they are not effective.
4. Ops rebuilds containers after every code change; QA re-verifies live post-rebuild before marking DONE.
5. `reputation` trend defect (NFR-C-7) may require scheduler investigation in `apps/mcp-server/src/scheduler/` — if confirmed defect, it escalates from improvement-lane to DEGRADED and gets a fix task.
