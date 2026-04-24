# BCTC Portal Discovery — Shell Script Integration

**For:** Ops/Dev integrating Python discovery into downloader script
**Effort:** 15 minutes
**Integration point:** `/root/bctc-historical-downloader.sh`

---

## Current Shell Script Problem

The existing `enrich-bctc-urls.sh` uses `curl + grep` which fails on async portals:

```bash
# BROKEN: Returns 0 PDFs (content not in HTML)
PDF_URL=$(curl -s "https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=$CODE" \
  | grep -oP 'href="[^"]*\.pdf"' | head -1)
```

---

## New Solution: Call Python Script

Replace the broken curl+grep with Python browser automation:

```bash
#!/bin/bash
# /root/bctc-historical-downloader.sh
# Download 8 quarters of BCTC PDFs for 30 stocks
# Uses Python browser automation for async portal discovery

set -e  # Exit on error

API_KEY="${API_KEY:-}"
MCP_BASE="${MCP_BASE:-http://localhost:3000}"
VPS_LOG="/var/log/bctc-historical.log"

# Ensure log directory exists
mkdir -p "$(dirname "$VPS_LOG")"

# ============================================================================
# STOCKS & QUARTERS TO DOWNLOAD
# ============================================================================

STOCKS=(
    # Large-cap
    VNM BID FPT MWG GAS TPB

    # Mid-cap
    FPT KDC PNJ CTG PLC BAC

    # Small-cap (watchlist)
    HSG BSR VIC NVL HPG VJC

    # Additional liquid stocks
    PGV SHB ACB BVH SHG

    # Tech/Growth
    VHM TCB MTC CTR

    # Utilities/Stability
    POW SJS CRE DHC

    # Additional diversification
    BMI KBC

    # Final fills
    API BMD
)

QUARTERS=(
    "2024:Q1"
    "2024:Q2"
    "2024:Q3"
    "2024:Q4"
    "2025:Q1"
    "2025:Q2"
    "2025:Q3"
    "2025:Q4"
)

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

log_msg() {
    local level="$1"
    local msg="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] $msg" | tee -a "$VPS_LOG"
}

discover_pdf_url() {
    local code="$1"
    local year="$2"
    local quarter="$3"

    # Call Python script; it returns JSON
    # Example: {"url": "https://...", "source": "HOSE", "confidence": 0.95}
    python3 /root/discover-bctc-urls-browser.py "$code" "$year" "$quarter" 2>/dev/null
}

extract_pdf_url_from_json() {
    local json="$1"
    # Extract just the URL field (or empty if null)
    echo "$json" | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('url', ''))" 2>/dev/null || echo ""
}

download_pdf() {
    local pdf_url="$1"
    local output_path="$2"

    if [ -z "$pdf_url" ]; then
        return 1
    fi

    # Check if already exists
    if [ -f "$output_path" ]; then
        log_msg "SKIP" "PDF already exists: $output_path"
        return 0
    fi

    # Create directory if needed
    mkdir -p "$(dirname "$output_path")"

    # Download with retry (3 attempts)
    local attempt=1
    while [ $attempt -le 3 ]; do
        log_msg "INFO" "Downloading ($attempt/3): $pdf_url → $output_path"

        if curl -f -L -m 30 --connect-timeout 10 \
            -H "User-Agent: VN-Market-Intelligence/1.0" \
            "$pdf_url" -o "$output_path" 2>/dev/null; then

            # Verify file was written and is > 10KB (sanity check)
            if [ -s "$output_path" ] && [ "$(stat -f%z "$output_path" 2>/dev/null || stat -c%s "$output_path")" -gt 10240 ]; then
                log_msg "OK" "Downloaded: $output_path"
                return 0
            else
                log_msg "WARN" "Downloaded file is too small or empty, retrying..."
                rm -f "$output_path"
            fi
        else
            log_msg "WARN" "Download failed, attempt $attempt/3"
        fi

        attempt=$((attempt + 1))
        [ $attempt -le 3 ] && sleep 2  # Wait before retry
    done

    log_msg "ERROR" "Failed to download after 3 attempts: $pdf_url"
    return 1
}

push_pdf_to_main_server() {
    local pdf_path="$1"
    local code="$2"
    local year="$3"
    local quarter="$4"

    if [ ! -f "$pdf_path" ]; then
        log_msg "WARN" "PDF file not found: $pdf_path"
        return 1
    fi

    log_msg "INFO" "Pushing PDF to main server: $code $year $quarter"

    # Build payload
    local payload=$(cat <<EOF
{
    "action_code": "$code",
    "period_year": $year,
    "period_quarter": "$quarter",
    "pdf_path": "$pdf_path"
}
EOF
)

    # POST to main server
    local response=$(curl -s -X POST "$MCP_BASE/api/push-bctc-pdf" \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null || echo '{"error": "connection failed"}')

    if echo "$response" | grep -q '"ok"'; then
        log_msg "OK" "PDF pushed: $code $year $quarter"
        return 0
    else
        log_msg "WARN" "Failed to push PDF: $response"
        return 1
    fi
}

# ============================================================================
# MAIN LOOP
# ============================================================================

log_msg "START" "BCTC Historical Downloader — $(date -u)"

TOTAL_STOCKS=${#STOCKS[@]}
TOTAL_QUARTERS=${#QUARTERS[@]}
TOTAL_JOBS=$((TOTAL_STOCKS * TOTAL_QUARTERS))

DISCOVERED=0
DOWNLOADED=0
FAILED=0
SKIPPED=0

for stock in "${STOCKS[@]}"; do
    for quarter_str in "${QUARTERS[@]}"; do
        # Parse "2024:Q1" → year=2024, quarter=Q1
        IFS=':' read -r year quarter <<< "$quarter_str"

        log_msg "INFO" "Processing: $stock $year $quarter"

        # Step 1: Discover PDF URL
        json_response=$(discover_pdf_url "$stock" "$year" "$quarter")
        pdf_url=$(extract_pdf_url_from_json "$json_response")

        if [ -z "$pdf_url" ]; then
            log_msg "SKIP" "No PDF found for $stock $year $quarter (portal discovery returned null)"
            SKIPPED=$((SKIPPED + 1))
            sleep 1  # Rate limit
            continue
        fi

        DISCOVERED=$((DISCOVERED + 1))
        log_msg "FOUND" "$stock $year $quarter: $pdf_url"

        # Step 2: Download PDF
        pdf_filename="${stock}_${year}_${quarter}.pdf"
        pdf_path="$HOME/data/pdfs/${stock}/${pdf_filename}"

        if download_pdf "$pdf_url" "$pdf_path"; then
            DOWNLOADED=$((DOWNLOADED + 1))

            # Step 3: Push to main server (optional, for metadata)
            if [ -n "$API_KEY" ]; then
                push_pdf_to_main_server "$pdf_path" "$stock" "$year" "$quarter" || true
            fi
        else
            FAILED=$((FAILED + 1))
        fi

        # Rate limiting: 1 second between requests (avoid IP ban)
        sleep 1
    done
done

# ============================================================================
# SUMMARY
# ============================================================================

log_msg "DONE" "Completed"
log_msg "STATS" "Total: $TOTAL_JOBS | Discovered: $DISCOVERED | Downloaded: $DOWNLOADED | Failed: $FAILED | Skipped: $SKIPPED"

DISCOVERY_RATE=$((DISCOVERED * 100 / TOTAL_JOBS))
DOWNLOAD_RATE=$((DOWNLOADED * 100 / DISCOVERED))

log_msg "SUMMARY" "Discovery rate: ${DISCOVERY_RATE}% | Download success rate: ${DOWNLOAD_RATE}%"

# Exit with error if discovery or download rate is too low
if [ $DISCOVERY_RATE -lt 50 ]; then
    log_msg "ERROR" "Discovery rate too low (${DISCOVERY_RATE}%). Check portal accessibility."
    exit 1
fi

log_msg "SUCCESS" "Backfill complete"
exit 0
```

