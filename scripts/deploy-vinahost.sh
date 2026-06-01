#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Vinahost VPS Deploy — All 9 VN data proxy services + article body fetcher
# Usage: ./deploy-vinahost.sh
#
# Deploys to Vinahost Vietnam ($VINAHOST_IP) — in-country, no geo-block.
#
# Services installed:
#   vn-price-fetch.service          — stock prices (VPS + CafeF + Yahoo) every 60s
#   vn-bctc-fetch.service           — BCTC PDF queue every 6h
#   vn-news-fetch.service           — CafeF/VnExpress/VnEconomy RSS every 15m
#   vn-sbv-fetch.service            — Vietcombank FX rates every 30m
#   vn-foreign-flow.service         — foreign flow from VPS API every 60s
#   vn-ohlcv-backfill.timer         — OHLCV backfill poller every 30m (oneshot)
#   vn-bctc-enrich.timer            — BCTC URL enricher every 6h
#   vn-tradingeconomics-fetch.service — Trading Economics macro indicators every 1h
#   vn-vps-proxy.service            — HTTP proxy server (BCTC Playwright + SSC iboard, :8765)
#   article-body-fetcher.py         — cafef/vneconomy article body extractor (CLI, :8765/proxy/article-body)
# ═══════════════════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; source .env; set +a; fi

for VAR in VINAHOST_IP VINAHOST_PASSWORD VPS_PUSH_API_KEY; do
  if [ -z "${!VAR}" ]; then echo "ERROR: $VAR not set in .env"; exit 1; fi
done

# TRADING_ECONOMICS_API_KEY is optional — script exits gracefully if absent.
# Warn here so the operator knows the service will be skipped.
if [ -z "${TRADING_ECONOMICS_API_KEY:-}" ]; then
  echo "WARN: TRADING_ECONOMICS_API_KEY not set — fetch-tradingeconomics.sh will be deployed but will exit gracefully (no API calls)"
fi

VH_USER="${VINAHOST_USERNAME:-root}"
VH_IP="$VINAHOST_IP"
MCP_BASE="https://zenmidi.com"
SSH="sshpass -p $VINAHOST_PASSWORD ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${VH_USER}@${VH_IP}"
SCP="sshpass -p $VINAHOST_PASSWORD scp -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo "══════════════════════════════════════════"
echo " Deploying to Vinahost Vietnam"
echo " VPS: ${VH_USER}@${VH_IP}"
echo " MCP: ${MCP_BASE}"
echo "══════════════════════════════════════════"

# ── 1. Price proxy ──────────────────────────────────────────────────────────
echo ""
echo "Deploying price proxy..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-prices.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in fetch-prices.sh — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/fetch-prices.sh
$SCP vps-scripts/fetch-prices-loop.sh ${VH_USER}@${VH_IP}:/root/fetch-prices-loop.sh
$SCP vps-scripts/verify-deploy-price-fetch.sh ${VH_USER}@${VH_IP}:/root/verify-deploy-price-fetch.sh
$SCP vps-scripts/vn-price-fetch.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-price-fetch.service
rm "$TMP"

$SSH << 'EOF'
set -e
apt-get update -qq && apt-get install -y -qq jq curl bc > /dev/null 2>&1
chmod +x /root/fetch-prices.sh /root/fetch-prices-loop.sh /root/verify-deploy-price-fetch.sh
systemctl daemon-reload
systemctl enable vn-price-fetch.service
systemctl restart vn-price-fetch.service
sleep 1

# Health check verification (30-second loop)
echo ""
echo "Verifying price fetch health..."
if /root/verify-deploy-price-fetch.sh; then
  echo "✓ Price fetch deployment verified"
else
  echo "✗ Price fetch verification FAILED — deploy incomplete"
  echo "=== vn-price-fetch status ==="
  systemctl --no-pager -l status vn-price-fetch.service | head -12
  exit 1
fi

echo "=== vn-price-fetch status ==="
systemctl --no-pager -l status vn-price-fetch.service | head -12
EOF

# ── 2. BCTC PDF proxy ───────────────────────────────────────────────────────
echo ""
echo "Deploying BCTC PDF proxy..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-bctc.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in fetch-bctc.sh — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/fetch-bctc.sh
$SCP vps-scripts/fetch-bctc-loop.sh ${VH_USER}@${VH_IP}:/root/fetch-bctc-loop.sh
$SCP vps-scripts/vn-bctc-fetch.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-bctc-fetch.service
# Sprint-1953d: deploy discover script (VPS-only before 1953a; now tracked in repo)
$SCP vps-scripts/discover-bctc-urls-browser.py ${VH_USER}@${VH_IP}:/root/discover-bctc-urls-browser.py
rm "$TMP"

$SSH << 'BCTCEOF'
set -e
chmod +x /root/fetch-bctc.sh /root/fetch-bctc-loop.sh
systemctl daemon-reload
systemctl enable vn-bctc-fetch.service
systemctl restart vn-bctc-fetch.service
sleep 2
echo "=== vn-bctc-fetch status ==="
systemctl --no-pager -l status vn-bctc-fetch.service | head -12
BCTCEOF

