# Nginx Reverse Proxy Setup

## Overview

An nginx reverse proxy container has been added to the Docker Compose stack to provide:

- **HTTP/HTTPS load balancing** on ports 80 and 443
- **Cloudflare integration** with origin validation headers
- **Reverse proxy routing** to the API gateway (port 4000) and MCP server (port 3000)
- **External connectivity** for Claude Desktop and other external clients

## Architecture

```
External Client (Claude Desktop)
        ↓
    nginx (port 80/443)
        ├─→ api-gateway (4000) — main route /
        └─→ mcp-server (3000) — Cloudflare route /vn-market/*
```

## Services Added

### nginx:1.27-alpine

- **Ports**: 80 (HTTP), 443 (HTTPS)
- **Config**: `/nginx.conf` (mounted read-only)
- **SSL**: `/ssl/` (self-signed certs included)
- **Health check**: `GET /health` → 200 OK
- **Restart policy**: unless-stopped

## Configuration Files

### 1. docker-compose.yml

Added nginx service at the beginning of the services list:

```yaml
nginx:
  image: nginx:1.27-alpine
  ports:
  - "80:80"
  - "443:443"
  volumes:
  - ./nginx.conf:/etc/nginx/nginx.conf:ro
  - ./ssl:/etc/nginx/ssl:ro
  depends_on:
  - mcp-server
  - api-gateway
  restart: unless-stopped
  healthcheck:
    test:
    - CMD
    - wget
    - -qO-
    - http://localhost/health
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 10s
```

### 2. nginx.conf

Main nginx configuration with the following routes:

#### HTTP (port 80)
- `GET /health` → nginx health check
- `GET /` → proxies to api-gateway (4000)
- `GET /mcp/*` → proxies to mcp-server (3000)
- `GET /vn-market/*` → proxies to mcp-server (3000) for Cloudflare routing

#### HTTPS (port 443)
- Same routes as HTTP
- HTTP/2 enabled
- Self-signed SSL certificate (cert.pem + key.pem)

### 3. ssl/

Self-signed SSL certificates (valid for 365 days):
- `cert.pem` — certificate
- `key.pem` — private key

**To use real certificates from Cloudflare or Let's Encrypt**, replace these files:

```bash
# Copy real certs to ssl/ directory
cp /path/to/your/cert.pem ssl/cert.pem
cp /path/to/your/key.pem ssl/key.pem

# Reload nginx
docker-compose exec nginx nginx -s reload
```

## Port Bindings

After deployment, the following ports are bound externally:

| Port | Protocol | Service | Route |
|------|----------|---------|-------|
| 80 | HTTP | nginx | All routes |
| 443 | HTTPS | nginx | All routes (HTTP/2) |
| 3000 | HTTP | mcp-server | Direct access |
| 4000 | HTTP | api-gateway | Direct access |
| 5001-5006 | HTTP | Microservices | Direct access |

**Important**: Ports 80 and 443 bind to `0.0.0.0` (all interfaces), making them accessible externally.

## Connection from Claude Desktop

### HTTP (localhost, insecure)

```bash
curl http://localhost/health
curl http://localhost/vn-market/health
```

### HTTPS (localhost, self-signed)

```bash
# Insecure (for testing only)
curl -k https://localhost/health
curl -k https://localhost/vn-market/health

# With cert verification (requires adding cert to trust store)
# On macOS:
security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain ssl/cert.pem
curl https://localhost/health
```

### From External Network

If accessing from a remote machine on your LAN or via Cloudflare:

```bash
# Replace with your actual hostname/IP
curl http://<your-ip>/health
curl http://<your-ip>/vn-market/health

# HTTPS
curl -k https://<your-ip>/health
curl -k https://<your-ip>/vn-market/health
```

## Proxy Headers & Cloudflare Integration

The nginx config includes headers required for Cloudflare origin validation:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $server_name;
proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
proxy_set_header CF-IPCountry $http_cf_ipcountry;
```

These headers allow the backend services to:
- Determine real client IP (even behind reverse proxy)
- Detect protocol (HTTP vs HTTPS)
- Identify Cloudflare origin requests
- Validate origin location

## Testing & Troubleshooting

### Check nginx status

```bash
docker-compose ps nginx
```

Expected output: `Up X seconds (healthy)`

### Test health endpoint

```bash
curl -v http://localhost/health
```

Expected response: `200 OK` with body `nginx healthy`

### Test MCP routing

```bash
curl http://localhost/vn-market/health
```

Expected response: `200 OK` with JSON health status

### View nginx logs

```bash
docker-compose logs nginx
```

### Reload config without restart

```bash
docker-compose exec nginx nginx -t  # Test config
docker-compose exec nginx nginx -s reload  # Reload
```

### Restart nginx container

```bash
docker-compose restart nginx
```

## SSL Certificate Management

### Current (Self-Signed)

The current SSL certificates are self-signed and will trigger browser warnings. They are suitable for:
- Local development
- Internal testing
- Debugging

### For Production

Replace with real certificates:

1. **Let's Encrypt (ACME)**
   ```bash
   # Use certbot or similar tool
   certbot certonly --standalone -d yourdomain.com
   cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
   cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
   docker-compose exec nginx nginx -s reload
   ```

2. **Cloudflare Origin Certificate**
   - Generate in Cloudflare dashboard
   - Download cert and key
   - Copy to `ssl/cert.pem` and `ssl/key.pem`
   - Reload nginx

## Performance Features

The nginx config includes:

- **Gzip compression** for text/JSON responses
- **Upstream connection pooling** to backend services
- **Keepalive** for TCP connection reuse
- **Timeouts** configured for long-running queries (86400s = 24h for `proxy_read_timeout`)
- **Large file support** (`client_max_body_size: 100M`)
- **HTTP/2** on HTTPS connections

## Monitoring

### Health Check Endpoint

The nginx container has a built-in health check that runs every 30 seconds:

```bash
GET http://localhost/health
```

If health check fails 3 times, the container is marked unhealthy and Docker may auto-restart it.

### Metrics

Monitor these endpoints to verify all services are healthy:

```bash
curl http://localhost/health                    # nginx
curl http://localhost/vn-market/health          # MCP server
curl http://localhost/api/health                # API gateway
```

## File Locations

| File | Purpose |
|------|---------|
| `/docker-compose.yml` | Updated with nginx service |
| `/nginx.conf` | Nginx configuration (HTTP + HTTPS) |
| `/ssl/cert.pem` | Self-signed SSL certificate |
| `/ssl/key.pem` | SSL private key |
| `/NGINX_SETUP.md` | This documentation |

## Deployment History

- **2026-05-05**: Initial nginx setup
  - Created nginx service in docker-compose.yml
  - Generated self-signed SSL certificates
  - Configured HTTP and HTTPS routing
  - Removed legacy standalone proxy container
  - All 10 services (nginx + 9 existing) operational

## Rollback Instructions

If you need to revert to the old setup:

1. **Remove nginx service from docker-compose.yml**
2. **Redeploy**:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

The remaining 9 services will still be accessible on their individual ports (3000, 4000, 5001-5006).

---

**Note**: Always run `docker-compose down && docker-compose up -d` to apply changes to docker-compose.yml. Do not use `docker-compose restart` for changes to port bindings.
