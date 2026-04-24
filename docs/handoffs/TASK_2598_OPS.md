# OPS Runbook — Task 2598: BCTC PDF Zero-Byte (Fetch Service Down)

**Status:** READY_FOR_OPS
**Priority:** HIGH — PDFs downloading as 0 bytes, BCTC pipeline stalled
**Service:** `vn-bctc-fetch.service` on Vinahost VPS
**Root cause:** VPS service producing zero-byte PDFs (corrupt download or connection drop). Reparse layer correct — recovers once PDFs valid.

---

## Runbook

| Step | Command | Expected |
|------|---------|----------|
| 1. SSH to VPS | `ssh root@$VINAHOST_IP` | Shell prompt |
| 2. Check status | `systemctl status vn-bctc-fetch.service` | Active/inactive/failed state |
| 3. Check disk space | `df -h /root` | >10GB free — if not, clear old PDFs first |
| 4. Check errors | `journalctl -u vn-bctc-fetch.service -n 50` | Last 50 log lines |
| 5. Test portal access | `curl -I https://congbothongtin.ssc.gov.vn/` | HTTP 200 (run FROM VPS, not local) |
| 6. Restart if crashed | `systemctl restart vn-bctc-fetch.service` | No error output |
| 7. Verify restart | `systemctl status vn-bctc-fetch.service` | `Active: active (running)` |
| 8. Force next run | `/root/trigger-bctc-fetch.sh` (if exists) | Fetch job starts |
| 9. Verify PDF size | `ls -lh /root/bctc-pdfs/ \| tail -20` | Files >0 bytes |
| 10. Monitor | Check `docs/agent-memory/modules/tool-usage-stats.json` for new PDF entries (5 min window) | New entries appear |

## Disk space triage (if <10GB free)

```bash
# Find largest PDF dirs
du -sh /root/bctc-pdfs/*/ 2>/dev/null | sort -rh | head -20

# Remove zero-byte PDFs (safe to delete — will re-fetch)
find /root/bctc-pdfs/ -size 0 -delete

# Remove PDFs older than 90 days
find /root/bctc-pdfs/ -mtime +90 -name "*.pdf" -delete
```

## Portal access failure (step 5 returns non-200)

- Portal may be geo-restricting or under maintenance
- Check from second VPS or proxy if available
- Check VPS IP not banned: `curl -v https://congbothongtin.ssc.gov.vn/ 2>&1 | grep "< HTTP"`
- If 403/429: wait 30 min, retry with `User-Agent: Mozilla/5.0` header
- If persistent block: escalate to Architect for browser-fetch fallback via `vps-scripts/fetch-browser.py`

## Escalation

If service restarts but PDFs remain zero-byte:
- Portal may require session/cookie: switch to Playwright fetch (`vps-scripts/fetch-browser.py`)
- Check if URL patterns changed: `journalctl -u vn-bctc-fetch.service -n 200 | grep "url\|URL\|404\|redirect"`
- Escalate to Developer if URL schema changed at source

## Success criteria

- `vn-bctc-fetch.service` status = `active (running)`
- New PDFs on VPS are >0 bytes
- `tool-usage-stats.json` shows new BCTC entries within 5-min window
- Reparse layer picks up valid PDFs automatically (no code change needed)
