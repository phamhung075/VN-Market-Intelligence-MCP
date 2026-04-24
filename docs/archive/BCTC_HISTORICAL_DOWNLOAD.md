# BCTC Historical Download Strategy — 8-Quarter Backfill Design

**Status:** DESIGN APPROVED (Sprint 1289, Phase 2)
**Date:** 2026-04-22
**Goal:** Download Q1-2024 through Q4-2025 BCTC reports for all 30+ watchlist stocks

---

## Context

Current state (as of 2026-04-22):
- VPS enrichment service (`enrich-bctc-urls.sh`) deployed to Vinahost, discovers direct PDF download URLs from HOSE/HNX/UPCOM portals
- Queue: 32 items, 3 done (BID/BSR/DGC test), 29 pending real PDFs
- Saves to: `data/pdfs/{STOCK_CODE}_{YEAR}_{QUARTER}.pdf`
- Main server geo-blocked from SSC; VPS has direct portal access

**Gap:** Only Q4-2025 is being enriched. Backtest + analysis require 8 quarters of historical BCTC data (Q1-2024 through Q4-2025).

---

## Design: 8-Quarter Historical Downloader

### Phase 1: Discovery Strategy

For each watchlist stock (30+ stocks), download Q1-2024, Q2-2024, ... Q4-2025 (8 quarters total).

**Discovery priority (try in order):**

1. **HOSE** (HOSE-listed companies)
   - URL: `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}`
   - Parse HTML, extract `.pdf` href from quarterly reports
   - Pattern: `/Modules/CMS/Web/.../file.pdf?...`

2. **HNX** (HNX-listed companies, mid-cap)
   - URL: `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`
   - Parse HTML, find links to BCTC disclosures (Q1, Q2, Q3, Q4 tabs)
   - Pattern: `/Assets/Download/.../{YEAR}_{QUARTER}.pdf` or similar

3. **UPCOM** (UPCOM-listed companies, small-cap)
   - URL: `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}`
   - Similar to HNX structure, managed by HNX

4. **SSC Disclosure Pages** (fallback, if portal pages fail)
   - URL: `https://congbothongtin.ssc.gov.vn/faces/NewsSearch` (generic search, not code-specific)
   - Only if HOSE/HNX/UPCOM all fail
   - Slower, requires search + click-through

### Phase 2: Implementation Architecture

#### 2a. VPS-Side Scheduler Job

**File:** `/root/bctc-historical-downloader.sh` (new)

**Responsibility:** Discover URLs, download PDFs, push to main server

**Logic:**

```bash
#!/bin/bash

# Load watchlist stocks from config or hardcoded list
STOCKS=(BID BSR DGC DIG DPM DXG EIB FPT FRT GEX HUT KBC KDC KDH MSN NVL PDR SAB SSI ...)

# For each stock
for CODE in "${STOCKS[@]}"; do
  for YEAR in 2024 2025; do
    for QUARTER in Q1 Q2 Q3 Q4; do
      # Skip future quarters (Q3-Q4 2026 don't exist yet)
      if [[ "$YEAR:$QUARTER" > "$(date +%Y:Q%q)" ]]; then
        continue
      fi

      # Try discovery chain: HOSE → HNX → UPCOM → fallback
      PDF_URL=$(try_hose "$CODE" "$QUARTER" "$YEAR" || \
                try_hnx "$CODE" "$QUARTER" "$YEAR" || \
                try_upcom "$CODE" "$QUARTER" "$YEAR" || \
                echo "")

      if [[ -z "$PDF_URL" ]]; then
        echo "SKIP: $CODE Q$QUARTER $YEAR — no URL found" >> /var/log/bctc-historical.log
        continue
      fi

      # Download PDF
      PDF_FILE="/tmp/${CODE}_${YEAR}_${QUARTER}.pdf"
      curl -s -o "$PDF_FILE" --max-time 30 "$PDF_URL"

      if [[ ! -f "$PDF_FILE" ]]; then
        echo "FAIL: $CODE Q$QUARTER $YEAR — download failed" >> /var/log/bctc-historical.log
        continue
      fi

      # Push to main server
      curl -X POST "https://zenmidi.com/api/push-bctc-pdf" \
        -F "action_code=$CODE" \
        -F "period_year=$YEAR" \
        -F "period_quarter=$QUARTER" \
        -F "source_url=$PDF_URL" \
        -F "pdf=@$PDF_FILE" \
        --max-time 30

      rm -f "$PDF_FILE"
      sleep 2  # Rate limit: 2s between requests

      echo "OK: $CODE Q$QUARTER $YEAR" >> /var/log/bctc-historical.log
    done
  done
done

echo "Historical download complete" >> /var/log/bctc-historical.log
```

