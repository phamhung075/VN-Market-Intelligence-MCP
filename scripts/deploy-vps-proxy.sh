#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# VPS Price Proxy — Auto Deploy (systemd edition)
# Usage: ./deploy-vps-proxy.sh
#
# Installs:
#   /root/fetch-prices.sh           — one-shot fetch+push script
#   /root/fetch-prices-loop.sh      — forever loop driver for systemd
#   /etc/systemd/system/vn-price-fetch.service
#
# Replaces the legacy cron-based install. Systemd guarantees:
#   - auto-restart on crash (Restart=always)
#   - auto-start on reboot (WantedBy=multi-user.target)
#   - cannot be wiped by `crontab -r` (no cron entry exists)
# ═══════════════════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

if [ -f .env ]; then set -a; source .env; set +a; fi

for VAR in VULTR_IP VULTR_PASSWORD VPS_PUSH_API_KEY; do
  if [ -z "${!VAR}" ]; then echo "ERROR: $VAR not set in .env"; exit 1; fi
done

VULTR_USER="${VULTR_USERNAME:-root}"
MCP_BASE="https://zenmidi.com"
SSH="sshpass -p $VULTR_PASSWORD ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${VULTR_USER}@${VULTR_IP}"
SCP="sshpass -p $VULTR_PASSWORD scp -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo "══════════════════════════════════════════"
echo " Deploying VPS Price Proxy (systemd)"
echo " VPS: ${VULTR_USER}@${VULTR_IP}"
echo " MCP: ${MCP_BASE}"
echo "══════════════════════════════════════════"

# Step 1: Prepare fetch-prices.sh with real values.
TMP_FETCH=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-prices.sh > "$TMP_FETCH"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP_FETCH"; then
  echo "GUARD-1 FAIL: placeholder leak in $TMP_FETCH — deploy aborted" >&2
  rm -f "$TMP_FETCH"
  exit 1
fi

# Step 2: Upload both scripts + the unit file.
echo "Uploading scripts..."
$SCP "$TMP_FETCH" ${VULTR_USER}@${VULTR_IP}:/root/fetch-prices.sh
$SCP vps-scripts/fetch-prices-loop.sh ${VULTR_USER}@${VULTR_IP}:/root/fetch-prices-loop.sh
$SCP vps-scripts/vn-price-fetch.service ${VULTR_USER}@${VULTR_IP}:/etc/systemd/system/vn-price-fetch.service
rm "$TMP_FETCH"

# Step 3: Install deps, enable unit, remove legacy cron, verify.
echo "Configuring VPS..."
$SSH << 'EOF'
set -e
apt-get update -qq && apt-get install -y -qq jq curl > /dev/null 2>&1
chmod +x /root/fetch-prices.sh /root/fetch-prices-loop.sh

# Remove the legacy cron entry if it still exists so there is one source of
# truth for when the fetcher runs. Preserve any unrelated cron entries.
if crontab -l 2>/dev/null | grep -q fetch-prices; then
  crontab -l 2>/dev/null | grep -v fetch-prices | crontab -
  echo "Legacy fetch-prices cron removed."
fi

systemctl daemon-reload
systemctl enable vn-price-fetch.service
systemctl restart vn-price-fetch.service

sleep 2
echo ""
echo "=== Unit status ==="
systemctl --no-pager -l status vn-price-fetch.service | head -15
echo ""
echo "=== Last 10 log lines ==="
tail -10 /var/log/vn-price-fetch.log 2>/dev/null || echo "(log not yet written)"
EOF

# ── BCTC PDF Proxy deploy (Task 1112) ────────────────────────────────────
echo ""
echo "Deploying BCTC PDF proxy scripts..."

TMP_BCTC=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-bctc.sh > "$TMP_BCTC"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP_BCTC"; then
  echo "GUARD-1 FAIL: placeholder leak in $TMP_BCTC — deploy aborted" >&2
  rm -f "$TMP_BCTC"
  exit 1
fi

$SCP "$TMP_BCTC"                    ${VULTR_USER}@${VULTR_IP}:/root/fetch-bctc.sh
$SCP vps-scripts/fetch-bctc-loop.sh ${VULTR_USER}@${VULTR_IP}:/root/fetch-bctc-loop.sh
$SCP vps-scripts/vn-bctc-fetch.service \
     ${VULTR_USER}@${VULTR_IP}:/etc/systemd/system/vn-bctc-fetch.service
rm "$TMP_BCTC"

$SSH << 'BCTCEOF'
set -e
chmod +x /root/fetch-bctc.sh /root/fetch-bctc-loop.sh
systemctl daemon-reload
systemctl enable vn-bctc-fetch.service
systemctl restart vn-bctc-fetch.service
sleep 2
echo "=== BCTC unit status ==="
systemctl --no-pager -l status vn-bctc-fetch.service | head -15
BCTCEOF

# ── VN News RSS Proxy deploy ──────────────────────────────────────────────
echo ""
echo "Deploying VN News RSS proxy scripts..."

