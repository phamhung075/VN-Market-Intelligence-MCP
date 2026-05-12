> Parent: [vps-setup.md](./vps-setup.md)

# Five VPS Fetch Services

All services are systemd units on Vinahost. Deploy via `./deploy-vinahost.sh` (from project root).

---

## 1. Price Fetch Service

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

---

## 2. BCTC Fetch Service

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

---

## 3. News Fetch Service

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

---

## 4. SBV FX Rates Service

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

---

## 5. Foreign Flow Service

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
