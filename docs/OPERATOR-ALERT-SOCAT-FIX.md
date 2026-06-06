# OPERATOR ALERT: VPS Socat Bridge Fragility Fix

**Date:** 2026-06-01  
**Status:** ✅ RESOLVED-SUPERSEDED (2026-06-06 11:30Z)  
**Urgency:** Archived (no action required — api-gateway now owns :4000)  

---

## Summary

The socat bridge band-aid (from 2026-06-01 recovery) is now **OBSOLETE and UNNECESSARY**:

- **api-gateway container** (restored 2026-06-06 11:14Z) owns port :4000 via Docker Compose publication
- **Public route zenmidi.com/api/*** returns 200 ✓ (routed by Cloudflare tunnel to mcp-server:3000 directly)
- **localhost:4000** is owned by Docker daemon (confirmed via `lsof`)
- **socat process** is DEAD (pgrep returns empty)
- **socat plist** never installed in ~/Library/LaunchAgents (not a reboot risk)

### Evidence (2026-06-06 11:30Z verification)

```bash
# Port ownership (Docker, not socat)
lsof -nP -iTCP:4000 -sTCP:LISTEN
→ com.docker (PID 36869, user admin)

# Process state
pgrep -fl socat
→ (empty — socat not running)

# Plist search
find ~/Library/LaunchAgents -name "*socat*"
→ (empty — no plist installed)
find /Library/LaunchDaemons -name "*socat*"
→ (empty — no plist installed)

# API endpoints healthy
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/orchestration
→ 200 ✓

curl -s -o /dev/null -w "%{http_code}" https://zenmidi.com/api/orchestration
→ 200 ✓

# Docker Compose restart policy
grep "restart:" docker-compose.yml | grep api-gateway
→ restart: unless-stopped ✓
```

---

## Root Cause (Original)

**Problem (2026-06-01):** Cloudflare tunnel routed `/api/*` → localhost:4000 (api-gateway not deployed) → 502 Bad Gateway → multi-hour VPS outage.

**Temporary Fix (2026-06-01):** socat band-aid bridged :4000 → :3000 (mcp-server) manually. Fragile — dies on reboot.

**Permanent Fix (2026-06-06):** api-gateway container restored. Now:
- Cloudflare tunnel route: `/api/*` → localhost:4000 (api-gateway Docker-published port)
- Docker compose: `ports: - 4000:4000`
- Restart policy: `restart: unless-stopped`
- Result: Reboot-safe, no process supervision needed

---

## Old Remediation (Archived, no action needed)

The original OPERATOR ALERT from 2026-06-01 documented a manual Cloudflare dashboard procedure to repoint `/api/*` → localhost:3000. That procedure is **NOT NECESSARY** — the api-gateway container now handles :4000 directly.

Socat plist (`launchd/com.vn-market.socat-bridge.plist`) is retained in repo **for rollback reference only**. It is NOT loaded in the live system.

---

## References

- Original diagnosis: `docs/protocols/vps-socat-cloudflare-fix-runbook.md`
- Architecture brief: `docs/architecture-briefs/2026-05-12-cloudflare-tunnel-api-routing.md`
- Recovery incident: `docs/agent-memory/notebooks/ops.md` § Session 2026-06-01 (Infrastructure Incident Recovery)

---

## Verification Checklist (Post-Fix)

- [x] api-gateway container owns :4000 via Docker Compose publication
- [x] socat process DEAD (pgrep -fl socat → empty)
- [x] socat plist NOT installed (not in ~/Library/LaunchAgents or /Library/LaunchDaemons)
- [x] localhost:4000 returns 200 (api-gateway healthy)
- [x] zenmidi.com/api/* returns 200 (Cloudflare tunnel + docker port alive)
- [x] api-gateway has restart: unless-stopped (reboot-safe)

**Status:** CLEAN — No further action required.
