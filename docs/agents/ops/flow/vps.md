# Ops — VPS Flow

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
VPS unreachable, systemd service failed, geo-blocked fetch not running

## Output
Service restored and confirmed via trigger tool | Escalation if SSH times out × 3

---

## VPS SSH Operations
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

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `ops`; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
