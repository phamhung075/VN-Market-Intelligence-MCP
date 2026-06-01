# VPS Socat Bridge → Cloudflare Direct Routing Fix

**Document Date:** 2026-06-01  
**Urgency:** Medium (fragile, silent failure risk on Mac reboot)  
**Operator Audience:** Cloudflare Zero Trust dashboard admin  
**Current Status:** ✅ APPLIED & PROVEN 2026-06-01 — operator repointed `/api → http://localhost:3000`; VPS push endpoints (push-prices/news/sbv-rates/foreign-flow) verified 200 end-to-end through the tunnel direct to mcp-server `:3000`. socat (`:4000→:3000`) RETAINED under launchd as a fallback until Tuesday market-open confirms live VPS flow, then to be disabled.

> ⚠️ **CORRECTION (read before re-running):** An earlier draft of this runbook told operators to change the `/gateway` rule from `:4040` → `:4000`. **That is WRONG and dangerous** — `:4040` is the live, healthy `mcp-gateway` container (verified `docker ps`). Changing it BREAKS the gateway. **Leave `/gateway → http://localhost:4040` untouched.** Also: `/api` already EXISTS in the dashboard (it pointed at `:4000`), so this is an EDIT of the existing rule, not an "add". And `/api/health` returns **404** (mcp-server exposes health at `/health`, not `/api/health`) — use the push-endpoint reachability check in Step 5, not `/api/health`.

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

#### Step 2: EDIT the existing `/api` rule

`/api` ALREADY EXISTS in the Public Hostname table (it points at `http://localhost:4000` = the socat band-aid). Click **Edit** on that row and change ONLY its Service URL:

| Field | From | To |
|-------|------|-----|
| Service URL (`/api`) | `http://localhost:4000` | `http://localhost:3000` |

Click **Save**. Leave Subdomain/Path as-is.

Final correct table (only `/api` changes; the other two stay exactly as they are):

```
1. zenmidi.com ^/vn-market → http://localhost:3000   (leave)
2. zenmidi.com ^/gateway   → http://localhost:4040   (LEAVE — live mcp-gateway, do NOT change)
3. zenmidi.com ^/api       → http://localhost:3000   ← the one edit (was :4000)
4. (catch-all)
```

Order is fine as-is since each rule has a distinct path prefix.

#### Step 3: Do NOT touch `/gateway`

`/gateway → http://localhost:4040` is **CORRECT** — `:4040` is the live, healthy `mcp-gateway` container (verify with `docker ps`). Leave it unchanged. (A prior draft wrongly said to change it to `:4000`; that would break the gateway.)

#### Step 4: Wait for propagation

The dashboard auto-saves. **Wait 10–60 seconds** for the tunnel to pull the updated config from the Cloudflare API.

#### Step 5: Verify the Public Routes

`/api/health` does NOT exist (mcp-server serves health at `/health`, so `/api/health` → 404 — do not use it as a check). Verify route reachability via the real callback paths instead:

```bash
# Test 1: /api push path reaches mcp-server — auth-required, must NOT be 502
curl -s -o /dev/null -w "%{http_code}\n" https://zenmidi.com/api/push-prices
# Expected: 401 (route reaches mcp-server, auth enforced). 502 = route still broken.

# Test 2: /vn-market/health — regression check (should still work)
curl -s -o /dev/null -w "%{http_code}\n" https://zenmidi.com/vn-market/health
# Expected: 200

# Test 3 (definitive): a REAL authenticated VPS push (run from the VPS with its X-API-Key)
#   returns 200 + {updated/upserted/received: N} and appears in mcp-server logs as an /api/* hit.
```

**If Test 1 returns 502** after 90 seconds, perform a hard tunnel restart:

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
2. Revert the `/api` rule's Service URL back to `http://localhost:4000` (the socat bridge).
3. Do NOT touch `/gateway` (it stays `:4040`).
4. **Save** → wait 60s for propagation.

The system reverts to the socat-bridged state (socat must be running or re-armed via `launchctl load`).

---

## Expected Outcome

After this fix completes:

✓ `/api/*` routes directly to `mcp-server:3000` via the tunnel  
✓ VPS fetch callbacks (watchlist, push-prices, push-news, etc.) return 200 + data  
✓ socat bridge can be permanently disabled  
✓ Mac reboot does NOT re-break the route (it's tunnel config, not a local process)  
✓ VPS `/api/push-*` callbacks return 200 (auth-enforced; 401 without key, never 502)  

---

## Verification Commands (Post-Fix Archive)

Keep these for future diagnosis:

```bash
# Verify public tunnel route reaches mcp-server (401 = reachable+auth, 502 = broken)
curl -s -o /dev/null -w "Status: %{http_code}\n" https://zenmidi.com/api/push-prices

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
