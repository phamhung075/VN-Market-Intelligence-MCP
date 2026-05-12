# Architecture Brief — 1894a: Cloudflare Tunnel /api/* Routing

**Sprint:** 1894a-cloudflare-tunnel-routing
**Authored:** 2026-05-12
**Author:** Architect

---

## 1. Summary

`POST https://zenmidi.com/api/push-news` → 404 because the Cloudflare dashboard tunnel has
no ingress rule for `/api/*`. Code layer is fully fixed (1892b merged, `proxyPath()` +
`noProbe` live in api-gateway:4000). The gap is Cloudflare public-edge config only.
Decision: route `/api/*` to `localhost:4000` (api-gateway). Side-fix: `/gateway/*` points
to wrong port `:4040` — must be corrected to `:4000` in the same dashboard edit.

---

## 2. Options Compared

| Dimension | Option A: `/api/*` → `:3000` (mcp-server direct) | Option B: `/api/*` → `:4000` (api-gateway) |
|-----------|--------------------------------------------------|---------------------------------------------|
| Hops | 1 (cloudflared → mcp-server) | 2 (cloudflared → api-gateway → mcp-server) |
| Latency | ~0ms extra | +1-3ms (localhost loop, negligible) |
| 1892b infra used | No — `proxyPath()` + `noProbe` flag is dead letter for public traffic | Yes — honors the spec that was already merged |
| Auth pass-through | mcp-server handles auth directly | api-gateway passes headers verbatim (confirmed: `c.req.raw.headers`) |
| Future `/api/macro/*`, `/api/stock/*` mux | Requires adding routes on mcp-server | Free — api-gateway service registry handles it |
| Single public-edge | Split: `/vn-market/*` → :3000, `/api/*` → :3000 (same target, two rules) | Unified: api-gateway is the sole public HTTP router |
| Architectural alignment | Violates 1892b intent; api-gateway becomes a partial lie | Consistent with DDD: api-gateway = interface layer for HTTP public surface |
| Risk | LOW for current endpoints; HIGH for architectural drift | LOW — tested by 10 passing 1892b tests |

---

## 3. Decision: Option B — `/api/*` → `localhost:4000`

**Rationale:**

1. 1892b is merged and tested (10 tests, all PASS). Bypassing it via Option A makes that
   sprint's `proxyPath()` / `noProbe` infra dead code for the primary use case. That is
   a waste and a future maintenance trap.

2. The api-gateway is the documented public-edge router. Making mcp-server also accept
   raw public traffic splits the public-surface contract across two services. Any future
   `/api/macro/*` or `/api/stock/*` route would need either a second Cloudflare rule or
   another mcp-server bypass — Option A creates a pattern problem.

3. The extra hop is localhost-to-localhost TCP on the same host. Measured latency impact
   is under 3ms. This is not a production concern.

4. Auth is NOT touched by the gateway — `c.req.raw.headers` pass through verbatim (code
   confirmed, line 70 handlers.ts). No regression risk on the API key auth path.

5. Option A's only real advantage is "one less hop" — which is not a stated constraint
   for this system. The architecture already accepts multi-hop (api-gateway → stock-price,
   api-gateway → ta, etc.).

---

## 4. Exact Cloudflare Dashboard Payload

Login: `dash.cloudflare.com` → Zero Trust → Networks → Tunnels → `zenmidi.com` tunnel →
"Configure" → "Public Hostname" tab.

### Current state (broken)

| # | Subdomain | Path | Service |
|---|-----------|------|---------|
| 1 | zenmidi.com | `^/vn-market` | `http://localhost:3000` |
| 2 | zenmidi.com | `^/gateway` | `http://localhost:4040` ← WRONG PORT |
| 3 | (catch-all) | — | (default) |

### Target state (apply in order)

