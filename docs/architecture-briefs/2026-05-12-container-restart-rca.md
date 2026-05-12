# Architecture Brief — Container Restart RCA (Task 1896a)

**Authored:** 2026-05-12T15:45:00Z
**Author:** Architect
**Status:** Final
**Task:** 1896a-container-restart-rca
**Verdict:** false-alarm-h4

---

## TL;DR

The two "restarts" observed by TNB in c40 + c41 are two different events with two different causes — **neither is a regression of Sprint 1336**.

- c40 (~02:40 UTC): genuine unattended restart, cause unknown without `docker events` log, uptime prior = ~22h (pre-c40 baseline unknown). Low urgency.
- c41 (~14:35 UTC): **H4 confirmed** — ops agent ran `docker-compose up -d mcp-server` deliberately as part of 1879b (get_fed_liquidity_spread) deployment. TNB detected uptime=12m and flagged "restart". This is a false alarm — the restart was intentional and successful.

**No regression. No follow-up implementation sprint required for H4 event.** c40 event requires one evidence-gathering step from ops before closing fully.

---

## 1. Timeline Reconstruction

| Time (UTC) | Source | Event |
|---|---|---|
| 2026-05-12 ~02:40 | TNB c40 audit (uptime 4h7m at audit; last clean = ~22h prior) | mcp-server restarted. Exact trigger unknown. No ops notebook entry covers this window. |
| 2026-05-12 ~13:35 | Ops notebook entry | Ops completes 1894a Cloudflare diagnosis. No Docker ops performed. |
| 2026-05-12 ~14:35 | Ops notebook: "docker-compose build mcp-server" + "docker-compose up -d mcp-server" for 1879b deployment | **Deliberate container restart** to deploy get_fed_liquidity_spread tool. Ops notebook records: "Status: Up 1 minute (healthy)". |
| 2026-05-12 ~14:47 | TNB c41 audit | Reads uptime=12m. Flags as "2nd restart in <12h". Correct observation, incorrect diagnosis — the 12m uptime is the 1879b deploy, not a crash. |
| 2026-05-12 ~15:27 | PO ACK c41 | Creates 1896a, escalates to Architect. Notes "1895a is NOT the RCA". |

**Key evidence:** Ops notebook (`docs/agent-memory/notebooks/ops.md`) states verbatim:
- "Command: `docker-compose up -d mcp-server` / Result: SUCCESS ✓ / Startup time: ~1 minute / Status: Up 1 minute (healthy) ✓"
- Rebuild SHA256: `30e695b950bea0596e71a57e154c59edc9f66f9263abb8ad20718c45b1fec282`
- Feature commit deployed: `a6d4b555` (1879b get_fed_liquidity_spread)

The TNB ~14:35 UTC timestamp and the ops notebook ~14:35 UTC rebuild are the same event.

**c40 restart (~02:40 UTC) is a separate, unresolved event.** No ops activity logged in that window. Uptime at c40 audit was 4h7m, meaning the restart occurred ~22:33 UTC on 2026-05-11 or ~02:33 UTC on 2026-05-12 (TNB estimate = ~02:40 UTC). This event has no documentation in any notebook. It requires ops evidence (see §3) before a definitive verdict can be issued.

---

## 2. Hypothesis Ranking

### H4 — c48 ops `docker-compose build mcp-server` IS the "restart" TNB detected
**Likelihood: CONFIRMED (c41 event)**

Direct evidence: ops notebook entry precisely matches the 14:35 UTC window. Container was explicitly stopped and started. TNB's uptime=12m reading is the post-deploy healthy state. No crash, no corruption, no SHM teardown. This fully explains the c41 datapoint.

**Consequence for Sprint 1336 status:** unchanged. Sprint 1336 fix (named volume `market_data`) remains in place and was not bypassed by this deployment.

---

### H1 — Sprint 1336 only fixed alert-engine.db + stock_price.db; other DBs still bind-mounted
**Likelihood: LOW for c41 / UNKNOWN for c40**

Docker-compose.yml audit (current state):

```
volumes:
  market_data:
    driver: local

services:
  mcp-server:   market_data:/app/data  (named volume) ✓
  pdf-extractor: market_data:/app/data  (named volume) ✓
  rag-service:   market_data:/app/data  (named volume) ✓
  technical-analysis: market_data:/app/data  (named volume) ✓
  macro-indicators:   market_data:/app/data  (named volume) ✓
  stock-price:   market_data:/app/data  (named volume) ✓
  kinh-dich-service:  market_data:/app/data  (named volume) ✓
  alert-engine:  market_data:/app/data  (named volume) ✓
  api-gateway:   (no volume — stateless) ✓
```

All 8 stateful services share the single named volume `market_data`. There are NO bind-mounts for DB files. Sprint 1336 applied the named-volume fix globally — not just to alert-engine.db + stock_price.db as H1 hypothesized. H1 is FALSE for the current docker-compose state.

Exception: `./reports:/app/reports` and `./docs/agent-memory:/app/docs/agent-memory` remain bind-mounted. These are NOT SQLite WAL databases — they are flat file directories. No SHM teardown risk applies.

---

### H2 — macOS Docker Desktop upgrade reintroduced VirtualMachine SHM teardown at new layer
**Likelihood: LOW**

Sprint 1336's fix (named volume staying inside Docker VM filesystem) is architecture-level, not Docker Desktop version-dependent. A Docker Desktop upgrade would need to change the named-volume isolation boundary to regress this. No evidence of Docker Desktop upgrade in any notebook. Cannot rule out entirely without `docker version` output, but low prior probability given the structural nature of the fix.

---

### H3 — New service (1879b fed-liquidity-spread) caused OOM-kill cascade
**Likelihood: VERY LOW for c41**

