# Ops — Notebook

**Last updated:** 2026-05-12 06:35 UTC | **Sprint:** 1892a (pollNews pipeline verification)

---

## CRITICAL: Task 1892a — pollNews Pipeline Diagnosis ✗ BLOCKER

**Status:** AC-1 PASS, AC-2 PASS, AC-3 FAIL (architectural issue), AC-4 MONITORING

**Findings:**

1. **AC-1 PASS:** VPS `vn-news-fetch.service` is active and running on Vinahost (125.212.251.27)
   - Service: active (running) since 2026-05-02
   - Process: `/root/fetch-vn-news-loop.sh` + `/root/fetch-vn-news.sh`
   - Service file: correctly installed at `/etc/systemd/system/vn-news-fetch.service`

2. **AC-2 PARTIAL:** Script redployed with correct endpoint
   - **Initial state:** `/root/fetch-vn-news.sh` had stale endpoint `https://zenmidi.com/vn-market/api/push-news`
   - **Root cause:** Previous deployment used old URL structure; deploy-vinahost.sh sed substitution was correct but VPS had not been redeployed since Vultr→Vinahost migration
   - **Action taken:** Manual redeploy (2026-05-12T06:31 UTC) updated script to correct endpoint `https://zenmidi.com/api/push-news`
   - **Verified:** API_KEY is real (not placeholder)

3. **AC-3 FAIL — ARCHITECTURAL BLOCKER:** Endpoint not exposed through public gateway
   - VPS manual test run (2026-05-12T06:33 UTC): 245 news items fetched, curl POST returned **HTTP 404**
   - Root cause: `/api/push-news` route exists on MCP server (port 3000, verified in code at server.ts:379) but is NOT exposed through the public API Gateway (port 4000)
   - Gateway analysis: `apps/api-gateway/src/index.ts` routes `/` requests to named services (mcp, pdf, rag, ta, macro, stock, kinh-dich, alert) but does NOT expose any `/api/push-*` routes
   - **Consequence:** VPS can only reach `https://zenmidi.com/api/push-news` through Cloudflare→Gateway chain, which returns 404
   - **Working verification:** Direct POST to `http://localhost:3000/api/push-news` returns 200 ✓
   - **Blocker:** This is not an ops-fixable issue; it requires API Gateway code changes (gateway developer responsibility)

4. **AC-4 MONITORING:** Database shows news push gap (2026-05-08 to present)
   - Last successful `vps_push_log` news row: 2026-05-08T22:47:38.750207 (205 items)
   - No rows since then; VPS has been unable to POST for 4 days
   - When endpoint becomes available, database will auto-populate

**Database Evidence (market.db vps_push_log):**
```
news|ok|205||2026-05-08T22:47:38.750207  ← LAST SUCCESSFUL PUSH
news|ok|205||2026-05-08 20:45:00
news|ok|226||2026-04-24 15:48:18
...
```

---

## Escalation Required

**Issue:** Task 1892a cannot complete due to architectural blocker
- The `/api/push-news` route must be exposed in the API Gateway
- This is outside ops scope (code-level, gateway responsibility)
- VPS infrastructure is operational and ready; the server-side gateway is incomplete

**Required fix (for developer):**
1. Add `/api/push-*` route passthroughs to `apps/api-gateway/src/interface/handlers.ts`
2. Route POST `/api/push-news` → backend mcp-server:3000
3. Route POST `/api/push-prices`, `/api/push-sbv-rates`, `/api/push-tradingeconomics` similarly
4. Test: `curl -X POST https://zenmidi.com/api/push-news -H "X-API-Key: <key>" -d '[...]'` should return 200

**Alternative:** If gateway exposure is not viable, document that VPS must use internal hostname (requires network restructuring, not recommended)

---

## Commit Status

- Worktree: agent-a86faa89fd87e2fea (clean, ready)
- VPS deployment: redone at 2026-05-12T06:31 UTC
- Next step: Await developer fix of gateway routing, then re-test AC-3/4

