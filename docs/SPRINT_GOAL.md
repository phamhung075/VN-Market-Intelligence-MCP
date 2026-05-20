# Sprint 1958 Goal — DOCKER-COMPOSE STACK OUTAGE (CRITICAL INCIDENT)

**Status:** OPEN 2026-05-20T20:10Z | **Trigger:** system-auditor Tier-1 (19:59Z + 20:02:23Z reconfirmation) | **Severity:** CRITICAL — 10 of 11 microservices DOWN | **Slot reuse note:** Sprint 1958 slot was previously held by `po-1958-bctc-stale-triage.json` (OBSERVE-only, no sprint opened) and by a separately-scoped `1958a` cron-firing fix (DONE 2026-05-20, qa commit `84c2b375`). This sprint reopens 1958 for the **stack outage scope** with disambiguated task IDs.

## Incident Snapshot

- **Reported:** system-auditor Tier-1 audit 2026-05-20T19:59:48Z, reconfirmed 20:02:23Z (DASHBOARD row `1958-A-01`).
- **Symptom:** `docker ps` shows only `mcp-server` (Up 23m) + `frontend` running. 9 microservices NOT RUNNING: api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch.
- **Surface health:** mcp-server itself responsive (DB OK, 16 circuits green, all 79 cron jobs firing, VPS HTTPS reachable). Tier-2 freshness sweep ran HEALTHY — outage is **inter-service plane**, not data plane.
- **Blocks:** inter-service checks A-25→A-28 cannot run; alert-engine + pdf-extractor + rag-service silent.
- **Dispatch already in flight:** ops actioning recovery in parallel with this sprint open.

## Sprint Goal

Restore 11/11 microservices to operational state, determine root cause of the 10-service drop, and close the **detection gap** (Tier-1 runs every 30 min; a 30-min blind window on a 10-service outage is unacceptable for a CRITICAL incident).

## Tasks

| ID | Title | Priority/Size | Owner | Status | Depends |
|----|-------|---------------|-------|--------|---------|
| 1958-recovery | Immediate stack recovery — restore 10 missing microservices | HIGH / M | ops | **DONE** (2026-05-20T20:06:31Z, recovery time 4 min) | — |
| 1958-rca | Root-cause analysis — WHY did the stack lose 10 services? | HIGH / S | ops or developer | **TODO** (unblocked) | — |
| 1958-watchdog | Prevention — fast healthcheck cron (≥2 services down → BUG + auto-recover) | MEDIUM / M | dev-mcp-server | BACKLOG | independent |

## Acceptance Criteria (sprint-level)

- **AC-1 (recovery):** `docker ps` shows 11/11 containers Up + healthy; health endpoints A-12→A-20 all return 200 within 5 min of recovery action.
- **AC-2 (rca):** Written RCA in `docs/architecture-briefs/2026-05-20-stack-outage-rca.md` identifying the exact cause (OOM / manual stop / failed update / power cycle / docker daemon crash) with evidence from `docker events`, `dockerd` logs, macOS system journal, and the outage window (between last known healthy state and 19:59:48Z first detection).
- **AC-3 (watchdog):** New cron job firing every 5 min that counts running containers vs expected (11); on `running < 9` emit BUG Telegram + attempt `docker compose up -d` (idempotent); detection latency reduced from 30 min → ≤5 min.
- **AC-4 (close):** All 3 tasks Done + `po-1958-stack-outage-close.json` emitted + DASHBOARD row `1958-A-01` flipped from OPEN → RESOLVED + lesson encoded.

## Constraints / Boundary

- **1958-recovery NOT blocked on anything** — ops mid-recovery, this sprint formalizes the work in-flight, does not gate it.
- **1958-rca chained to 1958-recovery** — need to know what was broken before investigating why.
- **1958-watchdog independent** — prevention work can start any time; non-blocking on recovery + RCA.
- **WIP cap 2/2 dev-zone respected** — ops + investigation are different lanes. dev-mcp-server slot for 1958-watchdog only fires when dev-zone has capacity.
- **Existing OBSERVE gates preserved unchanged:** OBSERVE-1953g, OBSERVE-1957d, OBSERVE-1955c, OBSERVE-1955d, OBSERVE-1907a-verify, OBSERVE-1951d-verify, post-1945-* — all unrelated to stack outage, no interference.

## Hypothesis Bench (input to 1958-rca, not pre-judging)

The system-auditor notebook reports mcp-server alone is Up 23m as of 20:02:23Z. That points to a stack-wide event between ~19:30Z (still healthy implied by 19:14Z deploy verify trail in 1953g) and ~19:39Z (mcp-server restart 23m before 20:02). Candidate causes for the RCA to enumerate + reject:

1. **Manual `docker compose down` / partial stop** — most common, leaves daemon alive but services off.
2. **Docker daemon restart on macOS** — would have killed all containers; mcp-server being Up 23m alone is odd under this hypothesis unless docker-compose policy `restart: unless-stopped` only on mcp-server.
3. **Failed rolling update / rebuild** — Sprint 1961a was a rebuild but only of mcp-server (2026-05-20 21:36Z claimed in ops notebook, but that timestamp is in the future relative to the 20:02:23Z audit — possible clock drift; needs verification).
4. **OOM / resource exhaustion** — would show in `dmesg` / Docker desktop logs.
5. **VirtualMachine SHM teardown** — historically caused SQLite corruption; could here have torn other containers.

1958-rca must rule each in or out with evidence.

## Next

Three task rows added to `docs/TASKS.md` Backlog. Signal `docs/signals/po-1958-stack-outage-sprint.json` emitted. DASHBOARD row `1958-A-01` updated with sprint pointer. Sprint will self-close once all 3 ACs verified by the closing PO cycle.