#### 2b. Portal Discovery Functions (VPS)

**Functions** (to be written in VPS scripts):

```bash
try_hose() {
  local CODE=$1 QUARTER=$2 YEAR=$3
  local URL="https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=$CODE"

  # Fetch HTML, extract PDF href for the quarter
  # Pattern: look for "$QUARTER $YEAR" or "Q${QUARTER#Q} $YEAR" in the page
  # Extract .pdf href

  curl -s "$URL" | grep -i "bctc\|report" | grep "$QUARTER\|$YEAR" | grep -o 'href="[^"]*\.pdf[^"]*"' | head -1 | cut -d'"' -f2
}

try_hnx() {
  local CODE=$1 QUARTER=$2 YEAR=$3
  local URL="https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=$CODE"

  # Similar: fetch HTML, find quarterly report link
  curl -s "$URL" | grep -i "bctc\|bcđh" | grep "$QUARTER\|$YEAR" | grep -o 'href="[^"]*\.pdf[^"]*"' | head -1 | cut -d'"' -f2
}

try_upcom() {
  local CODE=$1 QUARTER=$2 YEAR=$3
  local URL="https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=$CODE"

  # Same as HNX (UPCOM uses same infrastructure)
  curl -s "$URL" | grep -i "bctc\|bcđh" | grep "$QUARTER\|$YEAR" | grep -o 'href="[^"]*\.pdf[^"]*"' | head -1 | cut -d'"' -f2
}
```

#### 2c. Main Server Endpoint (Already Exists)

**Endpoint:** `POST /api/push-bctc-pdf`

**Parameters:**
- `action_code` (string) — stock code (e.g., "BID")
- `period_year` (number) — year (e.g., 2024)
- `period_quarter` (string) — quarter (e.g., "Q1")
- `source_url` (string) — origin URL (for audit trail)
- `pdf` (file) — PDF binary content

**Location:** `src/interface/mcp/server.ts:1290–1340`

**Behavior:** Saves PDF to `data/pdfs/{ACTION_CODE}/{ACTION_CODE}_{YEAR}_{QUARTER}.pdf`, logs to `vps_push_log`.

### Phase 3: Folder Structure

```
data/pdfs/
├── BID/
│   ├── BID_2024_Q1.pdf
│   ├── BID_2024_Q2.pdf
│   ├── BID_2024_Q3.pdf
│   ├── BID_2024_Q4.pdf
│   ├── BID_2025_Q1.pdf
│   ├── BID_2025_Q2.pdf
│   ├── BID_2025_Q3.pdf
│   └── BID_2025_Q4.pdf
├── BSR/
│   ├── BSR_2024_Q1.pdf
│   ...
├── DGC/
│   ...
└── ... (30+ stocks)
```

**Total expected:** 30 stocks × 8 quarters = 240 PDFs (~200–500 MB depending on PDF size)

### Phase 4: Execution Strategy

**Option A: VPS Systemd Service (Recommended)**

Create new systemd service on VPS:

**File:** `/etc/systemd/system/vn-bctc-historical.service`

```ini
[Unit]
Description=VN BCTC Historical Download (8 quarters)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/root/bctc-historical-downloader.sh
StandardOutput=journal
StandardError=journal
User=root

[Install]
WantedBy=multi-user.target
```

**File:** `/etc/systemd/system/vn-bctc-historical.timer`

```ini
[Unit]
Description=VN BCTC Historical Download Timer
Requires=vn-bctc-historical.service

[Timer]
# Run once at 02:00 UTC (09:00 VN) every day
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

**Enable:**
```bash
systemctl daemon-reload
systemctl enable --now vn-bctc-historical.timer
systemctl start vn-bctc-historical  # Initial run
```

**Option B: One-Off Cron Job (for initial backfill)**

```bash
0 2 * * * /root/bctc-historical-downloader.sh
```

(Runs daily at 09:00 VN / 02:00 UTC)

### Phase 5: Monitoring + Observability

**Log file:** `/var/log/bctc-historical.log`

**Tail logs:**
```bash
tail -f /var/log/bctc-historical.log
```

**Expected output:**
```
OK: BID 2024 Q1
OK: BID 2024 Q2
...
SKIP: FPT 2024 Q1 — no URL found
FAIL: VNM 2024 Q2 — download failed (timeout)
OK: VNM 2024 Q3
...
Historical download complete
```

**Main server observability:**

Query `vps_push_log` for historical downloads:

```sql
SELECT COUNT(*) as total,
       SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) as ok,
       SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors
