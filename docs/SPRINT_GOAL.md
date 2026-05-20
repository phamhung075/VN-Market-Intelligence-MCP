# Sprint 1959 Goal — WATCHDOG HARDENING BATCH (post-1958 stack outage)

**Status:** OPEN 2026-05-20T20:40Z | **Predecessor:** Sprint 1958 (incident response) CLOSED 2026-05-20T20:40Z | **Severity:** HIGH (preventive hardening — no live incident) | **Sign-off:** po-1958-close.json + po-1958-mid-checkpoint.json

---

## Sprint 1958 Close-Out (rolled into this file head)

| Task | Status | Commit / Signal |
|---|---|---|
| 1958-recovery | DONE 2026-05-20T20:06:31Z (ops, 11/11 UP, 4 min) | `e65849a1` · `docs/signals/ops-1958a-stack-recovered.json` |
| 1958-disk-relief | DONE 2026-05-20T20:31:26Z (ops, 26.5 GB reclaimed via `docker builder prune -a -f`, 32 GB free) | `e4a2df50` · `docs/signals/ops-1958-disk-relief.json` |
| 1958-rca (Phase 1) | DONE 2026-05-20T22:15Z (ops, recovery-hang root cause = disk 97% + RAG lifespan blocked on sentence-transformers + LanceDB 29 GB cold-load I/O) | `c8c2760c` · `docs/signals/ops-1958-rca.json` |
| 1958-rca-2 (Phase 2) | DONE 2026-05-20T22:45Z (ops, **KEY REFRAME:** 04:32Z–19:59Z was NOT an outage — staged deployment. All 5 hypotheses ruled out. No watchdog amendment needed.) | `26d8bd90` · `docs/signals/ops-1958-rca-2.json` |
| 1958-watchdog-2 | DONE 2026-05-20T20:36:19Z (dev-mcp-server, rag-service `start_period` 30s→60s, smoke PASS) | `76e5d1cd` · `docs/signals/dev-mcp-server-1958-watchdog-2.json` |

**Sprint 1958 verdict:** All in-flight tasks DONE. External validation: system-auditor T1 (commit `a50c08a3`) confirmed 11/11 UP + HEALTHY, prior CRITICAL `1958-A-01` flipped to RESOLVED, zero new anomalies. Sprint 1958 closes as INCIDENT RESPONSE COMPLETE. Remaining watchdogs (1, 3, 4, 5, 6) + new candidate watchdog-7 carry forward to Sprint 1959 below for cognitive separation.

**Why pivot 1958 → 1959 instead of accumulating watchdogs:** 1958 is "incident response" — recovery + RCA + first symmetric watchdog (RAG start_period). 1959 is "preventive hardening" — disciplined batch of remaining watchdogs without the incident pressure. Separate sprint = clean acceptance criteria + clear post-mortem boundary. User mental model: 1958 closed cleanly; 1959 = the follow-on hardening campaign.

---

## Sprint 1959 — Watchdog Hardening Batch

**Theme:** Convert the 1958 RCA + watchdog-2 audit findings into a structured backlog of disk-pressure + cold-start resilience improvements. Inherit 6 watchdogs from 1958-rca, add the watchdog-2 audit follow-up (flaresolverr), sequence to avoid re-creating the build-cache problem.

### Sprint Goal

(A) Land HIGH-priority watchdogs (pre-flight disk gate + symmetric flaresolverr fix) — they are XS/S effort and eliminate the next predictable failure mode. (B) Ship MEDIUM watchdogs (model pre-bake, disk-usage alert, LanceDB compaction) sequenced one-per-zone to respect WIP 2/2 + disk headroom. (C) Defer LOW watchdog-6 (async RAG lifespan) — heavier design work, blocked behind watchdog-3 stability.

### Tasks

