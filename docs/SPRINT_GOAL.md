# Sprint 1959 Goal — WATCHDOG HARDENING BATCH (post-1958 stack outage)

**Status:** OPEN — cycle-2 dispatch 2026-05-20T21:05Z | **Predecessor:** Sprint 1958 (incident response) CLOSED 2026-05-20T20:40Z | **Severity:** HIGH (preventive hardening — no live incident) | **Sign-off:** po-1958-close.json + po-1958-mid-checkpoint.json + po-1959-cycle-2.json

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
| 1959-watchdog-1 | Pre-flight disk check before `docker compose up -d` (fail-fast if free < 15 GB) | HIGH / S | ops | ops/scripts | **DONE 2026-05-20** (commit `784905da`) | — |
| 1959-watchdog-3 | Pre-bake sentence-transformers model in `apps/rag-service/Dockerfile` | MEDIUM / S | dev-rag-service | apps/rag-service/ | **DONE 2026-05-20T21:01Z** (commit `66255410`; +920 MB image; cold-start 11–16 s; zero HF fetch) | 1958-disk-relief (DONE) |
| 1959-watchdog-7 | Bump `flaresolverr` healthcheck `start_period` 30s → 60s (symmetric to watchdog-2; Chromium cold-start same risk profile as RAG) | HIGH / XS | dev-mcp-server | apps/mcp-server/ (owns compose) | **DONE 2026-05-20T22:50Z** (commit `fd292896`; 3-of-3 restart smoke 11/13/11 s) | — |
| 1959-watchdog-5 | Disk-usage alert cron (BUG Telegram when `/app/data/lancedb` > 20 GB) | MEDIUM / S | dev-mcp-server | apps/mcp-server/ | **DISPATCH-NOW** (cycle-2; dev-mcp-server slot free post-watchdog-7) | — |
| 1959-watchdog-8 | **NEW cycle-2** — Named-volume shadow audit (read-only): scan all `market_data`-mounted services for Dockerfile assets baked under `/app/data/*` that would be silently shadowed. Audit only — no edits. Triggered by watchdog-3 side discovery. | LOW / S | architect | multi (read-only scan; no rebuild) | **DISPATCH-NOW** (cycle-2; no image-rebuild contention) | — |
| 1959-watchdog-4 | LanceDB compaction / archival cron (reclaim disk weekly) | MEDIUM / M | dev-rag-service | apps/rag-service/ | HOLD (unlock 2026-05-22T21:00Z — 48 h post-watchdog-3 ship) | watchdog-3 |
| 1959-watchdog-6 | Async-ify RAG lifespan handler (model load in thread pool) | LOW / M | dev-rag-service | apps/rag-service/ | DEEP HOLD (gates on watchdog-3 + watchdog-4 both stable 7 d) | watchdog-3, watchdog-4 |

### Acceptance Criteria (sprint-level)

- **AC-1 (watchdog-1):** PASS — `scripts/preflight-disk.sh` exists, executable, tested healthy + threshold-override, documented in `docs/protocols/docker-deployment-runbook.md`. Commit `784905da`.
- **AC-2 (watchdog-7):** PASS — `docker-compose.yml` `flaresolverr.healthcheck.start_period` = 60 s; 3-of-3 restart smoke PASS (11/13/11 s); API status=ok. Commit `fd292896`.
- **AC-3 (watchdog-3):** PASS — `apps/rag-service/Dockerfile` bakes model into `/opt/model-cache` (outside named-volume shadow); image +920 MB; cold-start 11–16 s; zero HF fetches (`HF_HUB_OFFLINE=1`). Commit `66255410`.
- **AC-4 (watchdog-5):** PENDING — disk-usage cron registered in `cronConfig.ts`; first 12 ticks emit zero false positives when usage < 20 GB; manual over-threshold simulation triggers exactly one BUG Telegram with 6 h throttle. Dispatch this cycle.
- **AC-5 (watchdog-4):** PENDING — LanceDB compaction cron registered (weekly Mon 02:00Z); `cron_job_runs` ≥ 1 success within 7 d; LanceDB `du -sh` ≤ 25 GB after first run. Gates until 2026-05-22T21:00Z (48 h post-watchdog-3).
- **AC-6 (watchdog-6):** DEEP HOLD — RAG lifespan offloaded to `asyncio.to_thread()`; cold-start API 200 within 5 s. Gates on watchdog-3 + watchdog-4 stable for 7 d.
- **AC-8 (watchdog-8 NEW):** PENDING — `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md` exists; every `market_data`-mounted service inventoried; verdict line declares N CONFIRMED SHADOW(S) + recommendation. Dispatch this cycle.
- **AC-7 (close):** All tasks DONE OR explicitly deferred with rationale + `po-1959-close.json` emitted + DASHBOARD ops section pruned of `1958-A-01` (RESOLVED → CLOSED), lesson encoded in MEMORY.md.

