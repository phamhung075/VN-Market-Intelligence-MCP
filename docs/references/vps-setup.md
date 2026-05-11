# VPS Setup & Operations

**Load when:** VPS maintenance, deployment, troubleshooting, first-time setup.

---

## Vinahost VPS Connection (Vietnam Proxy)

**Purpose:** Five services run on a Vietnam-based VPS to bypass geo-blocking on Vietnamese stock data sources.

### Connection Details

Load from `.env`:
```bash
VINAHOST_IP=<IP address>
VINAHOST_USER=<username, typically 'root'>
VINAHOST_KEY=<path to SSH private key>
```

### Quick Health Check

```bash
ssh root@$VINAHOST_IP /root/vps-status.sh
```

Expected output:
```
=== VPS Status Check ===

vn-price-fetch.service
  Status: active (running)
  Last run: 2026-04-21 07:02:15 UTC
  Items pushed: 245 prices

vn-bctc-fetch.service
  Status: active (running)
  Last run: 2026-04-21 06:00:00 UTC
  Queued: 2 PDFs

vn-news-fetch.service
  Status: active (running)
  Last run: 2026-04-21 07:14:58 UTC
  Items fetched: 226

vn-sbv-fetch.service
  Status: active (running)
  Last run: 2026-04-21 06:30:00 UTC
  SBV rates: 15 records

vn-foreign-flow.service
  Status: active (running)
  Last run: 2026-04-21 07:02:20 UTC
  Last push: 2026-04-21 07:02:20 UTC
```

---

## Five Services Overview

All services are systemd units on Vinahost. Deploy via `./deploy-vinahost.sh` (from project root).

### 1. Price Fetch Service

**What:** VN stock prices from HOSE/HNX/UPCOM + foreign buy/sell flow

**File:** `vps-scripts/fetch-prices.sh`

**Interval:** 60s during market hours (08:00-15:00 VN), off-hours idle

**Endpoint pushed to:** `POST /api/push-prices` (local server)

**Check status:**
```bash
ssh root@$VINAHOST_IP "systemctl status vn-price-fetch.service"
ssh root@$VINAHOST_IP "journalctl -u vn-price-fetch.service -n 20 --no-pager"
```

**Troubleshoot:**
- Service inactive → `systemctl restart vn-price-fetch.service`
- Logs show "503 Service Unavailable" → HOSE/HNX temporarily down (not ops issue)
- Logs show "Connection timeout" → Check VPS network: `ping 8.8.8.8`

### 2. BCTC Fetch Service

**What:** BCTC financial reports from SSC portal (congbothongtin.ssc.gov.vn)

**File:** `vps-scripts/fetch-bctc.sh`

**Interval:** 6 hours starting 01:00 UTC daily

**Endpoint pushed to:** `POST /api/push-bctc-pdf` (multipart form data)

**Check status:**
```bash
ssh root@$VINAHOST_IP "systemctl status vn-bctc-fetch.service"
ssh root@$VINAHOST_IP "curl -s http://localhost:8000/api/bctc-fetch-queue | head -20"
```

**Troubleshoot:**
- Service inactive → `systemctl restart vn-bctc-fetch.service`
- Logs show "Puppeteer timeout" → SSC portal overloaded or interactive challenge triggered (automatic retry in 30min)
- Queue growing (>10 items) → Local server not pulling. Check `/api/bctc-fetch-queue` on VPS

### 3. News Fetch Service

**What:** Vietnamese financial news from 10 RSS sources (CafeF, VnExpress, etc.) + Reuters

**File:** `vps-scripts/fetch-vn-news.sh`

**Interval:** 15 minutes always (24/7)

**Endpoint pushed to:** `POST /api/push-news` (local server)

**Check status:**
```bash
ssh root@$VINAHOST_IP "systemctl status vn-news-fetch.service"
ssh root@$VINAHOST_IP "journalctl -u vn-news-fetch.service -n 50 --no-pager | tail -20"
```

**Troubleshoot:**
- Service inactive → `systemctl restart vn-news-fetch.service`
- Logs show "Some sources failed" → Partial outage on CafeF/VnExpress (acceptable, other 8 sources healthy)
- Empty items fetched → Likely parsing error. Check if RSS URLs changed (update in `fetch-vn-news.sh`)

### 4. SBV FX Rates Service

**What:** State Bank Vietnam FX rates (official USD/VND, EURo/VND, etc.)

**File:** `vps-scripts/fetch-sbv.sh`

**Interval:** 30 minutes starting 00:00 UTC daily

**Endpoint pushed to:** `POST /api/push-sbv` (local server)

**Check status:**
```bash
ssh root@$VINAHOST_IP "systemctl status vn-sbv-fetch.service"
```

**Troubleshoot:**
- Service inactive → `systemctl restart vn-sbv-fetch.service`
- Logs show "SSC portal unreachable" → SBV rates page is also geo-blocked; check VPS network
- No rates pushed → Data format on SBV changed. Requires code fix (alert Architect)

### 5. Foreign Flow Service

**What:** Foreign investor buy/sell volume per stock (pulled from market data)

**File:** `vps-scripts/fetch-foreign-flow.sh`

**Interval:** 60s during market hours (08:00-15:00 VN)

**Endpoint pushed to:** Merged into price-fetch push or separate `POST /api/push-foreign-flow`

**Check status:**
```bash
ssh root@$VINAHOST_IP "systemctl status vn-foreign-flow.service"
```

