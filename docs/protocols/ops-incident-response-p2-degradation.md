> Parent: [ops-incident-response.md](./ops-incident-response.md)

<!-- size-justification: 268L — split child of ops-incident-response.md; carries 4 Yellow-severity playbooks (single-service, deployment-rollback, partial-data, slow-pipeline) that each chain trigger → diagnose → fix → verify. Splitting per-playbook would break the cross-playbook decision branch ("if symptom X, jump to playbook Y") that operators follow during incident triage. -->

# P2 Degradation & Recovery

**Severity:** Yellow (degraded — single service down or deployment issue)

---

## Playbook 1: Single VPS Service Down

**Symptoms:**
- `vn-price-fetch.service` inactive
- OR data not being pushed for >5 min
- OR Ops agent reports service failed

**Response Time:** 30 min

### Step 1: Verify Service Status

```bash
ssh root@$VINAHOST_IP "systemctl status vn-SERVICE-NAME"
```

**Expected output:**
```
● vn-price-fetch.service - VN Price Fetcher
   Loaded: loaded (/etc/systemd/system/vn-price-fetch.service; enabled; ...)
   Active: inactive (dead) since 2026-04-21 07:00:00 UTC; 5 min ago
   ...
```

### Step 2: Check Recent Errors

```bash
ssh root@$VINAHOST_IP "journalctl -u vn-SERVICE-NAME -n 100 --no-pager | tail -30"
```

**Common errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection timeout` | Network issue on VPS | Check `ping 8.8.8.8` on VPS |
| `503 Service Unavailable` | Target endpoint down (not ops issue) | Wait 10 min, retry |
| `ENOENT: no such file` | Script path missing | Re-run `./deploy-vinahost.sh` |
| `Exit code 1` | Unhandled exception in script | Read full stderr logs |

### Step 3: Attempt Restart

```bash
ssh root@$VINAHOST_IP "systemctl restart vn-SERVICE-NAME"
sleep 3
ssh root@$VINAHOST_IP "systemctl is-active vn-SERVICE-NAME"
```

**Expected:** `active`

**If still inactive:**
1. Check if systemd unit file exists: `systemctl cat vn-SERVICE-NAME`
2. Check script permissions: `ls -la /root/vps-scripts/fetch-*.sh`
3. Run script manually (for debugging): `bash /root/vps-scripts/fetch-prices.sh 2>&1 | head -50`

### Step 4: Verify Data Flow

**For price-fetch:**
```bash
# Check if prices recently updated
sqlite3 ~/data/vn-market.db "SELECT code, MAX(updated_at) FROM market_prices GROUP BY code ORDER BY MAX(updated_at) DESC LIMIT 5"
```

**Expected:** Recent timestamps (within 2 min)

**For news-fetch:**
```bash
# Check if news recently received
sqlite3 ~/data/vn-market.db "SELECT COUNT(*) as recent_items FROM news WHERE published_at > datetime('now', '-5 minutes')"
```

**Expected:** >0 items

### Step 5: Report Status

Send to WORK channel:

```
🟡 Service Recovered: vn-price-fetch

Status: active ✅
Timeline: Down for 12 min (07:00-07:12 UTC)
Root cause: Script path issue (resolved via redeploy)
Action taken: systemctl restart + manual verification
Data health: 245 prices updated in last 2 min ✅

No user impact (prices queued locally during outage).
```

---

## Playbook 2: Docker Microservices Down (Yellow)

**Symptoms:**
- `docker-compose ps` shows service(s) not "Up"
- OR `curl http://localhost:3000/health` fails
- OR Ops agent reports service unhealthy

**Response Time:** 5 min

### Step 1: Verify Docker Status

```bash
docker-compose ps
docker-compose ps mcp-server
```

**Expected:** All services showing "Up ... (healthy)"

**If not Up:** Service crashed or failed health check

### Step 2: Check Recent Errors

```bash
docker-compose logs mcp-server --tail 50
docker-compose logs -f  # All services
```

**Common crash reasons:**
- Database locked (WAL file stale)
- Out of memory (OOM)
- Port conflict (another process on 3000/5000/5001/etc)
- Bad config (missing .env variable)
- Circuit breaker open (external service down)

### Step 3: Restart Services

```bash
# ONLY allowed restart method
cd $PROJECT_ROOT
docker-compose down
docker-compose up -d
sleep 5
curl -s http://localhost:3000/health | jq .
```

**Expected response:**
```json
{
  "status": "ok",
  "tools": <N>,
  "jobs": <M>
}
```
(Current counts in `docs/data/project-stats.json`)

### Step 4: If Restart Fails

**Check what's preventing shutdown:**
```bash
docker-compose logs --tail 30
docker ps -a  # See all containers, even stopped ones
```

**If container won't start due to port conflict:**
```bash
lsof -i :3000
lsof -i :5000
# Kill the blocking process or remap port in docker-compose.yml
```

**If database locked:**
```bash
rm -f data/market.db-wal data/market.db-shm
docker-compose up -d
sleep 5
```

**Check logs for startup errors:**
```bash
docker-compose logs mcp-server --tail 50
```

### Step 5: Report Status

```
🔴 Services Recovered: Docker

Status: All 9 services up ✅
Downtime: 3 min (06:52-06:55 UTC)
Root cause: Database WAL lock (cleaned + restart)
Action: docker-compose down && up + WAL cleanup
Health: All MCP tools loaded, all cron jobs active ✅ (counts in `docs/data/project-stats.json`)

VPS services maintained local queues. No data lost.
```

---

## Playbook 5: Deployment Failure

**Symptoms:**
- `./deploy-vinahost.sh` fails midway
- OR services come up broken after deploy
- OR new version introduced regression

**Response Time:** 15 min (rollback priority)

### Step 1: Verify SSH Access

```bash
ssh root@$VINAHOST_IP "hostname"
```

If fails:
- Check `.env` VINAHOST_KEY path
- Check SSH permissions: `chmod 600 ~/.ssh/id_rsa`
- Check IP/hostname in `.env`

### Step 2: Attempt Deploy Again

```bash
./deploy-vinahost.sh 2>&1 | tee /tmp/deploy-log.txt
```

**Common errors:**

| Error | Fix |
|-------|-----|
| `Permission denied (publickey)` | SSH key not authorized on VPS |
| `No such file` | Script path wrong in deploy script |
| `SCP timeout` | Network slow, try again in 2 min |

### Step 3: If Deploy Persists Failing

**Check backup version:**
```bash
ssh root@$VINAHOST_IP "ls -la /root/vps-scripts.bak/"
```

**Restore previous version:**
```bash
ssh root@$VINAHOST_IP << 'EOF'
if [ -d /root/vps-scripts.bak ]; then
  rm -rf /root/vps-scripts
  mv /root/vps-scripts.bak /root/vps-scripts
  systemctl restart vn-price-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow vn-bctc-fetch
fi
EOF
```

### Step 4: Verify Rollback

```bash
ssh root@$VINAHOST_IP "/root/vps-status.sh"
```

### Step 5: Report

```
⚠️ Deployment Rolled Back

Attempted version: [commit hash]
Failure point: [which service failed]
Root cause: [error from logs]
Recovery: Restored previous version
Status: ✅ All services active and healthy

Next action: Investigate code issue before re-deploying.
```
