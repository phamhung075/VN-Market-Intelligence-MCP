#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# VPS Price Proxy — Auto Deploy
# Usage: ./deploy-vps-proxy.sh
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
echo " Deploying VPS Price Proxy"
echo " VPS: ${VULTR_USER}@${VULTR_IP}"
echo " MCP: ${MCP_BASE}"
echo "══════════════════════════════════════════"

# Step 1: Prepare script with real values
TMPFILE=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-prices.sh > "$TMPFILE"

# Step 2: Upload script
echo "Uploading script..."
$SCP "$TMPFILE" ${VULTR_USER}@${VULTR_IP}:/root/fetch-prices.sh
rm "$TMPFILE"

# Step 3: Install deps + cron + test
echo "Configuring VPS..."
$SSH << 'EOF'
set -e
apt-get update -qq && apt-get install -y -qq jq curl cron > /dev/null 2>&1
chmod +x /root/fetch-prices.sh

# Setup cron: every 15 min UTC 02:00-09:00 Mon-Fri (VN 09:00-16:00)
(crontab -l 2>/dev/null | grep -v fetch-prices; \
 echo "*/15 2-9 * * 1-5 /root/fetch-prices.sh"; \
 echo "0 0 * * 1-5 /root/fetch-prices.sh") | crontab -

service cron start 2>/dev/null || systemctl enable --now cron 2>/dev/null || true

echo "Cron:"
crontab -l | grep fetch
echo ""
echo "=== Test Run ==="
/root/fetch-prices.sh
echo ""
tail -20 /var/log/vn-price-fetch.log
EOF

echo ""
echo "══════════════════════════════════════════"
echo " Deploy complete!"
echo " Cron: */15 2-9 * * 1-5 (VN market hours)"
echo " Log:  ssh root@${VULTR_IP} tail -f /var/log/vn-price-fetch.log"
echo "══════════════════════════════════════════"
