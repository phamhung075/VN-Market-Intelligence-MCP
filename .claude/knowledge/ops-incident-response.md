# Ops — Incident Response Playbook

**Load when:** Infrastructure incidents, service failures, escalations from Ops agent.

---

## Incident Classification

### Severity Levels

| Level | Response | Timeline |
|-------|----------|----------|
| **🟢 Green** | Baseline health check | 24h |
| **🟡 Yellow** | Degraded (1 service down, others OK) | 30 min |
| **🔴 Red** | Critical (>1 service down OR server down) | 5 min |
| **🟣 Purple** | Data risk (DB corruption, WAL >1GB) | Immediate |

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

## Playbook 2: Docker Microservices Down

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

## Playbook 3: Database Corruption / WAL Bloat

**Symptoms:**
- `PRAGMA integrity_check` returns errors
- OR WAL file >500MB
- OR SQLite "database locked" errors in logs
- OR queries timeout

**Response Time:** Immediate

### Step 1: Check WAL Size

```bash
ls -lh ~/data/vn-market.db*
```

**Expected:**
- `vn-market.db` = 100-500MB
- `vn-market.db-wal` = <100MB (compressed)

**If WAL >500MB:** Too many pending transactions

### Step 2: Force WAL Checkpoint

```bash
sqlite3 ~/data/vn-market.db "PRAGMA wal_checkpoint(TRUNCATE)"
```

**Expected output:**
```
3|0|0
```

(3 = pages written, 0 = pages in WAL, 0 = callback invocations)

**Monitor size afterward:**
```bash
ls -lh ~/data/vn-market.db-wal
```

Should drop to <10MB within 10s.

### Step 3: Check for Corruption

```bash
sqlite3 ~/data/vn-market.db "PRAGMA integrity_check"
```

**Expected:** `ok`

**If error:**
```
UNIQUE constraint failed: market_prices...
```

This indicates data integrity issue. Requires manual recovery.

### Step 4: Verify Data Health

```bash
# Count records by table
sqlite3 ~/data/vn-market.db << 'EOF'
SELECT 'market_prices' as table_name, COUNT(*) as count FROM market_prices
UNION ALL
SELECT 'news', COUNT(*) FROM news
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts;
EOF
```

**Expected:** All counts >0

### Step 5: If Corruption Detected

**Escalate immediately to PM (human):**

```
🟣 CRITICAL: Database Corruption Detected

Error: PRAGMA integrity_check returned errors
Table affected: [table name]
Constraint: [constraint violated]

Data loss risk: HIGH

Awaiting human decision on recovery:
1. Restore from backup (if available)
2. Rebuild table from external source
3. Accept data loss and truncate table

Blocking further server operation until resolved.
```

---

## Playbook 4: Multiple Services Down (Cascade Failure)

**Symptoms:**
- 2+ VPS services inactive
- AND server still running
- Suggests common cause (network, VPS issue, deployment error)

**Response Time:** 5 min

### Step 1: Check VPS Connectivity

```bash
ssh root@$VINAHOST_IP "ping -c 3 8.8.8.8"
ssh root@$VINAHOST_IP "ip route"
```

**Expected:** Responses with low latency (<50ms)

**If timeout:** VPS network disconnected. Escalate to Vinahost support.

### Step 2: Check Disk Space on VPS

```bash
ssh root@$VINAHOST_IP "df -h /"
```

**Expected:** <85% used

**If >90%:** Disk full. Clean up logs:
```bash
ssh root@$VINAHOST_IP "journalctl --vacuum=100M"
```

### Step 3: Verify All Services Status

```bash
ssh root@$VINAHOST_IP "systemctl list-units --type=service vn-* --all"
```

### Step 4: Attempt Group Restart

```bash
ssh root@$VINAHOST_IP << 'EOF'
for service in vn-price-fetch vn-bctc-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow; do
  systemctl restart $service
  sleep 1
done
sleep 3
systemctl list-units --type=service vn-* --all
EOF
```

### Step 5: If All Still Down

**Escalate with full diagnostic:**

```
🟣 CRITICAL: Cascade Failure (All VPS Services Down)

Services affected: All 5
VPS connectivity: ✅ [confirmed reachable]
Disk space: ✅ [sufficient]
Network: ✅ [8.8.8.8 reachable]

Attempted recovery:
- Group restart via systemctl: FAILED
- All services still inactive

Root cause unknown. Requires manual investigation on VPS.

Escalating to human operator for:
1. SSH to VPS console
2. Check kernel logs: dmesg | tail -50
3. Review recent system changes
4. Consider full VPS restart if necessary
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

---

## Decision Matrix

```
                Service Down?  │  Server Down?  │  DB Issue?
────────────────────────────────────────────────────────────
VPS services    Playbook 1     │       No       │    No
Server process  No             │   Playbook 2   │    No
Multiple down   Playbook 4     │       No       │    No
DB corruption   No             │       No       │  Playbook 3
Deployment fail Playbook 5     │   Depends      │    No
────────────────────────────────────────────────────────────

→ If uncertain, start with Playbook 1 (quickest diagnosis)
→ If 2+ playbooks apply, handle highest severity first
→ Always escalate Purple (data risk) immediately
```

---

## Escalation Decision Tree

```
Is it Purple (data risk)?
├─ YES → ESCALATE TO HUMAN IMMEDIATELY
│        Send full diagnostic to WORK channel
│        Do NOT attempt recovery unless explicitly trained
└─ NO → Continue to Step 2

Can you reach the failing service/server via SSH/curl?
├─ NO → Network issue
│       └─ Check VPS connectivity
│          └─ If VPS unreachable → ESCALATE (network down)
└─ YES → Continue to Step 3

Does the service have logs?
├─ NO → Service not started (systemd issue)
│       └─ Attempt restart
│          └─ If fails 2x → ESCALATE
└─ YES → Read error message
         └─ Known pattern? → Apply fix
         └─ Unknown error? → ESCALATE with logs

Has the issue persisted for >10 min after attempted fix?
├─ YES → ESCALATE
│        "Attempted fix failed. Requires manual review."
└─ NO → Monitor and report to WORK
```