# ── 3. News RSS proxy ───────────────────────────────────────────────────────
echo ""
echo "Deploying VN News RSS proxy..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-vn-news.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in fetch-vn-news.sh — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/fetch-vn-news.sh
$SCP vps-scripts/fetch-vn-news-loop.sh ${VH_USER}@${VH_IP}:/root/fetch-vn-news-loop.sh
$SCP vps-scripts/vn-news-fetch.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-news-fetch.service
rm "$TMP"

$SSH << 'NEWSEOF'
set -e
chmod +x /root/fetch-vn-news.sh /root/fetch-vn-news-loop.sh
systemctl daemon-reload
systemctl enable vn-news-fetch.service
systemctl restart vn-news-fetch.service
sleep 2
echo "=== vn-news-fetch status ==="
systemctl --no-pager -l status vn-news-fetch.service | head -12
NEWSEOF

# ── 4. SBV / VCB FX proxy ──────────────────────────────────────────────────
echo ""
echo "Deploying SBV/VCB FX rate proxy..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-sbv.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in fetch-sbv.sh — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/fetch-sbv.sh
$SCP vps-scripts/fetch-sbv-loop.sh ${VH_USER}@${VH_IP}:/root/fetch-sbv-loop.sh
$SCP vps-scripts/vn-sbv-fetch.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-sbv-fetch.service
rm "$TMP"

$SSH << 'SBVEOF'
set -e
chmod +x /root/fetch-sbv.sh /root/fetch-sbv-loop.sh
systemctl daemon-reload
systemctl enable vn-sbv-fetch.service
systemctl restart vn-sbv-fetch.service
sleep 2
echo "=== vn-sbv-fetch status ==="
systemctl --no-pager -l status vn-sbv-fetch.service | head -12
SBVEOF

# ── 5. Foreign flow proxy ───────────────────────────────────────────────────
echo ""
echo "Deploying foreign flow proxy..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-foreign-flow.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in fetch-foreign-flow.sh — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/fetch-foreign-flow.sh
$SCP vps-scripts/fetch-foreign-flow-loop.sh ${VH_USER}@${VH_IP}:/root/fetch-foreign-flow-loop.sh
$SCP vps-scripts/vn-foreign-flow.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-foreign-flow.service
rm "$TMP"

$SSH << 'FFEOF'
set -e
chmod +x /root/fetch-foreign-flow.sh /root/fetch-foreign-flow-loop.sh
systemctl daemon-reload
systemctl enable vn-foreign-flow.service
systemctl restart vn-foreign-flow.service
sleep 2
echo "=== vn-foreign-flow status ==="
systemctl --no-pager -l status vn-foreign-flow.service | head -12
FFEOF

# ── 6. OHLCV backfill poller ────────────────────────────────────────────────
echo ""
echo "Deploying OHLCV backfill poller..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/ohlcv-backfill-poll.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in ohlcv-backfill-poll.sh — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/ohlcv-backfill-poll.sh
$SCP vps-scripts/vn-ohlcv-backfill.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-ohlcv-backfill.service
$SCP vps-scripts/vn-ohlcv-backfill.timer   ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-ohlcv-backfill.timer
rm "$TMP"

$SSH << 'BACKFILLEOF'
set -e
chmod +x /root/ohlcv-backfill-poll.sh
systemctl daemon-reload
systemctl enable vn-ohlcv-backfill.timer
systemctl restart vn-ohlcv-backfill.timer
sleep 2
echo "=== vn-ohlcv-backfill timer status ==="
systemctl --no-pager -l status vn-ohlcv-backfill.timer | head -12
BACKFILLEOF

# ── 7. BCTC URL Enricher (Task 1289) ────────────────────────────────────────
echo ""
echo "Deploying BCTC URL enricher (VPS-based, runs every 6h)..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/enrich-bctc-urls.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in enrich-bctc-urls.sh — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/enrich-bctc-urls.sh
$SCP vps-scripts/vn-bctc-enrich.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-bctc-enrich.service
$SCP vps-scripts/vn-bctc-enrich.timer   ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-bctc-enrich.timer
rm "$TMP"

$SSH << 'ENRICHEOF'
set -e
chmod +x /root/enrich-bctc-urls.sh
systemctl daemon-reload
systemctl enable vn-bctc-enrich.timer
systemctl restart vn-bctc-enrich.timer
sleep 2
echo "=== vn-bctc-enrich timer status ==="
systemctl --no-pager -l status vn-bctc-enrich.timer | head -12
ENRICHEOF


# ── 8. Trading Economics macro indicator proxy ──────────────────────────────
echo ""
echo "Deploying Trading Economics macro proxy (hourly)..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    -e "s|__TE_API_KEY__|${TRADING_ECONOMICS_API_KEY:-}|g" \
    vps-scripts/fetch-tradingeconomics.sh > "$TMP"
