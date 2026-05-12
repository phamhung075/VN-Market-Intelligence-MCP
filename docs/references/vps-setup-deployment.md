> Parent: [vps-setup.md](./vps-setup.md)

# VPS Deployment, Monitoring & Recovery

---

## Deployment

```bash
# From project root on local machine
./deploy-vinahost.sh
```

**What it does:**
1. Validates `.env` (VINAHOST_IP, VINAHOST_USER, VINAHOST_KEY)
2. SCP all `vps-scripts/*.sh` and `vps-scripts/fetch-browser.py` to VPS
3. SSH into VPS and reload all 5 systemd units
4. Verifies each service is enabled and started
5. Runs `/root/vps-status.sh` to confirm health

**If deployment fails:**
1. Check SSH connectivity: `ssh root@$VINAHOST_IP "hostname"`
2. Check `.env` path to SSH key: verify file exists and permissions (600)
3. Check VPS disk space: `ssh root@$VINAHOST_IP "df -h /"`
4. Read full error output and escalate to Ops Agent

---

## Monitoring & Alerts

### VPS Watchdog Job (Local)

`vpsProxyWatchdogJob.ts` (runs every 10 min during market hours):
- Checks `MAX(market_prices.updated_at)`
- If >15 min stale → sends ONE alert to WORK channel (30-min cooldown)
- **Does NOT SSH into VPS** (VPS liveness is systemd's job)

### Circuit Breaker

Each fetcher has a circuit breaker (`src/infrastructure/circuitBreaker.ts`):
- **Failure threshold:** 3 consecutive errors
- **Trip time:** 5 minutes
- **Reset:** Auto-recover after 5 min of successful requests

### Rate Limiter

VPS services respect per-domain rate limits (no more than 1 req/sec per endpoint):
```bash
# Check current rates on VPS
ssh root@$VINAHOST_IP "tail -50 /var/log/vps-rate-limiter.log"
```

---

## Troubleshooting Decision Tree

```
VPS Service Issue?
├─ Service status = inactive
│  └─ Run: systemctl restart vn-SERVICE-NAME
│     └─ Check logs: journalctl -u vn-SERVICE-NAME -n 50 --no-pager
├─ Service status = failed
│  └─ Service crashed. Read logs for error.
│     └─ If persistent → escalate with logs to Architect
├─ Service status = active
│  └─ Is data being pushed?
│     ├─ No → Check VPS network: ping 8.8.8.8
│     ├─ Intermittent → Check circuit breaker state
│     └─ Yes, but local server not receiving
│        └─ Check local health: curl http://localhost:3000/health
```

---

## Rollback / Disaster Recovery

### If VPS Service Broken After Deploy

```bash
# SSH to VPS
ssh root@$VINAHOST_IP

# Find previous version (if available)
ls -la /root/vps-scripts.bak/

# Restore previous
if [ -d /root/vps-scripts.bak ]; then
  rm -rf /root/vps-scripts
  mv /root/vps-scripts.bak /root/vps-scripts
  systemctl restart vn-price-fetch vn-news-fetch vn-sbv-fetch
fi

# Verify
/root/vps-status.sh
```

### If VPS Becomes Unreachable

1. Verify local network: Check if server can reach internet at all
2. Check VPS provider status: Vinahost dashboard
3. Try restarting from VPS provider console (if SSH fails)
4. Escalate to human operator with VPS access

---

## Cost Optimization

- **VPS cost:** ~$5/month (shared resource)
- **Bandwidth:** ~2GB/month (news + prices, well within limits)
- **Uptime target:** 99.5% (28.8 min downtime/month acceptable)

If service exceeds budget, offload non-critical fetches (pharma signals, legal risk) to fallback local methods.
