# TASK 1958-rca-2 — Investigation Gap: Docker Events + macOS Journal (04:32Z–19:59Z)

**Status:** BACKLOG
**Assigned to:** ops
**Priority:** MEDIUM / Size: S
**Zone:** ops investigation
**Estimate:** 1h
**Depends on:** — (independent; but execute soon — logs rotate within 24h window)

---

## Context

Sprint 1958 recovery-hang RCA (task 1958-rca, signal `docs/signals/ops-1958-rca.json`) explains only the 20:05:22Z hang (disk pressure + RAG lifespan handler blocked on model initialization). 

**Gap:** RCA timeline does NOT explain why 9 services were already DOWN at 19:59:48Z (system-auditor Tier-1 audit). The original outage window spans 04:32Z → 19:59Z (~15.5h), but we only understand the final 1.5 min (20:05:22Z → 20:06:31Z recovery hang).

This task investigates the missing outage-window gap.

---

## Acceptance Criteria

1. **Hypothesis enumeration complete** — all 5 items verified with commands:
   - **A)** macOS sleep / Docker Desktop pause + selective `restart:` policy (check `log show --predicate 'subsystem == "com.apple.kernel"' --last 24h` for sleep events; inspect docker-compose.yml `restart:` field per service)
   - **B)** Manual `docker compose down` / partial stop (check shell history + tmux/iterm scrollback if available)
   - **C)** Docker daemon restart event (check `~/Library/Containers/com.docker.docker/Data/log/host/dockerd.log` for restart events in 04:32Z–19:59Z window)
   - **D)** OOM / VM resource pressure (run `docker events --since 2026-05-20T04:30:00Z --until 2026-05-20T20:00:00Z | grep -iE 'oom|die'` or equivalent historical query)
   - **E)** VirtualMachine SHM tear / containerd state corruption (check for evidence in docker daemon logs or kernel logs)

2. **Single root cause identified OR explicit "unavailable" verdict**
   - If logs are accessible: identify which hypothesis is true, cite evidence, describe mechanism
   - If logs are inaccessible (rotated, not available): document explicit verdict "logs inaccessible within retention window, defer to 1954a pattern analysis" and WONTFIX

3. **Brief appended to architecture document**
   - Append to `docs/architecture-briefs/2026-05-20-stack-outage-rca.md` a new section `## Outage-Window Investigation (04:32Z–19:59Z)` with:
     - Hypothesis checklist results (each hypothesis: ruled out / confirmed / undecidable)
     - Root cause statement or "unavailable" verdict
     - Evidence snippets (command outputs, log excerpts)
     - Recommendation (e.g., "monitor restart-policy asymmetry in future deploys")

4. **Logs confirmed fresh (buffer rotation window <24h)**
   - Verify buffer timestamps in docker daemon log and macOS journal are within 24h of 2026-05-20T20:02Z (reconfirm audit)
   - If logs are stale, document rotation window

---

## Work Items

### 1. Collect evidence (10 min)

```bash
# A) macOS sleep events
log show --predicate 'subsystem == "com.apple.kernel"' --last 24h | grep -i sleep

# B) Docker daemon restart / events
tail -500 ~/Library/Containers/com.docker.docker/Data/log/host/dockerd.log | grep -iE 'shutdown|startup|restart' 
# Alternative: docker events --since 2026-05-20T04:30:00Z --until 2026-05-20T20:00:00Z (if available in current daemon session)

# C) OOM signals
docker events --since 2026-05-20T04:30:00Z --until 2026-05-20T20:00:00Z | grep -iE 'oom|die'

# D) Inspect docker-compose.yml restart policies
grep -A 5 "restart:" apps/mcp-server/docker-compose.yml | head -30
```

### 2. Analyze results (30 min)

For each hypothesis:
- If evidence found: conclude "confirmed" + cite evidence
- If evidence absent but policy suggests vulnerability: conclude "possible but no log evidence"
- If contradicted by evidence: conclude "ruled out"

### 3. Write brief append (20 min)

Append section to `docs/architecture-briefs/2026-05-20-stack-outage-rca.md` with findings + recommendation.

---

## Verification Steps

- [ ] Run all 5 hypothesis commands; capture output
- [ ] Document each hypothesis: confirmed / ruled out / undecidable
- [ ] Append brief section to architecture-briefs document
- [ ] Cross-check: if outage-window cause ≠ recovery-hang cause, document asymmetry
- [ ] OPTIONAL: if time permits, review `docker-compose.yml` restart policies to confirm mcp-server + frontend have `restart: unless-stopped` (likely survival mechanism under unexpected stop)

---

## Success Criteria

- Brief document appends explanation for 04:32Z–19:59Z gap
- One root cause identified OR explicit "unavailable" verdict with rationale
- Hypothesis verification complete + all commands executed successfully
- Recommendation for future hardening (e.g., standardized restart policies, better daemon logs retention)

---

## Files Modified

- `docs/architecture-briefs/2026-05-20-stack-outage-rca.md` — append `## Outage-Window Investigation` section

---

## Notes

- **Time sensitivity:** Docker events buffer and macOS journal both rotate within 24h. Execute ASAP.
- **Hypothesis A (restart-policy differential) is primary suspect** — mcp-server + frontend surviving while others fell suggests asymmetric `restart:` policy. If confirmed, recommend standardizing policy across all services (likely to `unless-stopped`).
- **Prerequisite for 1958-rca-2 closure:** brief document + decision record present. No code change required.
- **Next:** Once 1958-rca + 1958-rca-2 complete, sprint will have full RCA. Then 1958-watchdog hardening tasks (1958-watchdog-1 through -6) proceed from Backlog.
