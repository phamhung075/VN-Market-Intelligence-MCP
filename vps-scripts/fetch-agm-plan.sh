#!/bin/bash
# Vietstock AGM Business Plan Fetcher — VPS one-shot script
#
# Called by fetch-agm-plan-loop.sh (which runs under vn-agm-plan.service).
# Sweeps all watchlist tickers, writes result to local JSON file drop, and
# pushes to MCP server POST /api/push-agm-plan once that endpoint exists (FIX-G-2).
#
# Data contract (for FIX-G-2 mcp-server consumer):
#   - Local file drop: /root/data/agm-plan-latest.json
#     Shape: {"status":"ok","tickers_ok":[...],"data":{"FPT":{...},...},"fetched_at":"..."}
#   - Push endpoint: POST /api/push-agm-plan (activated in FIX-G-2)
#     Body: same JSON blob; X-API-Key auth header
#   - All values in VND (value_raw) and tỷ đồng (value_ty = value_raw / 1e9)
#
# Technique: ASP.NET CSRF double-submit warmup — no Cloudflare, no headless browser.
#   See: docs/vps-sources/vietstock-agm-plan/recon.md
#   See: docs/vps-crawl-techniques/aspnet-csrf-double-submit.md

set -u

# ── Config ─────────────────────────────────────────────────────────────────────
# Actual values baked in at deploy time (same pattern as fetch-prices.sh).
API_URL="${AGM_PLAN_API_URL:-__MCP_BASE__/api/push-agm-plan}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-agm-plan.log"
DATA_DIR="/root/data"
OUT_FILE="$DATA_DIR/agm-plan-latest.json"
TMP_FILE="$DATA_DIR/agm-plan-tmp-$$.json"
SCRAPER="/root/vietstock-agm-plan.py"

# Watchlist — all active tickers from docs/data/system-map.json
TICKERS="VNM,FPT,VCB,HPG,BID,SHB,EIB,VHM,VIC,KBC,HUT,DIG,DXG,KDH,PDR,NVL,VRE,MSN,FRT,KDC,SAB,DPM,SSI,VIX,VND,VCI,DGC,VJC,GEX,BSR,PLX,DAG,DBC"

# ── Log rotation (10 MB cap) ───────────────────────────────────────────────────
LOG_ROTATE_BYTES=10485760
if [ -f /root/vps-lib.sh ]; then
  _LRB=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2)
  [ -n "$_LRB" ] && LOG_ROTATE_BYTES="$_LRB"
fi
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt "$LOG_ROTATE_BYTES" ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === AGM-PLAN START ===" >> "$LOG"

# ── Guard: scraper must exist ──────────────────────────────────────────────────
if [ ! -f "$SCRAPER" ]; then
  echo "$(date -u) FAIL: scraper not found at $SCRAPER" >> "$LOG"
  exit 1
fi

# ── Ensure data directory ─────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"

# ── Run scraper ────────────────────────────────────────────────────────────────
START_MS=$(date -u +%s%3N)
python3 "$SCRAPER" --batch "$TICKERS" > "$TMP_FILE" 2>> "$LOG"
EXIT_CODE=$?
ELAPSED_MS=$(( $(date -u +%s%3N) - START_MS ))

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "$(date -u) FAIL: scraper exited $EXIT_CODE (${ELAPSED_MS}ms)" >> "$LOG"
  rm -f "$TMP_FILE"
  exit 1
fi

# ── Validate output is non-empty JSON with "status":"ok" ─────────────────────
if [ ! -s "$TMP_FILE" ]; then
  echo "$(date -u) FAIL: scraper produced empty output" >> "$LOG"
  rm -f "$TMP_FILE"
  exit 1
fi

STATUS=$(python3 -c "import sys,json; d=json.load(open('$TMP_FILE')); print(d.get('status',''))" 2>/dev/null)
if [ "$STATUS" != "ok" ]; then
  echo "$(date -u) FAIL: scraper status != ok (got: $STATUS)" >> "$LOG"
  cat "$TMP_FILE" >> "$LOG"
  rm -f "$TMP_FILE"
  exit 1
fi

# ── Atomic file drop ──────────────────────────────────────────────────────────
mv "$TMP_FILE" "$OUT_FILE"
echo "$(date -u) FILE DROP: $OUT_FILE (${ELAPSED_MS}ms)" >> "$LOG"

# ── Extract summary stats for log ─────────────────────────────────────────────
TICKERS_OK=$(python3 -c "
import json
d = json.load(open('$OUT_FILE'))
ok = len(d.get('tickers_ok', []))
fb = len(d.get('tickers_fallback', []))
err = len(d.get('tickers_error', []))
print(f'ok={ok} fallback={fb} error={err}')
" 2>/dev/null || echo "ok=? fallback=? error=?")
echo "$(date -u) RESULT: $TICKERS_OK" >> "$LOG"

# ── Push to MCP server (activates in FIX-G-2 when /api/push-agm-plan exists) ──
# Check endpoint liveness with a HEAD/OPTIONS or fallback gracefully on 404/405.
PUSH_RESP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 20 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d @"$OUT_FILE" 2>/dev/null)

if [ "$PUSH_RESP" = "200" ] || [ "$PUSH_RESP" = "201" ]; then
  echo "$(date -u) PUSH: $API_URL → HTTP $PUSH_RESP OK" >> "$LOG"
elif [ "$PUSH_RESP" = "404" ] || [ "$PUSH_RESP" = "405" ]; then
  # FIX-G-2 not yet deployed — file drop is the only contract for now
  echo "$(date -u) PUSH: $API_URL → HTTP $PUSH_RESP (FIX-G-2 not deployed — file drop only)" >> "$LOG"
else
  echo "$(date -u) PUSH WARN: $API_URL → HTTP $PUSH_RESP" >> "$LOG"
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === AGM-PLAN DONE (${ELAPSED_MS}ms) ===" >> "$LOG"