| ID | Title | Priority/Size | Owner | Zone | Status | Depends |
|----|-------|---------------|-------|------|--------|---------|
| 1959-watchdog-1 | Pre-flight disk check before `docker compose up -d` (fail-fast if free < 15 GB) | HIGH / S | ops | ops/scripts | DISPATCH-NOW | — |
| 1959-watchdog-3 | Pre-bake sentence-transformers model in `apps/rag-service/Dockerfile` | MEDIUM / S | dev-rag-service | apps/rag-service/ | DISPATCH-NOW | 1958-disk-relief (DONE) |
| 1959-watchdog-7 | **NEW** — Bump `flaresolverr` healthcheck `start_period` 30s → 60s (symmetric to watchdog-2; Chromium cold-start same risk profile as RAG) | HIGH / XS | dev-mcp-server | apps/mcp-server/ (owns compose) | DISPATCH-NOW | — |
| 1959-watchdog-5 | Disk-usage alert cron (BUG Telegram when `/app/data/lancedb` > 20 GB) | MEDIUM / S | dev-mcp-server | apps/mcp-server/ | HOLD (queues after watchdog-7 frees dev-mcp-server slot) | — |
| 1959-watchdog-4 | LanceDB compaction / archival cron (reclaim disk weekly) | MEDIUM / M | dev-rag-service | apps/rag-service/ | HOLD (queues after watchdog-3 lands, ≥48 h soak) | watchdog-3 |
| 1959-watchdog-6 | Async-ify RAG lifespan handler (model load in thread pool) | LOW / M | dev-rag-service | apps/rag-service/ | HOLD (heaviest; gates on watchdog-3 + watchdog-4 both stable for 7 d) | watchdog-3, watchdog-4 |

### Acceptance Criteria (sprint-level)