**Troubleshoot:**
- Service inactive → `systemctl restart vn-foreign-flow.service`
- Logs show "No foreign flow available" → Market data not yet published for the day (expected on weekend)

---

## Deployment

```bash
# From project root on local machine
./deploy-vinahost.sh
```

**What it does:**
1. Validates `.env` (VINAHOST_IP, VINAHOST_USER, VINAHOST_KEY)
2. SCP all `vps-scripts/*.sh` and `vps-scripts/fetch-browser.py` to VPS
3. SSH into VPS and reload all 5 systemd units
4. Verifies each service is enabled and started
5. Runs `/root/vps-status.sh` to confirm health

**If deployment fails:**
1. Check SSH connectivity: `ssh root@$VINAHOST_IP "hostname"`
2. Check `.env` path to SSH key: verify file exists and permissions (600)
3. Check VPS disk space: `ssh root@$VINAHOST_IP "df -h /"`
4. Read full error output and escalate to Ops Agent

---

## Local Endpoints (Receiving Data)

VPS services push data to local Bun server. These endpoints handle queueing and validation:

### `POST /api/push-prices`

**Headers:** None required

**Body:** JSON array of price records
```json
{
  "prices": [
    {
      "code": "VCB",
      "exchange": "HOSE",
      "price": 78500,
      "change": 250,
      "changePercent": 0.32,
      "volume": 1500000,
      "marketCap": 780000000000,
      "foreign": { "buy": 50000, "sell": 45000 },
      "timestamp": "2026-04-21T07:02:15Z"
    }
  ]
}
```

**Response:** `200 OK` or `400 Bad Request` (with error detail)

### `POST /api/push-bctc-pdf`

**Content-Type:** `multipart/form-data`

**Fields:**
- `pdf` (file): BCTC PDF binary
- `filename` (string): Original filename (e.g., "BCTC VCB 31.12.2025.pdf")
- `ticker` (string): Stock code extracted from filename

**Response:** `200 OK` (PDF queued for parsing) or `400 Bad Request`

### `POST /api/push-news`

**Headers:** None required

**Body:** JSON array of news items
```json
{
  "items": [
    {
      "source": "cafef",
      "title": "VCB báo lãi tăng 15% quý 1",
      "url": "https://cafef.vn/...",
      "publishedAt": "2026-04-21T06:30:00Z",
      "summary": "..."
    }
  ]
}
```

**Response:** `200 OK` or `400 Bad Request`

### `POST /api/push-sbv`

**Headers:** None required

**Body:** JSON object with FX rates
```json
{
  "rates": {
    "USD_VND": 24500,
    "EUR_VND": 26800,
    "GBP_VND": 31000,
    "JPY_VND": 165
  },
  "timestamp": "2026-04-21T06:30:00Z"
}
```

**Response:** `200 OK` or `400 Bad Request`

---

## Monitoring & Alerts

### VPS Watchdog Job (Local)

`vpsProxyWatchdogJob.ts` (runs every 10 min during market hours):
- Checks `MAX(market_prices.updated_at)`
- If >15 min stale → sends ONE alert to WORK channel (30-min cooldown)
- **Does NOT SSH into VPS** (VPS liveness is systemd's job)

### Circuit Breaker

Each fetcher has a circuit breaker (`src/infrastructure/circuitBreaker.ts`):
- **Failure threshold:** 3 consecutive errors
- **Trip time:** 5 minutes
- **Reset:** Auto-recover after 5 min of successful requests

### Rate Limiter

VPS services respect per-domain rate limits (no more than 1 req/sec per endpoint):
```bash
# Check current rates on VPS
ssh root@$VINAHOST_IP "tail -50 /var/log/vps-rate-limiter.log"
```

---

## Troubleshooting Decision Tree

```
VPS Service Issue?
├─ Service status = inactive
│  └─ Run: systemctl restart vn-SERVICE-NAME
│     └─ Check logs: journalctl -u vn-SERVICE-NAME -n 50 --no-pager
├─ Service status = failed
│  └─ Service crashed. Read logs for error.
│     └─ If persistent → escalate with logs to Architect
├─ Service status = active
│  └─ Is data being pushed?
│     ├─ No → Check VPS network: ping 8.8.8.8
│     ├─ Intermittent → Check circuit breaker state
│     └─ Yes, but local server not receiving
│        └─ Check local health: curl http://localhost:3000/health
```

---

## Rollback / Disaster Recovery

### If VPS Service Broken After Deploy

```bash
# SSH to VPS
ssh root@$VINAHOST_IP

# Find previous version (if available)
ls -la /root/vps-scripts.bak/

# Restore previous
if [ -d /root/vps-scripts.bak ]; then
  rm -rf /root/vps-scripts
  mv /root/vps-scripts.bak /root/vps-scripts
  systemctl restart vn-price-fetch vn-news-fetch vn-sbv-fetch
fi

# Verify
/root/vps-status.sh
```

### If VPS Becomes Unreachable

1. Verify local network: Check if server can reach internet at all
2. Check VPS provider status: Vinahost dashboard
3. Try restarting from VPS provider console (if SSH fails)
4. Escalate to human operator with VPS access

---

## Cost Optimization

- **VPS cost:** ~$5/month (shared resource)
- **Bandwidth:** ~2GB/month (news + prices, well within limits)
- **Uptime target:** 99.5% (28.8 min downtime/month acceptable)

If service exceeds budget, offload non-critical fetches (pharma signals, legal risk) to fallback local methods.
