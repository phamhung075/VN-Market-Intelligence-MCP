# TASK 1958-watchdog-1 — Pre-Flight Disk Check Before Docker Compose Up

**Status:** BACKLOG
**Assigned to:** ops
**Priority:** HIGH / Size: S
**Zone:** ops / scripts
**Estimate:** 1h
**Depends on:** 1958-disk-relief (baseline ≥15GB free must be established first)

---

## Context

RCA for task 1958-rca identified disk pressure (97% full) as the trigger for the recovery-hang. To prevent recurrence, add a pre-flight validation step that fails fast if free disk is insufficient.

This task implements a simple bash script that checks free disk before `docker compose up -d` is invoked, preventing silent deployment failures under disk pressure.

---

## Acceptance Criteria

1. **Script created and executable**
   - File: `scripts/preflight-disk.sh` (or equivalent location)
   - Shebang: `#!/bin/bash`
   - Makes request: `df /app/data | tail -1 | awk '{print $4}'` (free blocks in 1K-blocks)
   - Threshold: exit 1 (error) if free < 15GB (15*1024*1024 KB = 15728640 KB in 1K-blocks)
   - Exit 0 (success) if free ≥ 15GB

2. **Manual test — low disk scenario**
   - Artificially lower disk threshold (e.g., test value 20GB) or simulate
   - Verify script exits 1 with stderr message: `"ERROR: Docker disk <15GB free, cannot start. Run disk-relief task."`

3. **Manual test — healthy disk scenario**
   - Run script on current system (post-1958-disk-relief, free ≥ 15GB)
   - Verify script exits 0 with stdout message: `"OK: Docker disk $(free_gb)GB free, safe to proceed."`

4. **Documentation added to deployment runbook**
   - File: `docs/protocols/docker-deployment-runbook.md` (create if missing)
   - Section: `## Pre-Flight Checks` or `## Prerequisites`
   - Text: "Before running `docker compose up -d`, execute `scripts/preflight-disk.sh`. If it exits 1, run task 1958-disk-relief to free space. Do not proceed with compose up until preflight passes."

5. **Integrated into standard restart procedures**
   - If ops uses a documented startup script or checklist, add preflight step as mandatory first item
   - Target: zero unplanned failures due to disk exhaustion during future container restarts

---

## Work Items

### 1. Create script (20 min)

File: `scripts/preflight-disk.sh`

```bash
#!/bin/bash
set -e

THRESHOLD_GB=15
THRESHOLD_KB=$((THRESHOLD_GB * 1024 * 1024))

FREE_KB=$(df /app/data | tail -1 | awk '{print $4}')
FREE_GB=$((FREE_KB / 1024 / 1024))

if [ "$FREE_KB" -lt "$THRESHOLD_KB" ]; then
  echo "ERROR: Docker disk <15GB free, cannot start. Run disk-relief task." >&2
  echo "Current free: ${FREE_GB}GB (threshold: ${THRESHOLD_GB}GB)" >&2
  exit 1
fi

echo "OK: Docker disk ${FREE_GB}GB free, safe to proceed."
exit 0
```

### 2. Make executable

```bash
chmod +x scripts/preflight-disk.sh
```

### 3. Document in runbook (20 min)

Create/edit `docs/protocols/docker-deployment-runbook.md`:

```markdown
## Pre-Flight Checks

Before deploying containers with `docker compose up -d`:

1. **Disk space validation** — run `scripts/preflight-disk.sh`
   - Requires ≥15GB free on `/app/data` partition
   - If fails: execute task `1958-disk-relief` before retrying

2. (future: other checks)
```

### 4. Manual test (20 min)

```bash
# Test 1: healthy disk (post-relief)
./scripts/preflight-disk.sh
# Expected: exit 0, message "OK: Docker disk XGB free, safe to proceed."

# Test 2: simulate low disk (optional, requires disk manipulation)
# Can create test version with lower threshold for validation
```

---

## Verification Steps

- [ ] Script exists: `scripts/preflight-disk.sh`
- [ ] Script is executable (`ls -la scripts/preflight-disk.sh` shows `rwxr-xr-x`)
- [ ] Script runs on healthy disk (post-1958-disk-relief): exits 0, message OK
- [ ] Runbook document created with pre-flight section
- [ ] Pre-flight step documented as mandatory before `docker compose up -d`

---

## Success Criteria

- Pre-flight script operational; returns exit 0 on healthy disk, exit 1 on <15GB
- Script output clear to operators (OK vs ERROR message)
- Runbook mentions script + links task 1958-disk-relief as remedy
- Script prevents silent disk-exhaustion failures in future restarts

---

## Files Modified / Created

- `scripts/preflight-disk.sh` — new, executable bash script
- `docs/protocols/docker-deployment-runbook.md` — new or appended with pre-flight section

---

## Notes

- **Simple design:** script is ~10 lines, no external dependencies (uses standard df + awk)
- **Integration point:** can be called manually by ops, or wired into CI/CD if applicable (e.g., pre-deploy step)
- **Threshold (15GB):** matches 1958-disk-relief AC target. May be tuned based on observed growth pattern.
- **Future:** once 1958-watchdog-4 (LanceDB compaction cron) ships, this pre-flight check should become less critical (disk maintained automatically). Until then, manual execution recommended pre-deploy.

---

## Acceptance Sign-Off

Ops must confirm: (1) script created + executable, (2) runbook updated, (3) manual test PASS on healthy disk, (4) integration point identified for future CI/CD if applicable.
