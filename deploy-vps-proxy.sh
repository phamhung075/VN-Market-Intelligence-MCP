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

echo ""
echo "══════════════════════════════════════════"
echo " Deploy complete — systemd owns the fetcher"
echo " Status: ssh root@${VULTR_IP} systemctl status vn-price-fetch"
echo " Logs:   ssh root@${VULTR_IP} tail -f /var/log/vn-price-fetch.log"
echo " Journal: ssh root@${VULTR_IP} journalctl -u vn-price-fetch -f"
echo "══════════════════════════════════════════"
