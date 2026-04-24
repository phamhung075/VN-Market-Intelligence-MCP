# OPS Runbook — Task 2599: Foreign Flow Circuit HALF-OPEN

**Status:** READY_FOR_OPS
**Priority:** HIGH — 63 failures, circuit HALF-OPEN
**Service:** `vn-foreign-flow.service` on Vinahost VPS
**Root cause:** VPS service down/unresponsive. Circuit breaker logic correct.

---

## Runbook

| Step | Command | Expected |
|------|---------|----------|
| 1. SSH to VPS | `ssh root@$VINAHOST_IP` | Shell prompt |
| 2. Check status | `systemctl status vn-foreign-flow.service` | Active/inactive/failed state |
| 3. Check errors | `journalctl -u vn-foreign-flow.service -n 50` | Last 50 log lines |
| 4. Restart if failed | `systemctl restart vn-foreign-flow.service` | No error output |
| 5. Verify restart | `systemctl status vn-foreign-flow.service` | `Active: active (running)` |
| 6. Smoke test | `/root/test-foreign-flow.sh` (if exists) OR trigger manual fetch | HTTP 200, non-empty payload |
| 7. Monitor 5 min | `watch -n 5 'systemctl status vn-foreign-flow.service'` | Stays `active (running)` |

## Circuit breaker recovery

After VPS service confirmed healthy, circuit will auto-close on next successful probe (half-open -> closed). No code change needed.

## Escalation

If service restarts but fails again within 5 min:
- Check if upstream source (cafef.vn or equivalent) is blocking VPS IP
- Check rate limit / IP ban: `journalctl -u vn-foreign-flow.service -n 200 | grep -i "403\|429\|banned\|blocked"`
- If IP banned: route through alternate proxy or update User-Agent in fetch script
- Escalate to Architect if source URL has changed

## Success criteria

- `vn-foreign-flow.service` status = `active (running)` for 5+ min
- Circuit breaker transitions from HALF-OPEN to CLOSED (visible in server logs)
- Foreign flow data appearing in MCP tool responses
