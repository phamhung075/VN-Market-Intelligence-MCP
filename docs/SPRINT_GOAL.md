# Sprint 1958 Goal — DOCKER-COMPOSE STACK OUTAGE + HARDENING

**Status:** OPEN 2026-05-20T20:10Z · RCA integration 2026-05-20T20:15Z | **Trigger:** system-auditor Tier-1 (19:59Z + 20:02:23Z reconfirmation) | **Severity:** CRITICAL → RESOLVED (recovery), HIGH (hardening backlog) | **Slot reuse note:** Sprint 1958 slot was previously held by `po-1958-bctc-stale-triage.json` (OBSERVE-only, no sprint opened) and by a separately-scoped `1958a` cron-firing fix (DONE 2026-05-20, qa commit `84c2b375`). This sprint reopens 1958 for the **stack outage scope** with disambiguated task IDs.

## Incident Snapshot

- **Reported:** system-auditor Tier-1 audit 2026-05-20T19:59:48Z, reconfirmed 20:02:23Z (DASHBOARD row `1958-A-01`).
- **Symptom:** 9 microservices NOT RUNNING (api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch). Only `mcp-server` (Up 23m) + `frontend` running.
- **Recovery:** ops `docker compose up -d` + manual `docker restart vn-market-intelligence-mcp-rag-service-1`. 11/11 UP at 2026-05-20T20:06:31Z. Recovery time 4 min.
- **RCA (ops 2026-05-20T22:15Z, signal `docs/signals/ops-1958-rca.json`):**
  - **Recovery-hang root cause:** Docker VM disk at **97%** + RAG service async lifespan handler blocked loading sentence-transformers model (~400 MB) under I/O contention from LanceDB (29 GB) cold-load. 30 s health start_period insufficient.
  - **Storage breakdown:** lancedb=29 GB, models=922 MB, logs=162 MB, pdfs-local=113 MB, pdfs=21 MB.
  - **Verdict:** deterministic under disk pressure ≥90 %; non-reproducible today (disk varies); high likelihood as LanceDB grows.
  - **Gap:** RCA timeline starts at 20:05:22 Z (recovery `docker compose up -d`). It does NOT explain the original 04:32 Z → 19:59 Z drop window. Docker events / macOS journal were not inspected. **→ 1958-rca-2 scopes that gap.**

## Sprint Goal

Recovery is done. Remaining objectives: (A) restore disk headroom **now** (immediate risk), (B) ship the 6 watchdog hardening items so the same conditions don't recur, (C) close the original-outage investigation gap while logs are fresh, (D) keep detection latency at ≤5 min.

## Tasks

| ID | Title | Priority/Size | Owner | Zone | Status | Depends |
|----|-------|---------------|-------|------|--------|---------|
| 1958-recovery | Immediate stack recovery — restore 10 missing microservices | HIGH / M | ops | ops | **DONE** (2026-05-20T20:06:31Z) | — |
| 1958-rca | Root-cause analysis — recovery-hang + outage window | HIGH / S | ops | ops | **PARTIAL** — recovery-hang root cause complete (`docs/signals/ops-1958-rca.json`); outage-window gap split to 1958-rca-2 | — |
| 1958-disk-relief | **IMMEDIATE** — vacuum LanceDB, rotate logs, prune docker images; restore ≥15 GB free | HIGH / S | ops | ops | TODO (dispatched in parallel with watchdog work) | — |
| 1958-rca-2 | Investigation gap — docker events + macOS journal 04:32Z–20:02Z (why original 10-service drop?) | MEDIUM / S | ops | ops | TODO (do soon — logs rotate) | — |
| 1958-watchdog-1 | Pre-flight disk check before `docker compose up -d` (fail-fast if free < 15 GB) | HIGH / S | ops | ops | BACKLOG | 1958-disk-relief |
| 1958-watchdog-2 | Bump `rag-service` healthcheck `start_period` 30s → 60s | HIGH / XS | dev-mcp-server | apps/mcp-server/ (owns compose) | BACKLOG | — |
| 1958-watchdog-3 | Pre-bake sentence-transformers model in `apps/rag-service/Dockerfile` | MEDIUM / S | dev-rag-service | apps/rag-service/ | BACKLOG | 1958-disk-relief |
| 1958-watchdog-4 | LanceDB compaction / archival cron (reclaim disk weekly) | MEDIUM / M | dev-rag-service | apps/rag-service/ | BACKLOG | — |
| 1958-watchdog-5 | Disk-usage alert cron (BUG Telegram when `/app/data/lancedb` > 20 GB) | MEDIUM / S | dev-mcp-server | apps/mcp-server/ | BACKLOG | — |
| 1958-watchdog-6 | Async-ify RAG lifespan handler (model load in thread pool) | LOW / M | dev-rag-service | apps/rag-service/ | BACKLOG | — |

