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

## Service & Endpoint Index

| Content | Read from |
|---------|-----------|
| Five fetch services (price, BCTC, news, FX, foreign flow) | → see [vps-setup-services.md](./vps-setup-services.md) |
| Local API endpoints (POST receivers) | → see [vps-setup-endpoints.md](./vps-setup-endpoints.md) |
| Deployment, monitoring, rollback & recovery | → see [vps-setup-deployment.md](./vps-setup-deployment.md) |