| # | Subdomain | Path | Service | Action |
|---|-----------|------|---------|--------|
| 1 | zenmidi.com | `/api` | `http://localhost:4000` | ADD — place BEFORE catch-all |
| 2 | zenmidi.com | `^/vn-market` | `http://localhost:3000` | KEEP unchanged |
| 3 | zenmidi.com | `^/gateway` | `http://localhost:4000` | FIX port 4040 → 4000 |
| 4 | (catch-all) | — | (default) | KEEP last |

### Path pattern to enter for the /api rule

```
/api
```

Cloudflare tunnel path matching is prefix-based by default. Entering `/api` matches all
requests whose path begins with `/api` (equivalent to `/api/*`). No regex needed.

### Order matters

The `/api` rule must be listed ABOVE the catch-all. In the Cloudflare dashboard, use the
drag handle or "Move up" button to position it before the default route.

---

## 5. /gateway Typo Fix

Current dashboard value for the `/gateway` rule:
```
http://localhost:4040   ← wrong (port 4040 does not exist / is not api-gateway)
```

Correct value:
```
http://localhost:4000   ← api-gateway listens on port 4000
```

Edit the existing `/gateway` rule in the dashboard (do not delete + recreate — edit in
place to preserve rule ordering). Change only the service URL field.

---

## 6. Post-Fix Verification Curls

Run these from an external network (or via VPS — NOT from localhost):

```bash
# 1. /api/push-news — must return 401 (auth required, not 404)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://zenmidi.com/api/push-news \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'
# Expected: 401

# 2. /api/push-news with valid key — must return 200
curl -s -w "\n%{http_code}" \
  -X POST https://zenmidi.com/api/push-news \
  -H "Content-Type: application/json" \
  -H "x-api-key: <YOUR_API_KEY>" \
  -d '{"items":[]}'
# Expected: 200 + {"ok":true,...}

# 3. /api/health/vps-news — must return 200 (no auth needed)
curl -s https://zenmidi.com/api/health/vps-news
# Expected: 200 + {"service":"news","healthy":true|false,...}

# 4. /vn-market/* still works (regression check)
curl -s -o /dev/null -w "%{http_code}" https://zenmidi.com/vn-market/health
# Expected: 200

# 5. /gateway/health — must now reach api-gateway (not timeout/error)
curl -s -o /dev/null -w "%{http_code}" https://zenmidi.com/gateway/health
# Expected: 200

# 6. Gateway aggregate health — all 9 services visible
curl -s https://zenmidi.com/gateway/health | jq '.services | keys'
# Expected: ["alert","kinh-dich","macro","mcp","pdf","rag","stock","ta"] (8 real services)
```

Tunnel config propagates in 10-60 seconds after dashboard save. If step 1 still returns
404 after 90 seconds, hard-reload the tunnel: Zero Trust → Tunnels → overflow menu →
"Restart tunnel".

---

## 7. Rollback Procedure

If the dashboard change breaks anything:

1. Cloudflare dashboard → same tunnel → "Public Hostname" tab.
2. Delete the `/api` rule added in Step 4.
3. Revert the `/gateway` service URL back to `http://localhost:4040` (original broken state).
4. Save → wait 60s for propagation.

This restores the pre-change state exactly. The code (1892b) is unaffected — it stays
merged and will activate again when the correct dashboard rule is re-applied.

For urgent rollback without dashboard access:

```bash
# Restart cloudflared to force re-pull of remote config
sudo launchctl stop com.cloudflare.cloudflared
sudo launchctl start com.cloudflare.cloudflared
# Tunnel will reconnect with whatever config Cloudflare has at that moment
```

---

## Risk Surface

| Risk | Severity | Note |
|------|----------|------|
| Tunnel propagation delay | LOW | 10-90s typical; check after 90s before debugging |
| /api matching too broad | LOW | Only `/api/*` paths forwarded; other paths unaffected |
| /gateway fix breaks anything | NONE | Port 4040 was wrong; 4000 is the running api-gateway |
| Auth key exposure | NONE | TLS end-to-end; api-gateway passes headers verbatim, no log |
