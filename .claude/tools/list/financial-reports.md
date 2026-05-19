# Financial-Reports MCP Tools

## Summary

**Category:** Financial-Reports
**Module:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/`
**Tools:** 5

Utilities for BCTC (financial report) retrieval, filing deadlines, batch processing, and queue management.

---

## Tools

### 1. `get_bctc_full`

**File:** `bctcFullTools.ts`
**Task:** Task 240
**Type:** Compound tool (reads 3 data sources in one call)

Fetches a comprehensive BCTC snapshot for a stock: **summary + QoQ/YoY comparison + 30-day sentiment trend**.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `code` | string | ✓ | Stock ticker (e.g. "VCB"). Case-insensitive. |
| `year` | number | | Fiscal year filter. Defaults to most recent. |
| `quarter` | enum | | "Q1" \| "Q2" \| "Q3" \| "Q4". Optional filter. |

#### Return Value

Plain text formatted output with three sections:

```
=== BCTC SUMMARY: VCB ===
Period: 2025-Q1 (audited)
...
Income Statement, Balance Sheet, Ratios

=== QoQ/YoY COMPARISON ===
...Net Revenue, Net Profit, Margins changes

=== SENTIMENT TREND ===
30-day window | entries count | direction + slope
```

#### Monetary Units

All values are in **million VND** (stored in DB). Display formatting converts to **tỷ VND** (billions).

#### Comparison Logic

- If latest is Q2-2025 → compares to Q1-2025 (QoQ)
- If Q1 → compares to Q4 of prior year (YoY-like)
- Fallback: any earlier row if prior period not available

#### Sentiment Scoring

- Window: Last 30 days of `rag_analyses` entries
- Metric: OLS slope of sentiment trend (improving/deteriorating/stable)
- Input: `affected_actions` LIKE `%CODE%`

---

### 2. `get_earnings_calendar`

**File:** `earningsCalendarTools.ts`
**Task:** Task 187
**Type:** Calendar/status tool

Shows BCTC filing deadlines and current status for all watchlist stocks.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `_testDate` | string | | Test-only override (ISO format: YYYY-MM-DD or full datetime). |

#### Return Value

Formatted table showing all watchlist stocks:

```
=== LỊCH NỘP BCTC ===
Ngày tham chiếu: 2025-05-05