# GUARD-1: assert fires AFTER all three tokens are rendered.
# ${TRADING_ECONOMICS_API_KEY:-} expands to empty string when unset — NOT the literal
# sentinel — so GUARD-1 correctly passes. The __TE_API_KEY__ sentinel in the deployed
# script (L15) is a VPS-side defence-in-depth guard, NOT a leak; it is preserved as-is.
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in fetch-tradingeconomics.sh — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/fetch-tradingeconomics.sh
$SCP vps-scripts/vn-tradingeconomics-fetch.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-tradingeconomics-fetch.service
rm "$TMP"

$SSH << 'TEEOF'
set -e
chmod +x /root/fetch-tradingeconomics.sh
systemctl daemon-reload
systemctl enable vn-tradingeconomics-fetch.service
systemctl restart vn-tradingeconomics-fetch.service
sleep 2
echo "=== vn-tradingeconomics-fetch status ==="
systemctl --no-pager -l status vn-tradingeconomics-fetch.service | head -12
TEEOF

# ── 9. VPS HTTP Proxy Server (BCTC Playwright discover, port 8765) ──────────
# No sed render needed for this block — only SCP of binary + unit file.
# No GUARD-1 assert required (no placeholder tokens injected).
echo ""
echo "Deploying VPS HTTP proxy server (BCTC Playwright + SSC iboard, port 8765)..."
$SCP vps-scripts/vps-proxy-server.js ${VH_USER}@${VH_IP}:/root/vps-proxy-server.js
$SCP vps-scripts/vn-vps-proxy.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-vps-proxy.service

$SSH << 'PROXYEOF'
set -e
chmod +x /root/vps-proxy-server.js

# Write VPS_API_KEY to EnvironmentFile if not already present
if [ ! -f /etc/vn-market.env ]; then
  touch /etc/vn-market.env
  chmod 600 /etc/vn-market.env
fi
if ! grep -q "VPS_API_KEY" /etc/vn-market.env 2>/dev/null; then
  if [ -n "${VPS_PUSH_API_KEY:-}" ]; then
    echo "VPS_API_KEY=${VPS_PUSH_API_KEY}" >> /etc/vn-market.env
  fi
fi

systemctl daemon-reload
systemctl enable vn-vps-proxy.service
systemctl restart vn-vps-proxy.service
sleep 2

# Health check
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:8765/health)
if [ "$HTTP_CODE" = "200" ]; then
  echo "VPS proxy server healthy (HTTP 200)"
else
  echo "WARN: VPS proxy health check returned HTTP $HTTP_CODE"
fi

echo "=== vn-vps-proxy status ==="
systemctl --no-pager -l status vn-vps-proxy.service | head -12
PROXYEOF

# ── 10. Article body fetcher (cafef/vneconomy GUARD-3) ──────────────────────
# No sed render needed — article-body-fetcher.py takes --url as CLI arg, no __TOKEN__ sentinels.
# No GUARD-1 assert required. Post-SCP ls confirms upload.
echo ""
echo "Deploying VN article body fetcher..."
$SCP vps-scripts/article-body-fetcher.py ${VH_USER}@${VH_IP}:/root/article-body-fetcher.py

$SSH ls -la /root/article-body-fetcher.py

$SSH << 'ARTEOF'
set -e
chmod +x /root/article-body-fetcher.py
if ! pip3 show beautifulsoup4 > /dev/null 2>&1; then
  echo "Installing beautifulsoup4..."
  pip3 install beautifulsoup4
else
  echo "beautifulsoup4 already installed: $(pip3 show beautifulsoup4 | grep Version)"
fi
ARTEOF

# ── GUARD-1: Post-deploy SSH placeholder verify ───────────────────────────
$SSH << 'VERIFYEOF'
set -e
LEAKED=$(grep -rl '__[A-Za-z][A-Za-z0-9_]*__' /root/fetch-*.sh /root/*.py 2>/dev/null || true)
if [ -n "$LEAKED" ]; then
  echo "ERROR: deployed artifacts still contain placeholders: $LEAKED" >&2
  exit 1
fi
echo "GUARD-1 post-deploy verify: CLEAN (0 placeholder leaks)"
VERIFYEOF

echo ""
echo "══════════════════════════════════════════"
echo " Deploy complete — Vinahost Vietnam owns all 9 services"
echo ""
echo " Price proxy:        systemctl status vn-price-fetch"
echo " BCTC proxy:         systemctl status vn-bctc-fetch"
echo " BCTC URL enricher:  systemctl status vn-bctc-enrich.timer"
echo " News RSS proxy:     systemctl status vn-news-fetch"
echo " SBV/FX proxy:       systemctl status vn-sbv-fetch"
echo " Foreign flow proxy: systemctl status vn-foreign-flow"
echo " OHLCV backfill:     systemctl status vn-ohlcv-backfill.timer"
echo " Trading Economics:  systemctl status vn-tradingeconomics-fetch"
echo " VPS HTTP proxy:     systemctl status vn-vps-proxy (BCTC Playwright + SSC iboard, :8765)"
echo ""
echo " Logs: /var/log/vn-{price,bctc,bctc-enrich,news,sbv,foreign-flow,ohlcv-backfill,tradingeconomics-fetch,vps-proxy}.log"
echo "══════════════════════════════════════════"
