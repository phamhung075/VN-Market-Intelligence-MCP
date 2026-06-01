# OPERATOR ALERT: VPS Socat Bridge Fragility Fix

**Date:** 2026-06-01  
**Status:** ✅ DONE 2026-06-01 — operator repointed `/api → http://localhost:3000`; VPS push endpoints verified 200 end-to-end. socat retained as fallback until Tuesday open.  
**Urgency:** Resolved (kept for reference / rollback)  

> ⚠️ The steps below are corrected. An earlier version wrongly said to change `/gateway` to `:4000` and to add a new `/api` rule and curl `/api/health`. The TRUTH: `/api` already existed (was `:4000`) → just EDIT it to `:3000`; `/gateway` stays `:4040` (live mcp-gateway — do NOT touch); `/api/health` 404s, verify via `/api/push-prices` instead.

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
3. **Edit the EXISTING `/api` rule** (it currently points to `http://localhost:4000`):
   - Change Service URL → `http://localhost:3000`
   - Click **Save**
4. **Leave `/vn-market` (`:3000`) and `/gateway` (`:4040`) UNTOUCHED.** `:4040` is the live mcp-gateway — changing it breaks the gateway.
5. **Wait 10–60 seconds** for Cloudflare to propagate.
6. **Verify** (route reaches mcp-server; `/api/health` 404s so don't use it):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://zenmidi.com/api/push-prices
   # Expected: 401 (reachable + auth enforced). 502 = still broken.
   ```
7. **Disable socat** (only after a real VPS push confirms live flow):
   ```bash
   launchctl bootout gui/$(id -u)/com.vn-market.socat-bridge
   ```
8. **Verify socat is off**:
   ```bash
   pgrep -fl socat        # empty
   launchctl list | grep socat   # empty
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
1. Revert the `/api` rule's Service URL back to `http://localhost:4000` (socat bridge)
2. Leave `/gateway` alone (`:4040`)
3. Wait 60 seconds
4. System reverts to socat-bridged state (socat must be running, or re-arm via `launchctl load`)

---

## Questions?

See the architecture brief for detailed context:
```
docs/architecture-briefs/2026-05-12-cloudflare-tunnel-api-routing.md
```