The 1879b tool (`get_fed_liquidity_spread`) is a pure SQL query over `fred_series_daily`. No new service spawned — it ships within the existing mcp-server container. OOM limit for mcp-server is 4g. The ops notebook confirms a clean healthy startup ("Up 1 minute (healthy)") with no OOM kill event. H3 is not the c41 cause.

For c40: H3 cannot be applied — the c40 restart predates the 1879b deployment.

---

### Summary ranking

| Rank | Hypothesis | Event | Confidence |
|------|-----------|-------|-----------|
| 1 | H4: intentional deploy restart (1879b) | c41 14:35 UTC | CONFIRMED |
| 2 | Unknown (no log coverage) | c40 02:40 UTC | INCONCLUSIVE |
| 3 | H2: Docker Desktop regression | c40 | LOW |
| 4 | H1: partial named-volume fix | both | RULED OUT |
| 5 | H3: OOM-kill from 1879b | c41 | RULED OUT |

---

## 3. Evidence Requests to Ops (c40 investigation only)

c41 is fully explained by H4. The following commands are requested **only to resolve c40** before archiving 1896a.

**E1 — Which container restarted at ~02:40 UTC?**
```bash
docker events --since "2026-05-12T02:00:00Z" --until "2026-05-12T03:00:00Z" \
  --filter type=container \
  --format '{{.Time}} {{.Actor.Attributes.name}} {{.Action}}'
```
Expected: one or more `die` + `start` events. Identifies which service(s) restarted.

**E2 — Exit code + restart reason for the restarting service**
```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}"
# Then for the service identified in E1:
docker inspect <service-name> --format '{{.State.ExitCode}} {{.State.Error}} {{.RestartCount}}'
```
Exit code 137 = OOM-kill. Exit code 1 = process crash. Exit code 0 = deliberate stop (impossible at 02:40 UTC — no ops active).

**E3 — Last 100 lines of logs before the c40 restart**
```bash
docker logs --since "2026-05-12T02:30:00Z" --until "2026-05-12T02:45:00Z" mcp-server 2>&1 | tail -100
```
Look for: OOM log lines, SQLite SQLITE_CORRUPT or disk image errors, uncaught exception stack traces, healthcheck failure sequence.

**E4 — Volume mount verification (confirm named volume in use, no bind-mount regression)**
```bash
docker inspect mcp-server --format '{{json .Mounts}}' | jq '.[] | {Type, Source, Destination}'
```
Expected: all DB-path entries show `"Type":"volume"`, not `"Type":"bind"`.

**E5 — macOS Docker Desktop version (for H2 ruling)**
```bash
docker version --format '{{.Server.Version}}'
```
Record version. Cross-reference against Docker Desktop release notes for named-volume isolation changes since 2026-04-25 (Sprint 1336 date).

---

## 4. Decision Recommendation

**c41 (14:35 UTC): Close as false alarm.** TNB recalibration recommended (see §5).

**c40 (02:40 UTC): Request E1-E3 from ops before final close.** If E1 shows no container events in the window → TNB uptime read was stale or wrong → second false alarm, close 1896a fully. If E1 shows a genuine crash event → scope a point-fix sprint based on the exit code.

**Sprint 1336 status: intact.** Named volume applied globally. No regression in volume strategy.

**TNB recalibration (low-urgency, no separate sprint):** TNB currently detects uptime delta as a proxy for crash events. It cannot distinguish an intentional `docker-compose up` from a crash. The audit recommendation: when ops runs a deliberate container lifecycle command (build/up/restart), the ops notebook entry should include a `# TNB-PLANNED-RESTART` tag so the next TNB cycle can correlate and suppress the false alarm.

---

## 5. Followup Tasks for PM

**If ops E1-E5 return negative (no genuine crash at 02:40 UTC):**
- No follow-up sprint. Close 1896a. Mark as `false-alarm-h4 + false-alarm-c40-stale-read`.
- Single doc-only action: add `# TNB-PLANNED-RESTART` tagging convention to ops notebook protocol (agent-father, SPRINT-S, ≤5 LOC, can bundle with next available chore).

**If ops E1-E5 confirm genuine crash at 02:40 UTC with exit code 137 (OOM):**
- Open **1896b** (SPRINT-S, ops): raise mcp-server memory limit from 4g → 6g or profile memory growth post-1879b tool additions (+5 tools since last tuning). Owner: ops + developer.

**If ops E1-E5 confirm genuine crash at 02:40 UTC with SQLite error:**
- Open **1896b** (SPRINT-S, developer): audit named volume integrity — run `PRAGMA integrity_check` on market.db. If corrupt → restore from last backup + investigate WAL state.

**If ops E1-E5 confirm genuine crash at 02:40 UTC with exit code 1 (process crash):**
- Open **1896b** (SPRINT-S, developer): identify crashing job via log stack trace. Point-fix the specific scheduler/cron that crashed.

---

## 6. Volume Strategy Audit (Preventive, Not Urgent)

For completeness: the one latent risk identified in brownfield scan is that `./docs/agent-memory` is bind-mounted into mcp-server. Agent notebooks are written through this bind-mount. This is NOT a SQLite WAL risk (flat markdown files), but it IS a macOS VirtualMachine boundary crossing. If notebook writes during a container crash were to tear, the failure mode would be a truncated `.md` file — recoverable from git, low severity. No action required now; log for future sprint if `docs/agent-memory` grows to include structured data (SQLite or LanceDB).

---

## 7. Out of Scope

- Sprint 1336 re-validation: volume configuration confirmed correct in docker-compose.yml. No re-implementation needed.
- 1895a worktree-merge-protocol: unrelated to container restarts.
- HOSE source failure at 14:40 UTC (TNB c41 finding #2): transient post-deploy degradation, self-recovers. No architecture change warranted.