TMP_NEWS=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-vn-news.sh > "$TMP_NEWS"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP_NEWS"; then
  echo "GUARD-1 FAIL: placeholder leak in $TMP_NEWS — deploy aborted" >&2
  rm -f "$TMP_NEWS"
  exit 1
fi

$SCP "$TMP_NEWS"                       ${VULTR_USER}@${VULTR_IP}:/root/fetch-vn-news.sh
$SCP vps-scripts/fetch-vn-news-loop.sh ${VULTR_USER}@${VULTR_IP}:/root/fetch-vn-news-loop.sh
$SCP vps-scripts/vn-news-fetch.service \
     ${VULTR_USER}@${VULTR_IP}:/etc/systemd/system/vn-news-fetch.service
rm "$TMP_NEWS"

$SSH << 'NEWSEOF'
set -e
chmod +x /root/fetch-vn-news.sh /root/fetch-vn-news-loop.sh
systemctl daemon-reload
systemctl enable vn-news-fetch.service
systemctl restart vn-news-fetch.service
sleep 2
echo "=== News RSS unit status ==="
systemctl --no-pager -l status vn-news-fetch.service | head -15
NEWSEOF

# ── SBV / VCB FX Rate Proxy deploy ───────────────────────────────────────
echo ""
echo "Deploying SBV/VCB FX rate proxy scripts..."

TMP_SBV=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-sbv.sh > "$TMP_SBV"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP_SBV"; then
  echo "GUARD-1 FAIL: placeholder leak in $TMP_SBV — deploy aborted" >&2
  rm -f "$TMP_SBV"
  exit 1
fi

$SCP "$TMP_SBV"                    ${VULTR_USER}@${VULTR_IP}:/root/fetch-sbv.sh
$SCP vps-scripts/fetch-sbv-loop.sh ${VULTR_USER}@${VULTR_IP}:/root/fetch-sbv-loop.sh
$SCP vps-scripts/vn-sbv-fetch.service \
     ${VULTR_USER}@${VULTR_IP}:/etc/systemd/system/vn-sbv-fetch.service
rm "$TMP_SBV"

$SSH << 'SBVEOF'
set -e
chmod +x /root/fetch-sbv.sh /root/fetch-sbv-loop.sh
systemctl daemon-reload
systemctl enable vn-sbv-fetch.service
systemctl restart vn-sbv-fetch.service
sleep 2
echo "=== SBV/VCB unit status ==="
systemctl --no-pager -l status vn-sbv-fetch.service | head -15
SBVEOF

# ── Foreign Flow Proxy deploy (Task 1142) ────────────────────────────────────
echo ""
echo "Deploying VN foreign flow proxy scripts..."

TMP_FF=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-foreign-flow.sh > "$TMP_FF"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP_FF"; then
  echo "GUARD-1 FAIL: placeholder leak in $TMP_FF — deploy aborted" >&2
  rm -f "$TMP_FF"
  exit 1
fi

$SCP "$TMP_FF"                              ${VULTR_USER}@${VULTR_IP}:/root/fetch-foreign-flow.sh
$SCP vps-scripts/fetch-foreign-flow-loop.sh ${VULTR_USER}@${VULTR_IP}:/root/fetch-foreign-flow-loop.sh
$SCP vps-scripts/vn-foreign-flow.service \
     ${VULTR_USER}@${VULTR_IP}:/etc/systemd/system/vn-foreign-flow.service
rm "$TMP_FF"

$SSH << 'FFEOF'
set -e
chmod +x /root/fetch-foreign-flow.sh /root/fetch-foreign-flow-loop.sh
systemctl daemon-reload
systemctl enable vn-foreign-flow.service
systemctl restart vn-foreign-flow.service
sleep 2
echo "=== Foreign Flow unit status ==="
systemctl --no-pager -l status vn-foreign-flow.service | head -15
FFEOF

# ── VN Article Body Fetcher deploy (GUARD-3) ─────────────────────────────
echo ""
echo "Deploying VN article body fetcher..."
$SCP vps-scripts/article-body-fetcher.py ${VULTR_USER}@${VULTR_IP}:/root/article-body-fetcher.py

$SSH << 'ARTEOF'
set -e
chmod +x /root/article-body-fetcher.py
# Install beautifulsoup4 if not present (idempotent)
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
echo " Deploy complete — systemd owns all 5 VPS services"
echo ""
echo " Price proxy:        systemctl status vn-price-fetch"
echo " BCTC proxy:         systemctl status vn-bctc-fetch"
echo " News RSS proxy:     systemctl status vn-news-fetch"
echo " SBV/FX proxy:       systemctl status vn-sbv-fetch"
echo " Foreign flow proxy: systemctl status vn-foreign-flow"
echo ""
echo " Logs: /var/log/vn-{price,bctc,news,sbv,foreign}-flow.log"
echo "══════════════════════════════════════════"
