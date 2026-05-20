# Sprint 1959 Goal — WATCHDOG HARDENING BATCH (post-1958 stack outage)

**Status:** OPEN — cycle-3 dispatch 2026-05-20T21:27Z | **Predecessor:** Sprint 1958 (incident response) CLOSED 2026-05-20T20:40Z | **Severity:** HIGH (preventive hardening — no live incident) | **Sign-off:** po-1958-close.json + po-1958-mid-checkpoint.json + po-1959-cycle-2.json + po-1959-cycle-3.json

**Close-out decision (cycle-3, 2026-05-20T21:27Z):** Sprint 1959 STAYS OPEN until watchdog-4 ships post-2026-05-22T21:00Z gate. The 48 h soak window is intentional pre-condition design, not idle time — closing now and reopening Sprint-1961-watchdog-finale fragments cognitive thread for no gain. Cycle-3 adds 2 XS follow-on tasks from watchdog-8 audit (standing policy + Dockerfile remnant cleanup).

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
| 1959-watchdog-5 | Disk-usage alert cron (BUG Telegram when `/app/data/lancedb` > 20 GB) | MEDIUM / S | dev-mcp-server | apps/mcp-server/ | **DONE+QA-PASS 2026-05-20** (commit `edafce4f`; 9/9 tests; cronJobCount 76→77; alert fires by design at next hourly tick — lancedb 29 GB > 20 GB) | — |
| 1959-watchdog-8 | Named-volume shadow audit (read-only) — `market_data`-mounted services scanned for Dockerfile assets baked under `/app/data/*`. | LOW / S | architect | multi (read-only) | **DONE 2026-05-21T00:30Z** (commit `a8a66bd1`; 2 CONFIRMED SHADOWs latent-risk only; brief `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md`; threshold ≥ 3 for Sprint 1960-volume-shadow-remediation NOT reached) | — |
| 1959-watchdog-9 | **NEW cycle-3** — Standing policy doc `docs/standards/dockerfile-volume-policy.md` (`/opt/<service>-assets/` convention; never bake under `/app/data/*`). Converts watchdog-8 finding into a forward guard. | LOW / XS | architect | docs/standards/ | **DISPATCH-NOW** (cycle-3) | watchdog-8 done |
| 1959-watchdog-10 | **NEW cycle-3** — Cleanup rag-service Dockerfile remnant `RUN mkdir -p /app/data/lancedb /app/data/models` → drop `/app/data/models` (no-op post-watchdog-3). One-line edit + rebuild + 60 s smoke. | LOW / XS | dev-rag-service | apps/rag-service/ | **DISPATCH-NOW** (cycle-3; safe — 32 GB free, no other rebuild in flight) | watchdog-3 done |
| 1959-watchdog-4 | LanceDB compaction / archival cron (reclaim disk weekly) | MEDIUM / M | dev-rag-service | apps/rag-service/ | HOLD (unlock 2026-05-22T21:00Z — 48 h post-watchdog-3 ship) | watchdog-3 |
| 1959-watchdog-6 | Async-ify RAG lifespan handler (model load in thread pool) | LOW / M | dev-rag-service | apps/rag-service/ | DEEP HOLD (gates on watchdog-3 + watchdog-4 both stable 7 d) | watchdog-3, watchdog-4 |

### Acceptance Criteria (sprint-level)

- **AC-1 (watchdog-1):** PASS — `scripts/preflight-disk.sh` exists, executable, tested healthy + threshold-override, documented in `docs/protocols/docker-deployment-runbook.md`. Commit `784905da`.
- **AC-2 (watchdog-7):** PASS — `docker-compose.yml` `flaresolverr.healthcheck.start_period` = 60 s; 3-of-3 restart smoke PASS (11/13/11 s); API status=ok. Commit `fd292896`.
- **AC-3 (watchdog-3):** PASS — `apps/rag-service/Dockerfile` bakes model into `/opt/model-cache` (outside named-volume shadow); image +920 MB; cold-start 11–16 s; zero HF fetches (`HF_HUB_OFFLINE=1`). Commit `66255410`.
- **AC-4 (watchdog-5):** PASS — `diskUsageAlertJob.ts` registered in `cronConfig.ts` (`47 * * * *`); 9/9 unit tests GREEN; 12-tick under-threshold smoke = 0 Telegrams; over-threshold smoke fires exactly one BUG message; 6 h cooldown verified. QA APPROVED. Commit `edafce4f`.
- **AC-5 (watchdog-4):** PENDING — LanceDB compaction cron registered (weekly Mon 02:00Z); `cron_job_runs` ≥ 1 success within 7 d; LanceDB `du -sh` ≤ 25 GB after first run. Gates until 2026-05-22T21:00Z (48 h post-watchdog-3).
- **AC-6 (watchdog-6):** DEEP HOLD — RAG lifespan offloaded to `asyncio.to_thread()`; cold-start API 200 within 5 s. Gates on watchdog-3 + watchdog-4 stable for 7 d.
- **AC-8 (watchdog-8):** PASS — `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md` exists; 9 services inventoried (2 CONFIRMED SHADOW, 2 SAFE, 5 OUT-OF-VOLUME); verdict + recommendation present. Commit `a8a66bd1`.
- **AC-9 (watchdog-9 NEW):** PENDING — `docs/standards/dockerfile-volume-policy.md` exists; ≤ 60 L; cross-linked from `docs/references/tree-map.md`. Dispatch cycle-3.
- **AC-10 (watchdog-10 NEW):** PENDING — `apps/rag-service/Dockerfile` mkdir line trimmed; rebuild + 60 s smoke PASS (`/health` 200 + `/search` returns results). Dispatch cycle-3.
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