- **AC-1 (watchdog-1):** Bash pre-flight script `scripts/preflight-disk.sh` exists + executable; manual test exits 1 on simulated low-disk, 0 on healthy; documented in `docs/protocols/docker-deployment-runbook.md`.
- **AC-2 (watchdog-7):** `docker-compose.yml` `flaresolverr.healthcheck.start_period` = 60s; deployed via rolling restart; smoke shows Chromium boot < 60 s consistently across 3 consecutive restarts.
- **AC-3 (watchdog-3):** `apps/rag-service/Dockerfile` includes `RUN` step downloading the embedding model into image layer; rebuilt image grows ~400 MB; cold-start no longer hits HuggingFace network; rag-service `start_period` actual usage < 30 s (effectively reverts the 30→60 bump headroom but doesn't reduce it).
- **AC-4 (watchdog-5):** Disk-usage cron registered in `cronConfig.ts`; first 12 ticks emit zero false-positive when usage < 20 GB; manual test (simulate > 20 GB) triggers BUG Telegram once with throttle.
- **AC-5 (watchdog-4):** LanceDB compaction cron registered (weekly Mon 02:00Z); `cron_job_runs` shows ≥ 1 successful tick within 7 d of merge; LanceDB `du -sh` ≤ 25 GB after first run.
- **AC-6 (watchdog-6):** RAG lifespan handler offloads model load to `asyncio.to_thread()`; cold-start API responds 200 within 5 s of container start (vs current ~30 s); unit + integration tests GREEN.
- **AC-7 (close):** All tasks DONE OR explicitly deferred with rationale + `po-1959-close.json` emitted + DASHBOARD ops section pruned of `1958-A-01` (RESOLVED → CLOSED), lesson encoded in MEMORY.md.

### Constraints / Boundary

- **WIP cap 2/2 dev-zone respected per zone.** Cycle 1 dispatch (DISPATCH-NOW): ops watchdog-1 (separate ops lane) + dev-mcp-server watchdog-7 (1 of 2 slots) + dev-rag-service watchdog-3 (1 of 2 slots). Cycle 2 (after any cycle-1 ships): dev-mcp-server watchdog-5 backfills freed slot; dev-rag-service watchdog-4 backfills freed slot. Cycle 3 (≥ 7 d soak after watchdog-3+4): watchdog-6.
- **Disk-pressure self-prevention.** Do NOT queue all watchdogs in parallel — that's how the 26 GB build-cache problem was created (one rebuild per task in flight = exponential image bloat). One image-modifying watchdog (watchdog-3) at a time. Verify free disk ≥ 15 GB before each rebuild.
- **No recurring-bug escalation.** 1958 was the FIRST stack outage of this class. 1959 is preventive, not reactive.
- **OBSERVE gates preserved unchanged:** OBSERVE-1953g (2026-05-21T02:30Z), OBSERVE-1957d (2026-05-23T07:05Z), OBSERVE-1955c (2026-05-25T01:30Z), OBSERVE-1955d (2026-05-20T09:00Z), OBSERVE-1951d-verify (2026-05-21T08:30Z), OBSERVE-1907a-verify (2026-05-24T14:30Z), post-1945-verdict-resolution-scored-pct + post-1945-bug-storm-silence (2026-05-20T07:22Z, already past — read at next ops cycle), 1941b-signal-outcomes-seed-window (2026-05-25), 1922g-pharma-events-source-verify (2026-06-01). None touch watchdog scope.
- **Backlog "idle" reconciliation.** User-prompt note listed 1954a/1955a/1955b as idle backlog candidates — all three are already DONE per `docs/TASKS.md` Done section (1954a `2a5cc2a7`, 1955a `8b23795a`, 1955b `aaa4a06d`). No new backlog to pick up this cycle.

### Dispatch Slate — Cycle 1 (this PO cycle)

```
DISPATCH SLATE (Sprint 1959 cycle-1):
  - ops               → 1959-watchdog-1   (S, pre-flight disk script)
  - dev-mcp-server    → 1959-watchdog-7   (XS, flaresolverr start_period 30→60)
  - dev-rag-service   → 1959-watchdog-3   (S, pre-bake embedding model in Dockerfile)

HOLD (cycle-2 candidates, queue once cycle-1 freed slot):
  - dev-mcp-server    → 1959-watchdog-5   (after watchdog-7 ships)
  - dev-rag-service   → 1959-watchdog-4   (after watchdog-3 ships + 48 h soak)

DEEP HOLD (cycle-3):
  - dev-rag-service   → 1959-watchdog-6   (after watchdog-3 + watchdog-4 stable 7 d)

RATIONALE:
  1. Disk currently healthy (32 GB free). Don't queue all 5 image-modifying watchdogs at once — that's how the 26 GB build-cache problem started.
  2. WIP cap 2/2 dev-zone respected per zone (1 per zone in cycle-1).
  3. ops lane separate from dev-zone, so watchdog-1 (ops/scripts) can ride alongside the dev pair without contention.
  4. watchdog-7 is symmetric trivial XS edit to watchdog-2 — same risk profile (Chromium cold-start under disk pressure), same fix, same dev-mcp-server zone. No new design needed.
  5. watchdog-3 (pre-bake model) eats ~400 MB image layer — disk-relief (32 GB headroom) makes this safe NOW; deferring further only risks disk slipping back under 15 GB.
```

### Hypothesis Bench — Watchdog Adequacy Question

The 1958-rca-2 verdict ("not an outage, normal staged deployment") removed the original hypothesis bench (5 outage scenarios). The remaining open hypothesis for 1959 is:

> **H-1959-1:** Pre-flight disk check (watchdog-1) + symmetric start_period bumps (watchdog-2 DONE, watchdog-7) + pre-baked model (watchdog-3) together eliminate ≥ 90 % of the 1958-class cold-start hang surface area. Disk-usage alert (watchdog-5) + LanceDB compaction (watchdog-4) protect the input precondition (free disk). watchdog-6 (async lifespan) addresses the residual case where the model is in image but I/O contention still blocks the FastAPI event loop.

If H-1959-1 holds, sprint 1959 closes cleanly. If a 2nd outage hits with the same fingerprint (cold-start hang) during the sprint, PO escalates to architect for structural rethink (potential RAG service redesign).

---

## Next

- 7 task rows in `docs/TASKS.md` Backlog (6 watchdog + 1 close-row).
- Signals emitted: `docs/signals/po-1958-mid-checkpoint.json` (dispatch slate + close signal combined).
- DASHBOARD ops section to be pruned of 1958-* DONE rows next ops cycle.
- Sprint 1959 self-closes once all ACs verified OR explicit defer-with-rationale documented.