---

## Key Integration Points

### 1. Call Python Discovery Script

```bash
# Returns JSON: {"url": "https://...", "source": "HOSE", "confidence": 0.95}
json_response=$(discover_pdf_url "$stock" "$year" "$quarter")

# Extract URL from JSON
pdf_url=$(extract_pdf_url_from_json "$json_response")
```

**Why this design:**
- Python returns structured JSON (easy to parse)
- Shell extracts only what it needs (URL)
- Decouples discovery logic (Python) from download logic (Bash)

### 2. Rate Limiting

```bash
# 1 second between requests to avoid IP ban
sleep 1
```

**Why this is important:**
- VN portals may block aggressive scrapers
- 1 sec per request = ~30 min for 240 PDFs (acceptable)
- If VPS is rate-limited/banned, this slows down discovery

### 3. Folder Structure

```bash
# Create local folder structure: data/pdfs/{CODE}/{CODE}_{YEAR}_{QUARTER}.pdf
pdf_path="$HOME/data/pdfs/${stock}/${pdf_filename}"

mkdir -p "$(dirname "$pdf_path")"
```

**Matches existing VPS convention** from Phase 0 (URL enrichment)

### 4. Error Handling

```bash
if [ -z "$pdf_url" ]; then
    log_msg "SKIP" "No PDF found for $stock $year $quarter"
    SKIPPED=$((SKIPPED + 1))
    continue  # Try next quarter, don't fail
fi
```