### Dispatch Slate — Cycle 2 (SHIPPED 2026-05-20T21:30Z–2026-05-21T00:30Z)

```
SHIPPED (cycle-2):
  - dev-mcp-server    → 1959-watchdog-5   DONE+QA-PASS 2026-05-20  commit edafce4f  (9/9 tests, cronJobCount 76→77)
  - architect         → 1959-watchdog-8   DONE 2026-05-21T00:30Z   commit a8a66bd1  (2 CONFIRMED SHADOWs latent-risk; threshold ≥3 not reached)
```

### Dispatch Slate — Cycle 3 (this PO cycle, 2026-05-20T21:27Z)

```
DISPATCH SLATE (Sprint 1959 cycle-3):
  - architect         → 1959-watchdog-9   (XS, standing Dockerfile volume policy doc — converts watchdog-8 lesson into forward guard)
  - dev-rag-service   → 1959-watchdog-10  (XS, cleanup /app/data/models mkdir remnant + 60 s smoke — closes latent shadow remnant)

HOLD (cycle-4 candidate, unlocks 2026-05-22T21:00Z):
  - dev-rag-service   → 1959-watchdog-4   (LanceDB compaction cron — 48 h soak post-watchdog-3)

DEEP HOLD (cycle-5):
  - dev-rag-service   → 1959-watchdog-6   (after watchdog-3 + watchdog-4 stable 7 d)

RATIONALE:
  1. Sprint close-out decision: STAY OPEN until watchdog-4 ships. 48 h soak is design, not idle. Closing/reopening = artificial sprint churn for no cognitive gain.
  2. Disk healthy (32 GB free). watchdog-10 triggers ONE rebuild (rag-service, ~0 MB delta vs watchdog-3). Safe under disk discipline. watchdog-9 is docs-only, no rebuild.
  3. WIP cap 2/2 dev-zone respected: architect 1 slot (watchdog-9 docs), dev-rag-service 1 slot (watchdog-10), dev-mcp-server 0 (idle, awaiting cycle-4 if any).
  4. watchdog-9 routes to architect (policy authoring, cross-link tree-map). Separate lane from dev-rag-service.
  5. watchdog-10 = XS Dockerfile diff + rebuild. Pre-flight disk script (watchdog-1) gates it automatically.
  6. NO additional backlog interleave this cycle: (a) chef-morning verification implicit in OBSERVE-1953g + OBSERVE-1907a-verify; (b) OBSERVE-1955d 09:00Z today already past — ops auto-sweep next cycle; (c) no other Todo with ready owners + cleared gates.
  7. By-design alert this cycle: disk-usage cron will emit BUG on first hourly tick (lancedb 29 GB > 20 GB). NOT a fault. Do NOT queue lancedb compaction prematurely — that's watchdog-4's gated job at 2026-05-22T21:00Z.
```

### Hypothesis Bench — Watchdog Adequacy Question

The 1958-rca-2 verdict ("not an outage, normal staged deployment") removed the original hypothesis bench (5 outage scenarios). The remaining open hypotheses for 1959 are:

> **H-1959-1:** Pre-flight disk check (watchdog-1 DONE) + symmetric start_period bumps (watchdog-2 + watchdog-7 DONE) + pre-baked model (watchdog-3 DONE) together eliminate ≥ 90 % of the 1958-class cold-start hang surface area. Disk-usage alert (watchdog-5 in flight) + LanceDB compaction (watchdog-4 gated) protect the input precondition (free disk). watchdog-6 (async lifespan, deep hold) addresses the residual case where the model is in image but I/O contention still blocks the FastAPI event loop.
>
> **H-1959-2 (NEW, cycle-2):** The named-volume shadow class is bounded — most services that mount `market_data` write to `/app/data/*` only at runtime (DB writes, OCR cache, queue rows). watchdog-3 was the rare case where build-time content (model weights) needed to live at the same path. Audit (watchdog-8) will confirm: most likely outcome ≤ 1 additional service flagged; worst case = 2–3 silent shadowing assets, each fixable independently with the same /opt/<name>-cache pattern.

If H-1959-1 AND H-1959-2 hold, sprint 1959 closes cleanly. If a 2nd outage hits with the same fingerprint (cold-start hang) during the sprint, PO escalates to architect for structural rethink (potential RAG service redesign). If watchdog-8 audit returns ≥ 3 CONFIRMED SHADOWs, PO opens Sprint 1960-volume-shadow-remediation as a sequenced fix campaign (one rebuild at a time).

---

## Next

- Cycle-1 SHIPPED (3 watchdogs DONE: 1, 7, 3).
- Cycle-2 SHIPPED (2 tasks DONE: 5 + QA-PASS, 8).
- Cycle-3 dispatched 2026-05-20T21:27Z: watchdog-9 (architect docs) + watchdog-10 (dev-rag-service cleanup).
- Cycle-4 unlocks 2026-05-22T21:00Z (48 h post-watchdog-3 soak): watchdog-4 (LanceDB compaction).
- Cycle-5 deep hold: watchdog-6 (after watchdog-3 + watchdog-4 stable 7 d).
- Signals emitted this cycle: `docs/signals/po-1959-cycle-3.json` (cycle-3 dispatch + close-out decision documented).
- Sprint 1959 self-closes once watchdog-4 ships + soak verifies + DASHBOARD ops section pruned + `po-1959-close.json` emitted.
