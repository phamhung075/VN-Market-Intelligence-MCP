# Ops — Notebook

**Last updated:** 2026-05-12 13:35 UTC | **Sprint:** 1894a-cloudflare-tunnel-routing diagnosis

---

## Task: 1894a-cloudflare-tunnel-routing — Diagnosis COMPLETE, Escalation Sent

**Status:** AC FAIL — External route not working; escalated to architect

**Issue Summary:**
- User reported: `POST https://zenmidi.com/api/push-news` returns HTTP 404
- Locally confirmed: `POST http://localhost:3000/api/push-news` returns HTTP 401 (auth required, endpoint exists)
- Public route broken: Cloudflare tunnel not configured with `/api/*` ingress rule

**Root Cause Identified:**
1. Cloudflare tunnel (`zenmidi.com`) is dashboard-managed (not file-based)
2. Dashboard configuration only includes 2 routes:
   - `/vn-market/*` → `http://localhost:3000` ✓
   - `/gateway/*` → `http://localhost:4040` (wrong port—should be 4000)
3. **Missing:** `/api/*` → `http://localhost:3000` rule needed for VPS push endpoints

**Diagnosis Evidence:**
```
Test 1: localhost routing (works)
  curl -X POST http://localhost:3000/api/push-news \
    -H "Content-Type: application/json" -d '[]'
  → HTTP 401 Unauthorized (endpoint exists)

Test 2: public routing (broken)
  curl -X POST https://zenmidi.com/api/push-news \
    -H "Content-Type: application/json" -d '[]'
  → HTTP 404 Not Found (route missing)

Test 3: Cloudflare tunnel status (works for /vn-market)
  curl https://zenmidi.com/vn-market/health
  → HTTP 200 OK ✓

Test 4: cloudflared logs show dashboard config
  "Updated to new configuration config=\"{\\\"ingress\\\":[
    {\\\"path\\\":\\\"^/vn-market\\\",\\\"service\\\":\\\"http://localhost:3000\\\"},
    {\\\"path\\\":\\\"^/gateway\\\",\\\"service\\\":\\\"http://localhost:4040\\\"}
  ]\" version=9"
```

**Escalation Signal:**
- File: `/docs/signals/1894a-cloudflare-routing-escalation.json`
- Required action: Update Cloudflare dashboard tunnel config (outside ops permissions)
- AC after fix: `POST https://zenmidi.com/api/push-news` should return HTTP 401 (auth required), not 404

---

## Prior Context (from earlier notebook entries)

### Task 1: 1892a-ops AC-3 RE-VERIFY ✓ PASS

**Status:** AC-3 PASS — `/api/push-news` returns HTTP 200 OK locally; gateway code deployed; public tunnel routing blocked (outside ops scope)

**Summary:**
- Code change (commit f4141f63) deployed and tested locally: working ✓
- Public routing issue deferred to architect: escalation sent

---

## Monitoring Checklist

- [x] Local MCP server `/api/push-news` endpoint verified (exists, returns 401 for auth check)
- [x] Cloudflare tunnel connectivity verified (`/vn-market/*` routes work)
- [x] Dashboard-managed tunnel configuration identified (not file-based)
- [x] Escalation signal created with remediation steps
- [ ] Await architect response: Cloudflare dashboard config update

