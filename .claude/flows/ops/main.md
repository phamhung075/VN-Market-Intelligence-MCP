# Ops — Main Flow

## Input
System alert, pipeline health check, or BUG channel report

## Output
Service restored | BUG channel report | WORK escalation if unresolvable

---

## Escalate Immediately (do not attempt)
- VPS SSH timeout × 3 → network partition
- `docker-compose down` fails + services stuck
- `PRAGMA integrity_check` fails → data loss risk
- Multiple Docker services in restart loop
- Disk > 95%

```
🚨 ESCALATION REQUIRED
Issue: [what failed] | Root cause: [diagnosis]
Attempted recovery: [tried] | Blocker: [why human needed]
```

## VPS Operations
```bash
ssh root@$VINAHOST_IP "/root/vps-status.sh"
ssh root@$VINAHOST_IP "systemctl status vn-price-fetch.service"
ssh root@$VINAHOST_IP "systemctl restart vn-price-fetch.service"
ssh root@$VINAHOST_IP "journalctl -u vn-price-fetch.service -n 50 --no-pager"
ssh root@$VINAHOST_IP "bash /root/fetch-prices.sh"
```

## VPS Debug Triggers (prefer over SSH)
```
trigger_bctc_vps_fetch(tickers=["FPT","VCB"], verbose=true, dry_run=false)
trigger_price_vps_fetch(tickers=["FPT","VCB"], verbose=true, dry_run=false)
trigger_news_vps_fetch(verbose=true, dry_run=false)
trigger_sbv_vps_fetch(verbose=true, dry_run=false)
trigger_foreign_flow_vps_fetch(verbose=true, dry_run=false)
```
Debug: `dry_run=true` first → check `failed[].reason` → `send_telegram(channel="bug")` → `log_fix(...)`

```
🔍 VPS DEBUG REPORT — <service> — <date>
Trigger: <what ran> | Queue: <pending/skipped/done>
Success: <tickers> | Failed: <ticker: reason>
Root cause: <diagnosis> | Fix: <recommendation>
```

## Docker
```bash
docker-compose ps
docker logs -f mcp-server --tail 100
cd $PROJECT_ROOT && docker-compose down && docker-compose up -d && sleep 5
curl http://localhost:3000/health
```
NEVER: `bun --hot` | `bun --watch` | `nodemon` | `pm2` | manual Bun restarts

## DB Health
```bash
ls -lh apps/mcp-server/data/db.sqlite*            # WAL < 10MB normal, >50MB = flag
sqlite3 apps/mcp-server/data/db.sqlite "PRAGMA integrity_check;"  # must = "ok"
```

## Incident Protocol
1. Diagnose — Docker/VPS/DB/network?
2. `send_telegram(channel="bug")`: "Investigating [issue]"
3. Attempt recovery per section above
4. Fails → Escalate
5. Document → append to incident log
6. **After successful recovery**: if a `telegram_reports` ID triggered this incident → `log_fix(title=..., related_feedback_id=ID, commit_hash="ops-recovery")` + `process_telegram_report(id=ID, delete_telegram_message=true)`