### Constraints / Boundary

- **WIP cap 2/2 dev-zone respected per zone.** Cycle 1 dispatch (DISPATCH-NOW): ops watchdog-1 (separate ops lane) + dev-mcp-server watchdog-7 (1 of 2 slots) + dev-rag-service watchdog-3 (1 of 2 slots). Cycle 2 (after any cycle-1 ships): dev-mcp-server watchdog-5 backfills freed slot; dev-rag-service watchdog-4 backfills freed slot. Cycle 3 (≥ 7 d soak after watchdog-3+4): watchdog-6.
- **Disk-pressure self-prevention.** Do NOT queue all watchdogs in parallel — that's how the 26 GB build-cache problem was created (one rebuild per task in flight = exponential image bloat). One image-modifying watchdog (watchdog-3) at a time. Verify free disk ≥ 15 GB before each rebuild.
- **No recurring-bug escalation.** 1958 was the FIRST stack outage of this class. 1959 is preventive, not reactive.
- **OBSERVE gates preserved unchanged:** OBSERVE-1953g (2026-05-21T02:30Z), OBSERVE-1957d (2026-05-23T07:05Z), OBSERVE-1955c (2026-05-25T01:30Z), OBSERVE-1955d (2026-05-20T09:00Z), OBSERVE-1951d-verify (2026-05-21T08:30Z), OBSERVE-1907a-verify (2026-05-24T14:30Z), post-1945-verdict-resolution-scored-pct + post-1945-bug-storm-silence (2026-05-20T07:22Z, already past — read at next ops cycle), 1941b-signal-outcomes-seed-window (2026-05-25), 1922g-pharma-events-source-verify (2026-06-01). None touch watchdog scope.
- **Backlog "idle" reconciliation.** User-prompt note listed 1954a/1955a/1955b as idle backlog candidates — all three are already DONE per `docs/TASKS.md` Done section (1954a `2a5cc2a7`, 1955a `8b23795a`, 1955b `aaa4a06d`). No new backlog to pick up this cycle.

### Dispatch Slate — Cycle 1 (SHIPPED)

```
SHIPPED (Sprint 1959 cycle-1, all 3 ACs verified):
  - ops               → 1959-watchdog-1   DONE 2026-05-20  commit 784905da
  - dev-mcp-server    → 1959-watchdog-7   DONE 2026-05-20T22:50Z  commit fd292896
  - dev-rag-service   → 1959-watchdog-3   DONE 2026-05-20T21:01Z  commit 66255410 (+920 MB image; named-volume shadow finding flagged)
```

### Dispatch Slate — Cycle 2 (this PO cycle, 2026-05-20T21:05Z)

