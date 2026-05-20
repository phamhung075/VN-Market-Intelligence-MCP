# TASK 1959-watchdog-1 — Pre-flight disk check script

**Sprint:** 1959 (Watchdog Hardening Batch)
**Owner:** ops
**Zone:** `scripts/` (cross-service root tooling)
**Priority/Size:** HIGH / S
**Estimate:** 1 h
**Depends:** —
**Spawned by:** PO c223 2026-05-20T20:40Z (signal `docs/signals/po-1958-mid-checkpoint.json`)

## Origin

Recommended by 1958-rca (signal `docs/signals/ops-1958-rca.json`) as `1958-watchdog-1`. Carried forward to Sprint 1959 with renumber. The 1958 stack-outage RCA identified disk pressure (97% full) as the proximate cause of the RAG cold-start hang. A pre-flight script that aborts `docker compose up -d` when free disk < 15 GB prevents reproduction.

## Work

1. Create `scripts/preflight-disk.sh`:
   ```bash
   #!/usr/bin/env bash
   # Pre-flight disk check before docker compose up -d
   # Fails fast if free disk < 15 GB to prevent cold-start hang under disk pressure (1958 RCA).
   set -euo pipefail
   THRESHOLD_GB=15
   FREE_GB=$(df -BG /var/lib/docker 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G' || df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
   if [ "$FREE_GB" -lt "$THRESHOLD_GB" ]; then
     echo "ERROR: Docker disk has ${FREE_GB}GB free, need ≥${THRESHOLD_GB}GB. Run disk-relief: docker builder prune -a -f && docker image prune -a -f" >&2
     exit 1
   fi
   echo "OK: Docker disk has ${FREE_GB}GB free (≥${THRESHOLD_GB}GB threshold)."
   ```
2. `chmod +x scripts/preflight-disk.sh`.
3. Manual test:
   - Healthy: run script on current system (32 GB free). Expect exit 0 + OK message.
   - Low-disk simulation: override with `THRESHOLD_GB=100` env or temporary high threshold. Expect exit 1 + ERROR message.
4. Document in `docs/protocols/docker-deployment-runbook.md` — add a "Pre-flight" section at top with the script path and the rationale (link to `docs/signals/ops-1958-rca.json`).
5. Emit signal `docs/signals/ops-1959-watchdog-1.json` with status DONE + commit hash.

## Acceptance Criteria

- **AC-1:** `scripts/preflight-disk.sh` exists and is executable (`ls -l` shows `x` bits).
- **AC-2:** Manual healthy test: script exits 0 + prints OK message.
- **AC-3:** Manual low-disk test (threshold override): script exits 1 + prints ERROR message with disk-relief hint.
- **AC-4:** `docs/protocols/docker-deployment-runbook.md` includes a Pre-flight section referencing the script + 1958-rca rationale.
- **AC-5:** Signal emitted with commit hash; LITE commit subject: `feat(ops/1959-watchdog-1): pre-flight disk check script for docker compose up`.

## Boundary

- Script is advisory pre-flight — NOT wired into automated CI gates this cycle (out of scope; ops decides when to enforce).
- Do NOT modify `docker-compose.yml` here (that's watchdog-7 + watchdog-2 territory).
- Document in protocol only; runbook integration is enough.

## Related

- Origin: `docs/signals/ops-1958-rca.json` § recommendations.watchdog-1
- Predecessor disk-relief: `docs/signals/ops-1958-disk-relief.json` (32 GB free achieved)
- Sprint goal: `docs/SPRINT_GOAL.md` (Sprint 1959)
- Mid-checkpoint signal: `docs/signals/po-1958-mid-checkpoint.json`
