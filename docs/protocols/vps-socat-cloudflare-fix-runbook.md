# VPS Socat Bridge → Cloudflare Direct Routing Fix

**Document Date:** 2026-06-01  
**Urgency:** Medium (fragile, silent failure risk on Mac reboot)  
**Operator Audience:** Cloudflare Zero Trust dashboard admin  
**Current Status:** socat bridge LIVE (`:4000 → :3000`), temporary but UNSUPERVISED  

---

## Problem Statement

The Cloudflare tunnel (token-mode, dashboard-managed) currently routes **all `/api/*` traffic → `localhost:4000`** (the api-gateway microservice, which was **never deployed** on this macOS host). This causes every VPS fetch callback to return **502 Bad Gateway**.

**Immediate Recovery (2026-06-01, commit 06e0b5da):** ops bridged `:4000 → :3000` (mcp-server) with a manual `socat` process (PID-based, no launchd supervision). Data now flows, but **reboot will drop socat** and silently reopen the multi-day outage.

**Root Cause:** The Cloudflare dashboard ingress rule for `/api/*` points to the wrong service. The local `~/.cloudflared/config.yml` in the repo is **inert** (token-mode tunnels ignore local config and pull their rules from the Cloudflare API).

---

## Solution: Repoint Tunnel Ingress to mcp-server Directly

Change the Cloudflare tunnel ingress rule so `/api/*` → `http://localhost:3000` (mcp-server) **directly**, eliminating the socat bridge entirely.

### Why This Approach

1. **Single hop:** cloudflared → mcp-server (direct)
2. **Reboot-safe:** no process supervision needed
3. **Documented:** this runbook and the config will match the truth
4. **Proves mcp-server works** as the public HTTP edge for `/api/*`
5. **Removes temporary band-aid** and the risk of silent breakage

### Operator Steps

#### Step 1: Log in to Cloudflare Zero Trust Dashboard

```
https://dash.cloudflare.com
```

Navigate to:
```
Zero Trust → Networks → Tunnels → (zenmidi.com) tunnel → Configure → Public Hostname
```

You should see a table like:

| # | Subdomain | Path | Service |
|---|-----------|------|---------|
| 1 | zenmidi.com | `^/vn-market` | `http://localhost:3000` |
| 2 | zenmidi.com | `^/gateway` | `http://localhost:4040` |
| 3 | (catch-all) | — | (default) |

#### Step 2: ADD New Rule for `/api/*`

Click **"+ Add a public hostname"** button.

Fill in the form:

| Field | Value |
|-------|-------|
| Subdomain | `zenmidi.com` |
| Path | `/api` |
| Service URL | `http://localhost:3000` |

Click **Save**.

**CRITICAL:** After save, the new rule will appear in the table. Use the drag handle or "Move" button to position it **ABOVE the catch-all rule** and the `/vn-market` rule. Order must be:

```
1. /api → http://localhost:3000     ← NEWLY ADDED
2. ^/vn-market → http://localhost:3000
3. ^/gateway → http://localhost:4000
4. (catch-all)
```

Prefix-matching is left-to-right; `/api` must come before `/vn-market` to avoid prefix collision.

#### Step 3: VERIFY the `/gateway` Rule Port

Check the row for `/gateway`. The current Service URL is likely:

```
http://localhost:4040
```

This is **WRONG** — port 4040 is not running. Change it to:

```
http://localhost:4000
```

Click **Edit** on that row, change the Service URL, and **Save**.

#### Step 4: Save All Changes

Once both rules are in place and correctly ordered, the dashboard will auto-save. **Wait 10–60 seconds** for the tunnel to pull the updated config from Cloudflare API.

#### Step 5: Verify the Public Routes

Run these curls from **outside localhost** (or from a separate terminal on the same host):

```bash
# Test 1: /api/health (no auth) — should return 200 + health JSON
curl -s -o /dev/null -w "%{http_code}\n" https://zenmidi.com/api/health
# Expected: 200

# Test 2: /vn-market/health — verify regression (should still work)
curl -s -o /dev/null -w "%{http_code}\n" https://zenmidi.com/vn-market/health
# Expected: 200

# Test 3: /api/watchlist (VPS callback path) — auth required, should NOT 502
curl -s -o /dev/null -w "%{http_code}\n" https://zenmidi.com/api/watchlist
# Expected: 401 or 403 (auth failure is OK; 502 is BAD)

# Test 4: Full health check — list all 154 tools
curl -s https://zenmidi.com/api/health | jq '.toolCount'
# Expected: 154
```

**If any test returns 404 or 502** after 90 seconds, perform a hard tunnel restart:

```
Cloudflare dashboard → Zero Trust → Tunnels → (zenmidi.com) → overflow menu → "Restart tunnel"
```

Then wait 30 seconds and re-test.

---

## After Verification: Remove socat Supervision

Once the direct routing is **proven stable**, you can disable the socat bridge:

### Option 1: Unload (Recommended — Preserves for Emergency Re-arm)

```bash
launchctl unload ~/Library/LaunchAgents/com.vn-market.socat-bridge.plist
```

This stops the socat process but leaves the plist file in place, allowing quick re-arm if the Cloudflare rule breaks again:

```bash
launchctl load ~/Library/LaunchAgents/com.vn-market.socat-bridge.plist
```

### Option 2: Delete (Complete Cleanup)

```bash
launchctl unload ~/Library/LaunchAgents/com.vn-market.socat-bridge.plist
rm ~/Library/LaunchAgents/com.vn-market.socat-bridge.plist
```

### Verify socat is Off

```bash
ps aux | grep socat | grep -v grep
# Should return empty (no socat process)

launchctl list | grep socat
# Should return empty
```

---

## Rollback Procedure (If Something Breaks)

If the new routing breaks something:

1. **Cloudflare dashboard** → same tunnel → "Public Hostname" tab.
2. Delete the `/api` rule added in Step 2.
3. Revert the `/gateway` service URL back to `http://localhost:4040`.
4. **Save** → wait 60s for propagation.

The system reverts to the socat-bridged state (if socat is still running or re-armed).

---

## Expected Outcome

After this fix completes:

✓ `/api/*` routes directly to `mcp-server:3000` via the tunnel  
✓ VPS fetch callbacks (watchlist, push-prices, push-news, etc.) return 200 + data  
✓ socat bridge can be permanently disabled  
✓ Mac reboot does NOT re-break the route (it's tunnel config, not a local process)  
✓ Full 154-tool health check accessible at `https://zenmidi.com/api/health`  

---

## Verification Commands (Post-Fix Archive)

Keep these for future diagnosis:

```bash
# Verify public tunnel routes
curl -s -w "\nStatus: %{http_code}\n" https://zenmidi.com/api/health | head -5

# Verify local mcp-server still responds
curl -s http://localhost:3000/health | jq '.status'

# Verify socat is OFF (after disabling)
ps aux | grep socat | grep -v grep

# Verify tunnel config via Cloudflare API (if you have an API token)
curl -H "Authorization: Bearer <CF_API_TOKEN>" \
  https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/cfd_tunnel/<TUNNEL_ID>/connections
```

---

## References

- [Cloudflare Tunnel Ingress Rules](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/ingress/)
- **Project Brief:** `docs/architecture-briefs/2026-05-12-cloudflare-tunnel-api-routing.md`
- **Original Signal:** `docs/signals/processed/repair_task_request_ops_vps_socat_persist_20260601T0241Z.json`
