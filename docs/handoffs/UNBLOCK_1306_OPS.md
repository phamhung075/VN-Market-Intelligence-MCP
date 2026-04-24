# UNBLOCK 1306 — Ops Agent

**Date:** 2026-04-24
**From:** PO
**To:** Ops agent
**Reports:** #1274 (HOSE price stale 2h), #1281 (PDF download timeout x5)

## Problem 1: HOSE price stale 2h during market open (post-restart)

After server restart, HOSE prices become stale for ~2h during market open.

**Investigate:**
- Check `vn-price-fetch.service` on VPS — is it running and pushing to MCP server?
- Check VPS push log: `ssh root@$VINAHOST_IP journalctl -u vn-price-fetch.service --since "1 hour ago"`
- Verify MCP server `/health` endpoint shows price freshness < 5min
- If VPS service healthy but MCP server not receiving: check circuit breaker state for foreignFlow/price endpoints

**Expected:** Price data freshness < 2min during market hours (09:00–15:00 VN time).

## Problem 2: PDF downloads timing out locally (should route via VPS)

Report #1281: 5 consecutive PDF download timeouts from BCTC portal (congbothongtin.ssc.gov.vn).

**Root cause hypothesis:** `vn-bctc-fetch.service` on VPS may be down, OR the MCP server is attempting direct fetch from France (geo-blocked).

**Investigate:**
- Check `vn-bctc-fetch.service` status: `ssh root@$VINAHOST_IP systemctl status vn-bctc-fetch.service`
- Check VPS push log for BCTC: `ssh root@$VINAHOST_IP journalctl -u vn-bctc-fetch.service -n 50`
- Verify no direct HTTP calls to `congbothongtin.ssc.gov.vn` from France-side code

**Expected:** All BCTC PDF fetches route through VPS Vietnam only. Zero direct fetches from MCP server in France.

## Resolution

After investigation, post findings to WORK channel. If services need restart: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` for MCP server. VPS services: `ssh root@$VINAHOST_IP systemctl restart vn-bctc-fetch.service`.
