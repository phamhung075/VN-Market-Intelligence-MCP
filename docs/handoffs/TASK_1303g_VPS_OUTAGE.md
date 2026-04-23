# OPS Runbook — Task 1303g: VPS All-Services Down

**Status:** READY_FOR_OPS
**Priority:** CRITICAL — ALL 5 VPS services unreachable since ~2026-04-22
**Impact:** Foreign flow stale, BCTC PDFs 0-byte, news missing, prices stale, SBV FX rates stale

## Root Cause

`vps_service_health` table shows all 5 services as `unreachable` since 2026-04-22:
```
vn-price-fetch    unreachable  Unable to connect
vn-bctc-fetch     unreachable  Unable to connect
vn-news-fetch     unreachable  Unable to connect
vn-sbv-fetch      unreachable  Unable to connect
vn-foreign-flow   unreachable  Unable to connect
```

After circuit breaker opened: `Circuit breaker "polymarket" is OPEN — call rejected to protect the system`

## Diagnostic Steps

| Step | Command | Expected |
|------|---------|----------|
| 1. SSH | `ssh root@$VINAHOST_IP` | Shell prompt |
| 2. Check all services | `/root/vps-status.sh` | See service states |
| 3. If no vps-status.sh | `systemctl status vn-price-fetch vn-bctc-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow` | All active |
| 4. Check disk | `df -h /` | >5GB free |
| 5. Check network | `curl -I https://finance.vietstock.vn/` | HTTP 200 |
| 6. Check memory | `free -h` | <90% used |
| 7. Check logs (price) | `journalctl -u vn-price-fetch -n 30` | Last errors |
| 8. Check logs (news) | `journalctl -u vn-news-fetch -n 30` | Last errors |

## Recovery

```bash
# Restart all 5 services
systemctl restart vn-price-fetch vn-bctc-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow

# Verify all active
systemctl status vn-price-fetch vn-bctc-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow

# Wait 90s then check push logs on MCP server
# Server-side: circuit breaker auto-resets when pushes succeed
```

## If VPS is completely down (server reboot)

```bash
# Connect to Vinahost control panel or use serial console
# After VPS up, services should auto-start via systemd enable
# If not: systemctl enable --now vn-price-fetch vn-bctc-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow
# Redeploy if systemd units missing: ./deploy-vinahost.sh
```

## Verification

After restart, within 5 minutes:
- `vps_service_health` shows `health_status = ok` for all 5 services
- `daily_ohlcv` gets new rows (price data flowing)
- Foreign flow circuit breaker resets to `closed`

## Reports resolved by this fix

#2598 (BCTC 0-byte), #2599 (foreign flow HALF-OPEN), #2604 (dev backlog note), #2607 (UNIQUE constraint — was already fixed, but circuit was half-open blocking pushes), #2606 (taAlertNotifier — depends on network/Telegram, not VPS), #2605/#2593 (Reuters/TE stale — VPS news service handles these)
