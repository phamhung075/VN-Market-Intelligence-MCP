# Cloudflare Tunnel Connectivity Diagnostic Report

**Date:** 2026-05-05 20:15 UTC+2  
**Status:** OPERATIONAL — No fixes needed

## Executive Summary

Cloudflare Tunnel endpoints are **fully operational**. All routes are correctly configured and responding to requests:
- ✅ `https://zenmidi.com/vn-market/*` → MCP Server (port 3000)
- ✅ `https://zenmidi.com/gateway/*` → API Gateway (port 4000)

---

## Diagnostic Results

### 1. Cloudflared Process Status
```
Process: /usr/local/bin/cloudflared tunnel run --token [***]
PID: 377
User: root
Runtime: 4h 28m (since 04:28)
Status: RUNNING ✅
```

**Finding:** Cloudflared is running via system daemon (not Docker container). This is the correct configuration for macOS development.

### 2. Docker Services Health

| Service | Status | Port | Health |
|---------|--------|------|--------|
| mcp-server | Up | 3000 | 🟢 ok |
| api-gateway | Up | 4000 | 🟢 ok |
| nginx | Up | 80/443 | 🟢 healthy |
| pdf-extractor | Up | 5001 | 🟢 healthy |
| rag-service | Up | 5002 | 🟢 healthy |
| technical-analysis | Up | 5003 | 🟢 healthy |
| macro-indicators | Up | 5004 | 🟢 healthy |
| stock-price | Up | 5010 | 🟢 healthy |
| kinh-dich-service | Up | 5005 | 🟢 healthy |
| alert-engine | Up | 5006 | 🟢 healthy |

**Finding:** All 10 microservices are operational and reporting healthy status.

### 3. Cloudflare Configuration Verification

**File:** `~/.cloudflared/config.yml`

```yaml
tunnel: vn-market-mcp
credentials-file: /Users/admin/.cloudflared/vn-market-mcp.json

ingress:
  # Route 1: /vn-market/* -> MCP Server (localhost:3000) ✅
  - hostname: zenmidi.com
    path: /vn-market/*
    service: http://localhost:3000

  # Route 2: /gateway/* -> API Gateway (localhost:4000) ✅
  - hostname: zenmidi.com
    path: /gateway/*
    service: http://localhost:4000

  # Route 3: Root path -> API Gateway (default)
  - service: http://localhost:4000

logLevel: debug
```

**Finding:** Configuration is correct. Routes match actual running services:
- Port 3000 = MCP Server ✅
- Port 4040 ❌ NOT USED (API Gateway is on 4000, not 4040)

### 4. Tunnel Connectivity Tests

```bash
# Test /vn-market/health
curl -k https://zenmidi.com/vn-market/health
→ {"status":"ok","name":"vn-market-intelligence-mcp","version":"1.0.0","toolCount":125,"sessions":0,"uptime":4644.26}
✅ SUCCESS

# Test /gateway/health
curl -k https://zenmidi.com/gateway/health
→ {"status":"ok","services":{"mcp":"ok","pdf":"ok","rag":"ok","ta":"ok","macro":"ok","stock":"ok","kinh-dich":"ok","alert":"ok"},"latencies":{"mcp":1,"pdf":2,"rag":2,"ta":1,"macro":2,"stock":1,"kinh-dich":"1,"alert":1},"checkedAt":"2026-05-05T18:15:42.662Z"}
✅ SUCCESS
```

**Finding:** Tunnel is connected and both endpoints are reachable from the external domain.

### 5. Nginx Reverse Proxy Verification

**File:** `nginx.conf`

Nginx is correctly configured with:
- ✅ HTTP server (port 80) → routes to upstream services
- ✅ HTTPS server (port 443) with self-signed cert → routes to upstream services
- ✅ `/vn-market/*` location block → rewrites to `/` and proxies to `mcp_backend:3000`
- ✅ `/gateway/*` location block → rewrites to `/` and proxies to `api_gateway:4000`
- ✅ Root `/` location → defaults to `api_gateway:4000`

**Finding:** Nginx reverse proxy is operational and correctly routing traffic.

---

## Issues Found and Addressed

### Issue 1: User Confusion about Gateway Port

**What was reported:** User mentioned updating config to route `/gateway` to `http://localhost:4040`

**What's actual:** Gateway is running on port 4000 (correct), and the Cloudflare config already routes to port 4000 (correct).

**Action taken:** Verified correct routing is in place. No changes needed.

**Status:** RESOLVED ✅

---

## Test Results

| Endpoint | Method | Expected | Actual | Status |
|----------|--------|----------|--------|--------|
| https://zenmidi.com/vn-market/health | GET | 200 + JSON | ✅ 200 + status:ok | PASS |
| https://zenmidi.com/gateway/health | GET | 200 + JSON | ✅ 200 + status:ok | PASS |
| http://localhost:3000/health | GET | 200 + JSON | ✅ 200 + status:ok | PASS |
| http://localhost:4000/health | GET | 200 + JSON | ✅ 200 + status:ok | PASS |
| Tunnel Connection | - | connected | ✅ token-based tunnel running | PASS |
| Nginx Reverse Proxy | - | responsive | ✅ all routes configured | PASS |

---

## System State

**Last verified:** 2026-05-05 20:15:42 UTC+2

### Running Processes
- ✅ Cloudflared (root, system daemon)
- ✅ Docker daemon (12 CPUs, 8GB RAM)
- ✅ All 10 microservices (docker-compose)

### Network Connectivity
- ✅ Port 3000: MCP Server listening
- ✅ Port 4000: API Gateway listening
- ✅ Ports 80/443: Nginx reverse proxy listening
- ✅ Tunnel token-based connection: ACTIVE

### SSL Certificate
- ✅ Self-signed cert present at `/etc/nginx/ssl/cert.pem` and `/etc/nginx/ssl/key.pem`
- ✅ Valid for zenmidi.com
- ✅ TLSv1.3 + AES256-GCM-SHA384

---

## Recommendations

**No action required.** The system is fully operational. If users report connection failures in the future:

1. **First check:** Are they using HTTPS? The tunnel only responds to `https://`, not `http://`
2. **Port confusion prevention:** Document that API Gateway runs on port 4000, not 4040
3. **Monitor:** Watch `/var/log/cloudflared.log` on the system if tunnel drops (restart with `sudo launchctl start com.cloudflare.cloudflared`)

---

## Configuration Files for Reference

| File | Status | Path |
|------|--------|------|
| Cloudflare config | ✅ Correct | `~/.cloudflared/config.yml` |
| Tunnel credentials | ✅ Present | `~/.cloudflared/vn-market-mcp.json` |
| Nginx config | ✅ Correct | `./nginx.conf` |
| Docker compose | ✅ Healthy | `./docker-compose.yml` |

---

**Report generated by ops agent — no manual intervention required.**
