# OPERATOR ALERT: VPS Socat Bridge Fragility Fix

**Date:** 2026-06-01  
**Urgency:** Medium  
**Action Required:** Cloudflare Zero Trust dashboard change (3 minutes, no code deployment needed)  

---

## Problem

The Mac host is running a **temporary, unsupervised socat bridge** that bridges Cloudflare tunnel traffic to the MCP server:

```
Cloudflare tunnel → :4000 (socat bridge) → :3000 (mcp-server)
```

**This bridge is fragile.** If the Mac reboots, the socat process drops, and every VPS callback returns 502 Bad Gateway — silently breaking the system for hours or days until manual intervention.

---

## Root Cause

The Cloudflare Zero Trust dashboard is configured to route `/api/*` traffic to `localhost:4000`, but the api-gateway microservice (which should listen on :4000) was never deployed on this host. The socat bridge is a band-aid to work around this.

## Solution (3 minutes, no code change needed)

Update the Cloudflare tunnel ingress rule to route `/api/*` **directly** to `localhost:3000` (the mcp-server, which is already running and working).

### Steps

1. Log into **Cloudflare Zero Trust Dashboard**
2. Navigate to: `Zero Trust → Networks → Tunnels → zenmidi.com → Configure → Public Hostname`
3. **Click "+ Add a public hostname"**
   - Subdomain: `zenmidi.com`
   - Path: `/api`
   - Service: `http://localhost:3000`
   - Click **Save**

4. **Reorder the new rule** to come BEFORE the `/vn-market` rule (drag or use "Move" button)
   - Order should be: `/api` → `/vn-market` → `/gateway` → catch-all

5. **Fix the `/gateway` rule** (while you're there):
   - Current: `http://localhost:4040` (WRONG — port 4040 isn't running)
   - Change to: `http://localhost:4000`
   - Click **Save**

6. **Wait 10–60 seconds** for Cloudflare to propagate the change

7. **Verify** (run these from terminal):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://zenmidi.com/api/health
   # Expected: 200
   
   curl -s https://zenmidi.com/api/health | jq '.toolCount'
   # Expected: 154
   ```

8. **Disable socat** (once verified):
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.vn-market.socat-bridge.plist
   ```

9. **Verify socat is off**:
   ```bash
   ps aux | grep socat | grep -v grep
   # Should return empty
   ```

---

## Expected Result

After these changes:
- ✓ VPS callbacks flow directly to mcp-server via Cloudflare tunnel
- ✓ No socat process running
- ✓ Mac reboot will NOT break the system
- ✓ Full 154-tool API health accessible at `https://zenmidi.com/api/health`

---

## Full Documentation

For detailed step-by-step instructions with screenshots, see:
```
docs/protocols/vps-socat-cloudflare-fix-runbook.md
```

## If Something Breaks

If the Cloudflare rule change breaks anything:
1. Delete the `/api` rule you added
2. Revert `/gateway` back to `:4040`
3. Wait 60 seconds
4. System reverts to socat-bridged state (can re-arm socat if needed)

---

## Questions?

See the architecture brief for detailed context:
```
docs/architecture-briefs/2026-05-12-cloudflare-tunnel-api-routing.md
```