```
DISPATCH SLATE (Sprint 1959 cycle-2):
  - dev-mcp-server    → 1959-watchdog-5   (S, disk-usage alert cron — slot free post-watchdog-7)
  - architect         → 1959-watchdog-8   (S, named-volume shadow audit — read-only, no rebuild)

HOLD (cycle-3 candidate):
  - dev-rag-service   → 1959-watchdog-4   (unlock 2026-05-22T21:00Z — 48 h soak post-watchdog-3)

DEEP HOLD (cycle-4):
  - dev-rag-service   → 1959-watchdog-6   (after watchdog-3 + watchdog-4 stable 7 d)

RATIONALE:
  1. Disk still healthy (32 GB free); watchdog-3 baked +920 MB but no further image rebuilds queue this cycle (watchdog-5 is pure TS code, watchdog-8 is read-only scan). Safe.
  2. WIP cap 2/2 dev-zone respected: dev-mcp-server has 1 slot used (watchdog-5), dev-rag-service has 0 (watchdog-4 gated 48 h), ops has 0 (watchdog-1 DONE).
  3. watchdog-8 routes to architect (system-design audit, not dev). Separate lane from dev-mcp-server, so no zone contention with watchdog-5.
  4. watchdog-8 SCOPE RATIONALE: watchdog-3's named-volume shadow finding is a class of failure (any service baking assets at /app/data/* with market_data mount is silently shadowed). The remediation pattern is known (move to /opt/<name>-cache + update env). The unknown is HOW MANY services share the trap. Audit first → triage → next-sprint fix-list if needed. Audit-only keeps it LOW priority + sprint-scope-minimal.
  5. watchdog-4 stays gated until 2026-05-22T21:00Z. Watchdog-3 soak window protects against discovering a regression too late to safely sequence the next image rebuild.
  6. NO backlog interleave this cycle — 1954a/1955a/1955b already DONE (stale note from user prompt); no other free non-watchdog work in Todo with ready owners.
```

### Hypothesis Bench — Watchdog Adequacy Question

The 1958-rca-2 verdict ("not an outage, normal staged deployment") removed the original hypothesis bench (5 outage scenarios). The remaining open hypotheses for 1959 are:

> **H-1959-1:** Pre-flight disk check (watchdog-1 DONE) + symmetric start_period bumps (watchdog-2 + watchdog-7 DONE) + pre-baked model (watchdog-3 DONE) together eliminate ≥ 90 % of the 1958-class cold-start hang surface area. Disk-usage alert (watchdog-5 in flight) + LanceDB compaction (watchdog-4 gated) protect the input precondition (free disk). watchdog-6 (async lifespan, deep hold) addresses the residual case where the model is in image but I/O contention still blocks the FastAPI event loop.
>
> **H-1959-2 (NEW, cycle-2):** The named-volume shadow class is bounded — most services that mount `market_data` write to `/app/data/*` only at runtime (DB writes, OCR cache, queue rows). watchdog-3 was the rare case where build-time content (model weights) needed to live at the same path. Audit (watchdog-8) will confirm: most likely outcome ≤ 1 additional service flagged; worst case = 2–3 silent shadowing assets, each fixable independently with the same /opt/<name>-cache pattern.

If H-1959-1 AND H-1959-2 hold, sprint 1959 closes cleanly. If a 2nd outage hits with the same fingerprint (cold-start hang) during the sprint, PO escalates to architect for structural rethink (potential RAG service redesign). If watchdog-8 audit returns ≥ 3 CONFIRMED SHADOWs, PO opens Sprint 1960-volume-shadow-remediation as a sequenced fix campaign (one rebuild at a time).

---

## Next

- Cycle-1 SHIPPED (3 watchdogs DONE).
- Cycle-2 dispatched 2026-05-20T21:05Z: watchdog-5 (dev-mcp-server) + watchdog-8 (architect audit).
- Cycle-3 unlocks 2026-05-22T21:00Z (48 h post-watchdog-3 soak): watchdog-4.
- Cycle-4 deep hold: watchdog-6 (after watchdog-3 + watchdog-4 stable 7 d).
- Signals emitted this cycle: `docs/signals/po-1959-cycle-2.json` (cycle-2 dispatch + scope-extension for watchdog-8).
- DASHBOARD ops section pruned of `1958-A-01` (already CLOSED in c224). 1959-watchdog-3 and 1959-watchdog-7 DONE rows kept; 1959-DISPATCH row updated PARTIAL-DONE → ongoing.
- Sprint 1959 self-closes once all ACs verified OR explicit defer-with-rationale documented.
