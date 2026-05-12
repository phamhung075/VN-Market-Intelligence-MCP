> Parent: [ops-incident-response.md](./ops-incident-response.md)

<!-- size-justification: 181L — split child of ops-incident-response.md; further decomposition would fragment paired Purple/Red playbooks (each playbook is a single atomic decision tree: trigger → action → rollback). Within-playbook splits break operator's eye-trace during incident response. -->

# P1 Critical Incidents

**Severity:** Purple (data risk) + Red (multi-service down)

---

## Playbook 3: Database Corruption / WAL Bloat (Purple)

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

## Playbook 4: Multiple Services Down (Cascade Failure) (Red)

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