FROM vps_push_log
WHERE service = 'bctc-pdf'
  AND timestamp > datetime('now', '-1 day');
```

Expected: ~30–40 pushes/day (30 stocks × 8 quarters / 180 days ≈ 1.3 stocks/day, or ~240 PDFs / 7 days ≈ 34 PDFs/day if run weekly).

---

## Success Criteria

1. **Discovery:** ≥ 80% of 30 stocks have ≥ 4 quarters discovered (16/30 × 8 = minimum 128 PDFs)
2. **Download:** ≥ 90% of discovered URLs successfully download (minimize 404s, timeouts)
3. **Parsing:** ≥ 85% of downloaded PDFs extract financial metrics without errors (confidence ≥ 70%)
4. **Storage:** All PDFs stored in correct folder structure (`data/pdfs/{CODE}/{CODE}_{YEAR}_{QUARTER}.pdf`)
5. **Database:** All parsed reports appear in `financial_reports` table with correct quarter + year

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Portal HTML structure changes | Medium | High | Use Selenium/Playwright on VPS if regex fails; document expected selectors |
| PDF download fails (404 on portal URL) | Medium | Medium | Log source_url + error; retry failed items weekly; use fallback portal if available |
| OCR confidence < 70% | Medium | Medium | Flag low-confidence extractions; skip if margin > 100% or profit = 0 (data quality issue) |
| Rate limiting blocks VPS | Low | Medium | Add 2–5s delay between requests; use circuit breaker if portal returns 429 |
| Duplicate PDFs downloaded (old quarters redownloaded) | Low | Low | Check if PDF already exists in `data/pdfs/{CODE}/` before downloading |
| Tunnel timeout (main server unreachable) | Low | High | Retry on 503/504; queue failed items to re-push next cycle |

---

## Phases (Dev Implementation Plan)

**Phase 1: Portal Discovery Functions** (Dev Task, 2–3h)
- Write `try_hose()`, `try_hnx()`, `try_upcom()` functions in VPS script
- Test each with 3 sample stocks (BID, VNM, FPT)
- Verify URLs are directly downloadable (.pdf)

**Phase 2: VPS Scheduler Job** (Dev Task, 2h)
- Deploy `/root/bctc-historical-downloader.sh` to VPS
- Test with 5 stocks × 2 quarters (10 PDFs)
- Verify push to main server via `/api/push-bctc-pdf`

**Phase 3: Systemd Service** (Ops Task, 1h)
- Create `.service` and `.timer` files on VPS
- Enable and start
- Monitor logs for 1 week

**Phase 4: Data QA** (QA Task, 3h)
- Verify financial_reports table populated for all 30 stocks
- Spot-check 5 random PDFs for extraction accuracy
- Flag any with confidence < 70%

**Phase 5: Analysis + Backtest** (Analysis Agent, ongoing)
- Use 8-quarter BCTC data for backtesting strategies
- Compute 2-year historical ratios for all watchlist stocks
- Compare recent quarter vs. 1-year-ago to detect trends

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `/root/bctc-historical-downloader.sh` | CREATE | Main VPS script (8Q download loop) |
| `/etc/systemd/system/vn-bctc-historical.service` | CREATE | Systemd service (one-shot) |
| `/etc/systemd/system/vn-bctc-historical.timer` | CREATE | Daily timer (02:00 UTC = 09:00 VN) |
| `/var/log/bctc-historical.log` | CREATE | Log output |
| `docs/BCTC_HISTORICAL_DOWNLOAD.md` | CREATE | This design doc |
| `src/interface/mcp/server.ts` | VERIFY | POST /api/push-bctc-pdf already exists (no changes needed) |
| `data/pdfs/{CODE}/` | CREATE | Folder for each stock's 8 quarterly PDFs |

---

## Next Steps

1. **Architect approval:** Review design above
2. **Dev task:** Create Phase 1 (portal discovery functions) + test
3. **Ops deployment:** Deploy systemd service to VPS
4. **Monitor:** Watch `/var/log/bctc-historical.log` for 7 days
5. **QA validation:** Verify data in database + extraction quality
6. **Analysis:** Use 8Q data for backtesting + trend detection

---

## References

- TECH-1289: Foreign flow parse error root-cause fix (Phase 1 of sprint)
- Task 1289_VPS_BCTC_BLOCKER.md: Original VPS enrichment design
- ARCHITECTURE.md#vps-proxy-geo-block-workaround: VPS proxy overview
- Portal URLs: HOSE (https://www.hsx.vn), HNX (https://hnx.vn), UPCOM (https://upcom.hnx.vn)
- API endpoint: POST /api/push-bctc-pdf (main server)
