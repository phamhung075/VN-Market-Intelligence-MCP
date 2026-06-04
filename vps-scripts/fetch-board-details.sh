#!/bin/bash
# Vietstock Board Details Fetcher — VPS one-shot script
#
# Called by fetch-board-details-loop.sh (which runs under vn-board-details.service).
# Sweeps all watchlist tickers, writes result to local JSON file drop, and
# pushes to MCP server POST /api/push-board-details once that endpoint exists (FIX-I-B).
#
# Data contract (for FIX-I-B mcp-server consumer):
#   - Local file drop: /root/data/board-details-latest.json
#     Shape: {"status":"ok","tickers_ok":[...],"tickers_error":[...],"data":{"FPT":[...]},"fetched_at":"..."}
#   - Push endpoint: POST /api/push-board-details (activated in FIX-I-B)
#     Body: same JSON blob; X-API-Key auth header
#
# Technique: ASP.NET CSRF double-submit warmup — no Cloudflare, no headless browser.
#   See: docs/vps-sources/officer-start-date/recon.md
#   See: docs/vps-crawl-techniques/aspnet-csrf-double-submit.md

set -u

# ── Config ─────────────────────────────────────────────────────────────────────
# Env-fallback form mirrors fetch-agm-plan.sh pattern (GUARD-2 compliant).
API_URL="${BOARD_DETAILS_API_URL:-__MCP_BASE__/api/push-board-details}"
API_KEY="${API_KEY:-__API_KEY__}"
LOG="/var/log/vn-board-details.log"
DATA_DIR="/root/data"
OUT_FILE="$DATA_DIR/board-details-latest.json"
TMP_FILE="$DATA_DIR/board-details-tmp-$$.json"
SCRAPER="/root/vietstock-board-details.py"

# Watchlist — all active tickers from docs/data/system-map.json (33 tickers, same as AGM plan)
TICKERS="VNM,FPT,VCB,HPG,BID,SHB,EIB,VHM,VIC,KBC,HUT,DIG,DXG,KDH,PDR,NVL,VRE,MSN,FRT,KDC,SAB,DPM,SSI,VIX,VND,VCI,DGC,VJC,GEX,BSR,PLX,DAG,DBC"

# ── Log rotation (10 MB cap) ───────────────────────────────────────────────────
LOG_ROTATE_BYTES=10485760
if [ -f /root/vps-lib.sh ]; then
  _LRB=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2)
  [ -n "$_LRB" ] && LOG_ROTATE_BYTES="$_LRB"
fi
LOG_SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt "$LOG_ROTATE_BYTES" ]; then mv "$LOG" "$LOG.old"; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === BOARD-DETAILS START ===" >> "$LOG"

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
TICKERS_STATS=$(python3 -c "
import json
d = json.load(open('$OUT_FILE'))
ok = len(d.get('tickers_ok', []))
err = len(d.get('tickers_error', []))
print(f'ok={ok} error={err}')
" 2>/dev/null || echo "ok=? error=?")
echo "$(date -u) RESULT: $TICKERS_STATS" >> "$LOG"

# ── Push to MCP server (activates in FIX-I-B when /api/push-board-details exists) ──
# Tolerate 404 gracefully — file drop is the primary contract until FIX-I-B deploys.
PUSH_RESP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 20 \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d @"$OUT_FILE" 2>/dev/null)

if [ "$PUSH_RESP" = "200" ] || [ "$PUSH_RESP" = "201" ]; then
  echo "$(date -u) PUSH: $API_URL → HTTP $PUSH_RESP OK" >> "$LOG"
elif [ "$PUSH_RESP" = "404" ] || [ "$PUSH_RESP" = "405" ]; then
  # FIX-I-B not yet deployed — file drop is the only contract for now
  echo "$(date -u) PUSH: $API_URL → HTTP $PUSH_RESP (FIX-I-B not deployed — file drop only)" >> "$LOG"
else
  echo "$(date -u) PUSH WARN: $API_URL → HTTP $PUSH_RESP" >> "$LOG"
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) === BOARD-DETAILS DONE (${ELAPSED_MS}ms) ===" >> "$LOG"