CỔ PHIẾU  QUÝ      HẠN NỘP      TRẠNG THÁI         NGÀY NỘP
--------  -------  -----------  -----------------  ----------
VCB       Q1-2025  15/03/2025   ĐÃ NỘP             2025-03-14
...
```

#### Status Labels

| Code | Vietnamese | Meaning |
|------|------------|---------|
| `DA_NOP` | ĐÃ NỘP | Already filed |
| `QUA_HAN` | QUÁ HẠN | Overdue |
| `SAP_DEN` | SẮP ĐẾN | Due within 14 days |
| `UOC_TINH` | (ước tính) | Estimated (>14 days) |

#### Filing Deadline Rules

- **Regular stocks:** 45-day deadline after quarter end
- **Banks/Insurance:** 45-day deadline per Vietnamese regulation
- **Date format:** DD/MM/YYYY (Vietnamese convention)

---

### 3. `bctc_skip_queue_item`

**File:** `bctcSkipTool.ts`
**Task:** Task 1343d
**Type:** Queue management tool

Marks a BCTC queue item as "skipped" when PDF fetch fails (404, invalid URL, etc.). Prevents infinite retries.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `action_code` | string | ✓ | Stock ticker (e.g. "FPT") |
| `period_year` | number | ✓ | Year (e.g. 2025) |
| `period_quarter` | enum | ✓ | "Q1" \| "Q2" \| "Q3" \| "Q4" |
| `skip_reason` | string | | Optional reason (e.g. "404 not found") |

#### Return Value

JSON response:

```json
{
  "success": true,
  "message": "Marked as skipped: FPT 2025 Q1 (reason: 404 not found)",
  "updates": {
    "status": "skipped",
    "attempts_incremented": true
  }
}
```

#### DB Updates

- Sets `status = 'skipped'`
- Increments `attempts` counter
- Records `last_attempt = datetime('now')`

#### Caller

Invoked by **VPS fetch-bctc.sh** script when PDF retrieval fails.

---

### 4. `run_bctc_batch_sweep`

**File:** `bctcBatchSweepTool.ts`
**Task:** Task 1841b (U-10)
**Type:** Batch processing tool

Triggers concurrent BCTC fetches for all (or a custom list of) watchlist tickers.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `tickers` | array[string] | | Optional override list (e.g. ["VCB", "HPG"]). Default: all 30 watchlist tickers. |
| `dry_run` | boolean | | If true, returns plan without fetching or sending Telegram. Default: false. |

#### Return Value

JSON response:

```json
{
  "processed": 30,
  "succeeded": 28,
  "failed": 2,
  "failures": [
    { "ticker": "ABC", "reason": "404 not found" },
    { "ticker": "DEF", "reason": "timeout" }
  ],
  "digestSent": true,
  "durationMs": 45000
}
```

#### Execution Details

- **Max concurrency:** 5 tickers at a time
- **Failure isolation:** One ticker failure does not abort batch
- **Completion digest:** Sent to MARKET Telegram channel
- **Individual failures:** Alert sent to BUG channel per ticker

#### Typical Use Cases

- Vietnamese earnings season (Jan, Apr, Jul, Oct)
- Watchlist refresh cycle
- Ad-hoc snapshot requests

#### Dry-Run Mode

When `dry_run=true`:
- Returns planned ticker list
- No API calls or Telegram messages
- Useful for preview before execution

---

### 5. `fetch_ssc_reports` (Deprecated)

**File:** `reports.ts`
**Task:** Task 085
**Status:** Legacy. Use `get_bctc_full` or batch tools instead.

---

## Database Tables

### `financial_reports`

Primary table for BCTC data.

| Column | Type | Notes |
|--------|------|-------|
| `action_code` | TEXT | Stock ticker (e.g. "VCB") |
| `period_year` | INTEGER | Fiscal year |
| `period_quarter` | INTEGER | 1-4 or NULL for annual |
| `period_type` | TEXT | "Q1", "Q2", "Q3", "Q4", or "FY" |
| `sort_key` | TEXT | "2025-Q1", "2024-FY" (for sorting) |
| `net_revenue` | REAL | In million VND |
| `net_profit` | REAL | In million VND |
| `eps` | REAL | Earnings per share (VND) |
| `extraction_confidence` | REAL | 0.0 … 1.0 |
| `published_at` | TEXT | ISO date string (YYYY-MM-DD) |
| All ratios | REAL | ROE, ROA, P/E, P/B, etc. (nullable) |

### `bctc_vps_queue`

Queue for VPS fetch requests.

| Column | Type | Notes |
|--------|------|-------|
| `action_code` | TEXT | Stock ticker |
| `period_year` | INTEGER | Year |
| `period_quarter` | TEXT | "Q1" … "Q4" |
| `status` | TEXT | "pending" \| "skipped" \| "completed" |
| `attempts` | INTEGER | Increment on each skip |
| `last_attempt` | TEXT | ISO datetime |

### `rag_analyses`

Sentiment tracking for 30-day trends.

| Column | Type | Notes |
|--------|------|-------|
| `affected_actions` | TEXT | Contains stock codes (e.g. "VCB,HPG") |
| `sentiment` | TEXT | "bullish", "bearish", "neutral" |
| `created_at` | TEXT | ISO datetime (UTC) |

---

## Error Handling

### Missing BCTC Data

If no financial report exists for the requested stock/period:

```
Chưa có dữ liệu BCTC cho VCB. Kiểm tra bằng list_stored_pdfs.
```

Suggests checking available PDFs first.

### Empty Watchlist

If watchlist is empty:

```
Danh sách theo dõi trống
(Thêm cổ phiếu vào watchlist để xem lịch nộp BCTC)
```

### Queue Item Not Found

`bctc_skip_queue_item` returns:

```json
{
  "success": false,
  "message": "Queue item not found: FPT 2025 Q1"
}
```

---

## Vietnamese Notes

- All timestamps are in **UTC** (with Vietnamese date labels in output)
- Formatting uses **Vietnamese locale** (commas for thousands, periods for decimals)
- Deadline dates are formatted **DD/MM/YYYY** (Vietnamese convention)
- All monetary values in output show **tỷ VND** (billions = million ÷ 1000)

---

## Related Tools

- `list_stored_pdfs` — Check which PDFs are available on VPS
- `get_financial_summary` — Single-period snapshot — prefer get_bctc_full for full OCR-backed KPI coverage
- `compare_financials` — Explicit YoY/QoQ comparison (legacy)

---

## Implementation Notes

- **Dependency Injection:** All tools accept optional `_testDb` parameter for unit testing
- **Query Optimization:** Reads are cached per session; no live DB polling
- **Confidence Scoring:** Extraction confidence is stored per report; sentiment slope estimated via OLS
- **Fallback Logic:** Comparison always finds a prior period if available (no error on missing quarters)

