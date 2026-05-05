# Claude Desktop MCP Connection Setup

## Problem Solved

**Issue**: Claude Desktop could not connect to MCP services.

**Root Cause**: No reverse proxy was configured. Services were only accessible on individual ports (3000, 4000, 5001-5006), not on standard HTTP ports 80/443.

**Solution**: Deployed nginx reverse proxy on ports 80/443 with proper routing.

## Quick Connection Test

Before configuring Claude Desktop, verify connectivity locally:

```bash
# HTTP route
curl http://localhost/vn-market/health

# HTTPS route
curl -k https://localhost/vn-market/health
```

Both should return `200 OK` with JSON health status.

## Configuring Claude Desktop

### Windows/macOS Configuration

Claude Desktop uses `.mcp.json` in the user's home directory (`~/.mcp.json` on macOS/Linux, `%APPDATA%\Claude\claude_desktop_config.json` on Windows).

#### Option 1: HTTP (Insecure, for Local Testing Only)

```json
{
  "mcpServers": {
    "vnmarket": {
      "command": "curl",
      "args": ["http://localhost/vn-market/tools"],
      "env": {}
    }
  }
}
```

#### Option 2: HTTPS with Self-Signed Cert (Requires Trust Setup)

On macOS, add the certificate to your keychain:

```bash
# Export the self-signed cert from Docker
docker cp vn-market-intelligence-mcp-nginx-1:/etc/nginx/ssl/cert.pem ~/Desktop/mcp-cert.pem

# Add to macOS keychain
security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain ~/Desktop/mcp-cert.pem

# Verify
security find-certificate -c "localhost" | grep "CN" | head -1
```

Then use HTTPS in Claude Desktop config:

```json
{
  "mcpServers": {
    "vnmarket": {
      "command": "curl",
      "args": ["https://localhost/vn-market/tools"],
      "env": {}
    }
  }
}
```

#### Option 3: Production Certificates (Cloudflare)

Once real SSL certificates are installed (see NGINX_SETUP.md), no special configuration is needed:

```json
{
  "mcpServers": {
    "vnmarket": {
      "command": "curl",
      "args": ["https://yourdomain.com/vn-market/tools"],
      "env": {}
    }
  }
}
```

## Accessing from Remote Machines

If Claude Desktop is running on a different machine than the MCP server:

### Same Network (LAN)

Find your machine's IP:

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr /C:"IPv4"
```

Then use that IP instead of localhost:

```json
{
  "mcpServers": {
    "vnmarket": {
      "command": "curl",
      "args": ["http://192.168.1.100/vn-market/tools"],
      "env": {}
    }
  }
}
```

### Through Cloudflare Tunnel

For secure external access:

1. Set up Cloudflare Tunnel pointing to `http://localhost:80`
2. Get Cloudflare domain (e.g., `vnmarket.example.com`)
3. Use in Claude config:

```json
{
  "mcpServers": {
    "vnmarket": {
      "command": "curl",
      "args": ["https://vnmarket.example.com/vn-market/tools"],
      "env": {}
    }
  }
}
```

## Available Endpoints

Once connected, Claude Desktop can access all MCP tools via:

### Base URL
- **HTTP**: `http://localhost/vn-market`
- **HTTPS**: `https://localhost/vn-market` (requires cert trust)

### Key Routes
- `/health` — Service health check
- `/tools` — List all available tools
- `/api/*` — API gateway routes
- `/mcp/*` — Direct MCP server routes

## Troubleshooting

### "Connection Refused" Error

**Check if nginx is running**:
```bash
docker-compose ps nginx
# Should show: Up X seconds (healthy)
```

**Check port 80 binding**:
```bash
lsof -i :80
# Should show: docker process listening on :80
```

### "Hostname Resolution Failed"

**For localhost**:
```bash
ping localhost
# Should respond successfully
```

**For LAN IP**:
```bash
ping 192.168.1.100  # Use your actual IP
# Should respond successfully
```

### "Certificate Verification Failed"

**If using HTTPS with self-signed cert**:

Option A: Skip verification (curl):
```bash
curl -k https://localhost/vn-market/health
```

Option B: Add cert to trust store (macOS):
```bash
docker cp vn-market-intelligence-mcp-nginx-1:/etc/nginx/ssl/cert.pem ./cert.pem
security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain ./cert.pem
```

Option C: Use production certs (see NGINX_SETUP.md)

### "504 Gateway Timeout"

**Check if backend services are healthy**:
```bash
docker-compose ps
# All services should show "Up X seconds (healthy)"
```

**Check nginx logs**:
```bash
docker-compose logs nginx | tail -50
```

**Check if specific service is down**:
```bash
curl http://localhost:3000/health      # MCP server
curl http://localhost:4000/health      # API gateway
```

## Restart Procedure

If services become unresponsive:

```bash
# Option 1: Restart just nginx
docker-compose restart nginx

# Option 2: Restart all services
docker-compose down
docker-compose up -d

# Verify all healthy
docker-compose ps
```

## Performance Notes

- **First request** may be slightly slower (connection pool warm-up)
- **HTTP/2** enabled on HTTPS (port 443) for better multiplexing
- **Compression** enabled for text/JSON responses
- **Timeouts** configured for long queries (24h read timeout for analysis tasks)

## File References

| File | Purpose |
|------|---------|
| `/docker-compose.yml` | Nginx service definition |
| `/nginx.conf` | Nginx configuration (routes, headers, SSL) |
| `/ssl/cert.pem` | SSL certificate |
| `/ssl/key.pem` | SSL private key |
| `/NGINX_SETUP.md` | Detailed nginx documentation |
| `/CLAUDE_DESKTOP_SETUP.md` | This file |

## Next Steps

1. ✓ Verify local connectivity (`curl http://localhost/vn-market/health`)
2. ✓ Export self-signed cert (if using HTTPS)
3. ✓ Add cert to trust store (macOS/Windows keychain)
4. ✓ Update Claude Desktop config (`.mcp.json`)
5. ✓ Restart Claude Desktop
6. ✓ Test connection from Claude chat interface

## Support

If Claude Desktop still cannot connect:

1. **Collect diagnostics**:
   ```bash
   docker-compose ps
   docker-compose logs nginx | tail -100
   curl -v http://localhost/vn-market/health
   ```

2. **Check connectivity from Claude Desktop console**:
   - Open Claude Desktop DevTools (Cmd+Option+I on macOS)
   - Look for network errors in Console tab
   - Check MCP server logs for request traces

3. **Verify config syntax**:
   - `.mcp.json` must be valid JSON
   - Use online JSON validator to check: https://jsonlint.com/

4. **Test with curl first**:
   ```bash
   curl -i http://localhost/vn-market/health
   # Should return 200 OK
   ```

---

**Last Updated**: 2026-05-05
**Status**: All services operational, nginx healthy
**Next Review**: If adding new routes or changing SSL certs