**Why graceful failure:**
- Not all stocks have all quarters
- Some older quarters may not be available
- Don't block entire job; continue with what's available

### 5. Logging & Metrics

```bash
log_msg "STATS" "Total: $TOTAL_JOBS | Discovered: $DISCOVERED | Downloaded: $DOWNLOADED | Failed: $FAILED"

DISCOVERY_RATE=$((DISCOVERED * 100 / TOTAL_JOBS))
```

**Enables monitoring:**
- Track discovery rate (% of stocks with PDFs found)
- Track download success rate (% of found PDFs successfully downloaded)
- Alert if rates drop (indicates portal changed or is blocking)

---

## Systemd Integration (Optional)

To run this downloader daily via systemd timer:

**File:** `/etc/systemd/system/vn-bctc-historical.service`

```ini
[Unit]
Description=VN BCTC Historical PDF Downloader
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/root/bctc-historical-downloader.sh
StandardOutput=journal
StandardError=journal

Environment="API_KEY=YOUR_API_KEY"
Environment="MCP_BASE=http://localhost:3000"

User=root
WorkingDirectory=/root
```

**File:** `/etc/systemd/system/vn-bctc-historical.timer`

```ini
[Unit]
Description=Daily BCTC Historical PDF Download Timer
Requires=vn-bctc-historical.service

[Timer]
# Run at 02:00 UTC (09:00 VN time) every day
OnCalendar=*-*-* 02:00:00

[Install]
WantedBy=timers.target
```

**Enable:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable vn-bctc-historical.timer
sudo systemctl start vn-bctc-historical.timer

# Check status
sudo systemctl status vn-bctc-historical.timer
sudo journalctl -u vn-bctc-historical.service -n 50 --follow
```

---

## Testing the Integration

### Test 1: Discovery Only (2 min)

```bash
# Extract just the discovery loop (no download)
for stock in VNM BID FPT; do
    for year in 2025; do
        for quarter in Q4; do
            python3 /root/discover-bctc-urls-browser.py "$stock" "$year" "$quarter"
        done
    done
done
# Expected: 3 JSON responses with URLs
```

### Test 2: Single Stock (5 min)

```bash
# Run downloader for just one stock
STOCKS=(VNM)
QUARTERS=("2025:Q4")
/root/bctc-historical-downloader.sh

# Check result
ls -lh ~/data/pdfs/VNM/
# Expected: VNM_2025_Q4.pdf (~500KB–5MB)
```

### Test 3: Full Run (60 min, background)

```bash
# Run full 30 stocks × 8 quarters
/root/bctc-historical-downloader.sh &

# Monitor progress
tail -f /var/log/bctc-historical.log
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `python3: command not found` | Install Python: `apt-get install python3` |
| `ModuleNotFoundError: playwright` | Install: `pip3 install playwright && python3 -m playwright install chromium` |
| `Permission denied` | Make script executable: `chmod +x /root/bctc-historical-downloader.sh` |
| `No PDFs found` (SKIPPED=240) | Check portal is accessible: `curl -I https://www.hsx.vn/...` |
| `Download failed` (FAILED>0) | Check curl is installed: `curl --version` |
| `timeout or took >5 min` | Python discovery may be slow; normal for VPS in Vietnam (1–3s per PDF) |

---

## Files to Modify

| File | Change |
|------|--------|
| `/root/bctc-historical-downloader.sh` | Copy template above (replace existing) |
| `/root/discover-bctc-urls-browser.py` | Copy from `BCTC_DISCOVERY_PYTHON_TEMPLATE.md` |
| (optional) `/etc/systemd/system/vn-bctc-historical.*` | Add if running as daily timer |

---

## Next Steps

1. **Copy Python script** from `BCTC_DISCOVERY_PYTHON_TEMPLATE.md`
2. **Copy shell script** from this document
3. **Test discovery only:** Run first 3 stocks manually
4. **Test full run:** Run 30 stocks × 8 quarters (60 min background)
5. **Monitor logs:** `tail -f /var/log/bctc-historical.log`
6. **Verify downloads:** `ls -lh ~/data/pdfs/`

---

**Author:** Architect
**Status:** Ready for ops/dev integration
**Estimated time to deployment:** 15 minutes (copy + test)
