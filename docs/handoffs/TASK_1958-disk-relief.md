# TASK 1958-disk-relief — IMMEDIATE Disk-Space Recovery

**Status:** IN PROGRESS (dispatched in parallel with watchdog work)
**Assigned to:** ops
**Priority:** HIGH / Size: S
**Zone:** ops
**Estimate:** 30m
**Depends on:** —
**Blocks:** 1958-watchdog-1, 1958-watchdog-3

---

## Context

Docker VM disk is at 97% capacity (30GB app data). This is the primary cause of the recovery-hang RCA (task 1958-rca). LanceDB vector database dominates storage (29GB); models (922MB), logs (162MB), PDFs (134MB total) are secondary.

This task performs immediate relief to restore at least 15GB free space, enabling:
- Safe deployment of 1958-watchdog-3 (pre-baking 400MB sentence-transformers model into image)
- Safe scaling of LanceDB if PDF extraction continues
- Breathing room for normal log rotation

---

## Acceptance Criteria

1. **Disk free space restored to ≥15GB** (measured via `df /app/data`)
   - If unable to reach 15GB through relief measures, document bottleneck + escalate to 1958-watchdog-4 (compaction job design)
   - Minimum acceptable: ≥12GB free (sufficient for watchdog-3 image pre-bake + log rotation)

2. **No service disruption**
   - Services remain running throughout relief actions
   - No unexpected container restarts triggered
   - Health endpoints remain responsive (target <5min latency)

3. **Next `docker compose up -d` succeeds without disk-pressure symptoms**
   - Cold-start of all 11 services completes healthily
   - RAG service healthcheck no longer times out on startup
   - Recovery time ≤4 min (matching baseline from 1958-recovery)

4. **Relief actions documented**
   - List of cleanup actions performed (image prune, log compression, LanceDB actions)
   - Disk usage breakdown before + after cleanup
   - Signal emitted: `docs/signals/ops-1958-disk-relief-complete.json`

---

## Work Items

### 1. Docker image prune (5 min)

```bash
# List orphaned images
docker image ls -a | grep none

# Prune all dangling + unused images
docker image prune -a --force

# Expected: reclaim 2–5GB (varies; depends on prior image builds)
```

### 2. Log compression + archival (10 min)

```bash
# Locate logs
find /app/data/logs/ -name "*.log" -type f -mtime +7 | head -20

# Compress old logs (>7 days old)
find /app/data/logs/ -name "*.log" -type f -mtime +7 -exec gzip {} \;

# Archive ancient logs (>30 days old)
find /app/data/logs/ -name "*.log.gz" -type f -mtime +30 -exec mv {} /tmp/archive/ \; 

# Rotate current logs (truncate if >100MB individually)
find /app/data/logs/ -name "*.log" -type f -size +100M -exec truncate -s 10M {} \;

# Expected: reclaim 1–3GB (depends on log volume since 2026-04-21)
```

### 3. LanceDB vacuum / compaction (10 min)

**Option A (if LanceDB API supports vacuum):**
```bash
# Check LanceDB docs for compaction / vacuum CLI or SDK method
# Rough estimate: 10–15% reclamation on cold storage
```

**Option B (if no native compaction):**
- Document as blocker for 1958-watchdog-4 (implement dedicated compaction job)
- Skip for this task; unblock watchdog-4 to design proper strategy

### 4. Verify disk freed (5 min)

```bash
df /app/data/
# Target: free ≥15GB
```

---

## Verification Steps

- [ ] `docker image prune -a --force` executed; output shows reclaimed bytes
- [ ] Log compression commands executed; `du -sh /app/data/logs/` shows reduction
- [ ] `df /app/data` confirms free ≥15GB (or ≥12GB minimum)
- [ ] `docker ps` shows all 11 services still Up (no unexpected restarts)
- [ ] Manual health check: curl `localhost:3000/health` (mcp-server), `localhost:3001/` (frontend) both 200
- [ ] Test: `docker compose up -d` succeeds without disk errors; all services healthy

---

## Success Criteria

- Free disk ≥15GB (`df /app/data` shows X GB available)
- No service downtime during relief actions
- `docker compose up -d` cold-start succeeds without disk-pressure hang
- Signal `docs/signals/ops-1958-disk-relief-complete.json` emitted with before/after metrics

---

## Files Modified / Created

- `/app/data/logs/` — compressed + archived old logs (in-place, no new file)
- Docker image layer — pruned (in-place, no persistent file change)
- Signal: `docs/signals/ops-1958-disk-relief-complete.json` — new

---

## Notes

- **Parallel execution:** This task runs in parallel with 1958-rca-2 + 1958-watchdog task creation. No ordering constraint.
- **HIGH priority:** Blocks watchdog-3 (pre-bake model requires image build space). Should complete within 1h of task assignment.
- **LanceDB compaction:** If vacuum not available in LanceDB SDK, defer detailed strategy to 1958-watchdog-4 (weekly/daily compaction cron). Document here as "pending 1958-watchdog-4 design".
- **Post-relief monitoring:** After deploy, watch `df /app/data` over 7 days. If disk refills >90% before 1958-watchdog-4 ships, escalate to architect for data retention policy redesign.

---

## Blockers / Unblocks

- **Blocks:** 1958-watchdog-1 (pre-flight disk check needs baseline), 1958-watchdog-3 (image build needs headroom)
- **Unblocked by:** none

---

## Acceptance Sign-Off

Tasks 1958-watchdog-1 and 1958-watchdog-3 may proceed only after this task confirms free space ≥15GB and `docker compose up -d` succeeds healthily.