## Acceptance Criteria (sprint-level)

- **AC-1 (recovery):** 11/11 containers Up + healthy ✅ (DONE 2026-05-20T20:06:31Z)
- **AC-2 (rca):** Recovery-hang RCA published ✅ (`docs/signals/ops-1958-rca.json`); outage-window RCA (1958-rca-2) emits brief or signed-off "logs unreachable" verdict.
- **AC-3 (disk-relief):** Free space on Docker VM ≥ 15 GB AND LanceDB compacted (or archived) such that `du -sh /app/data/lancedb` < 25 GB.
- **AC-4 (watchdog-1):** Bash pre-flight script in `scripts/preflight-disk.sh` (or equivalent) wired into deployment docs; fails fast if free < 15 GB.
- **AC-5 (watchdog-2):** `docker-compose.yml` `rag-service.healthcheck.start_period` = 60s; deployed and verified across one full restart cycle.
- **AC-6 (watchdog-3):** rag-service image build includes RUN step downloading the embedding model into image layer; cold-start no longer hits HF network.
- **AC-7 (watchdog-4):** Cron job (weekly or daily) compacts/archives LanceDB; `cron_job_runs` shows ≥1 successful tick within 7 days of merge.
- **AC-8 (watchdog-5):** Disk-usage cron registered; first 12 ticks green; threshold 20 GB.
- **AC-9 (watchdog-6):** RAG lifespan handler offloads model load to thread pool / async context; cold-start unblocks API in < 5 s.
- **AC-10 (close):** All tasks Done OR explicitly deferred with rationale + `po-1958-stack-outage-close.json` emitted + DASHBOARD row `1958-A-01` flipped from RESOLVED → CLOSED + lesson encoded.

## Constraints / Boundary

- **WIP cap 2/2 dev-zone respected per zone.** `dev-mcp-server` slot for watchdog-2 + watchdog-5. `dev-rag-service` slot for watchdog-3, -4, -6 (three pulls — PM should sequence). Ops + investigation lanes are separate from dev-zone WIP.
- **1958-disk-relief MUST land before watchdog-3 deploy** — pre-baking the model adds image weight; need headroom first.
- **1958-rca-2 should run soon** — docker events buffer and macOS journal both rotate; recovery agent recommendation is "cheap, logs rot fast".
- **Recurring-bug escalation:** this is the FIRST stack outage of this class. No escalation gate. If a second outage with the same RCA fingerprint hits, PO escalates to architect for structural rethink.
- **Existing OBSERVE gates preserved unchanged:** OBSERVE-1953g, OBSERVE-1957d, OBSERVE-1955c, OBSERVE-1955d, OBSERVE-1907a-verify, OBSERVE-1951d-verify, post-1945-* — all unrelated to stack outage, no interference.

## Hypothesis Bench (for 1958-rca-2)

The recovery-hang RCA explains the 20:05:22 Z hang. It does NOT explain why 9 services were already DOWN before that point. 1958-rca-2 must enumerate + rule on:

1. **macOS sleep / Docker Desktop pause** — laptop slept overnight, containers stopped, only `mcp-server` (`restart: unless-stopped` likely) came back. Check `log show --predicate 'subsystem == "com.apple.kernel"' --last 24h` for sleep events.
2. **Manual `docker compose down` / partial stop** — check shell history + tmux/iterm scrollback if available.
3. **Docker daemon restart** — check `~/Library/Containers/com.docker.docker/Data/log/host/dockerd.log` for restart events in window.
4. **OOM / VM resource pressure** — `docker events --since 16h --until 4h | grep -iE 'oom|die'`.
5. **Restart-policy differential** — confirm whether `mcp-server` + `frontend` have a different `restart:` policy than the 9 down services in `docker-compose.yml`. If yes, that explains asymmetric survival under any process-killing event.

## Next

10 task rows in `docs/TASKS.md` Backlog. Signals emitted: `docs/signals/po-1958-rca-integration.json`. DASHBOARD row `1958-A-01` updated. Sprint will self-close once all ACs verified.
