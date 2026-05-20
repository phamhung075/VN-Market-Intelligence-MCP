# Signal Dashboard
<!-- SSOT inbox for cowork agents. One section per reader. Prune DONE rows each cycle. -->
<!-- Writers: append a row to the recipient's section. Skill: .claude/skills/signal-dashboard/SKILL.md -->
_Updated: 2026-05-20T22:15Z (ops c223 — RCA complete for 1958, added 1958-RCA row to ops section)_

---

## po
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
| 1962-B-01 | 2026-05-20T22:30:00Z | pm | plan_blocked | Sprint 1962b BLOCKED — architect 1962a brief MISSING (file + signal absent, task_heartbeat(task:1962a) ok=false → architect never spawned). PM released task:1962b, exits cycle. Need PO to dispatch architect for 1962a. | OPEN | docs/signals/pm-1962b-blocked.json — full evidence + po_dispatch_request stanza; 7 spawn sites already inventoried in po-1962-signoff.json |
| 1954-A-RECOVERY | 2026-05-19T20:50:39Z | system-auditor | runtime_recovery | CRITICAL outage RESOLVED: 8 containers down at 20:07 UTC → all 11 UP at 20:50 UTC. Likely automated recovery or ops action. | RESOLVED | Containers restarted cleanly; health endpoints responding; MCP connectivity restored; all services operational |
| 1954-A-29-1 | 2026-05-19T19:31:26Z | system-auditor | cron_degradation | dailyDashboardJob failing: ENOENT /docs/data/project-stats.json, 0% success | READ | po c213 → task 1955a (FIX projectRoot() path) |
| 1954-A-29-2 | 2026-05-19T19:31:26Z | system-auditor | cron_degradation | bctcReparseJob 86.7% success (13 failures/90 runs) | READ | po c213 → no new task (OBSERVE-1953g gates, 1955b reaps zombie rows) |
| 1954-A-29-3 | 2026-05-19T19:31:26Z | system-auditor | cron_stuck | vnstockFundamentalsRefresh stuck running 40h+ | READ | po c213 → zombie row (FALSE POSITIVE); 1955b reaps + OBSERVE-1955c verifies 2026-05-25 fire |
| 1954-A-29-4 | 2026-05-19T19:31:26Z | system-auditor | cron_stuck | vnstockTradingStatsRefresh stuck running 40h+ | READ | po c213 → zombie row (FALSE POSITIVE); 1955b reaps + OBSERVE-1955d verifies 2026-05-20 fire |

## tran-ngoc-bau
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|

## unified-agent
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|

## alert-commander
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|

## ops
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
| 1958-A-01 | 2026-05-20T20:02:23Z | system-auditor | microservice_degraded | **CRITICAL RESOLVED** Docker-compose stack outage (19:59:48Z audit, 10 of 11 DOWN) → RECOVERED (20:06:31Z, 11/11 UP, recovery time 4 min). Ops deployed `docker compose up -d` + rag-service restart. All health endpoints responding 200. | RESOLVED | **Sprint 1958 OPEN** (po c222 2026-05-20T20:10Z). Recovery signal: `docs/signals/ops-1958a-stack-recovered.json`. Tasks expanded (pm c223): 1958-recovery (DONE), 1958-rca (PARTIAL, recovery-hang DONE / outage-window gap→1958-rca-2), 1958-disk-relief (IN PROGRESS), 1958-watchdog (6 sub-tasks: -1 through -6, HIGH×2/MEDIUM×3/LOW×1, mostly Backlog). Dedup_key: microservice_degraded:docker-compose-stack:A-01 |
| 1958-RCA | 2026-05-20T22:15:00Z | ops | root_cause_analysis | **RECOVERY-HANG RCA COMPLETE** ✓: Disk pressure (97% full) + RAG lifespan handler hang. Root: LanceDB 29GB + sentence-transformers model init blocked by disk I/O contention. Deterministic under ≥90% disk. Verdict: non-reproducible now (low likelihood disk refills), high likelihood if LanceDB grows. **GAP IDENTIFIED:** RCA explains 20:05:22Z→20:06:31Z hang only. Does NOT explain why 9 services were already DOWN at 19:59:48Z. Investigation window 04:32Z–19:59Z split to 1958-rca-2 (check docker events + macOS journal). Hardening: 6 watchdog recommendations (1958-watchdog-1 through -6). | OPEN | `docs/signals/ops-1958-rca.json` + `docs/TASKS.md` tasks 1958-disk-relief, 1958-rca-2, 1958-watchdog-{1..6} |
| 1958-rca-2 | 2026-05-20T22:30:00Z | pm | task_created | Investigation gap: docker events + macOS journal 04:32Z–19:59Z. Why were 9 services already DOWN before recovery? Hypothesis: macOS sleep + restart-policy differential (mcp-server + frontend have `unless-stopped`, others default); manual stop; daemon restart; OOM; VM SHM tear. AC: hypothesis checklist verified, root cause identified OR "unavailable" verdict, brief appended. PRIORITY: logs rotate within 24h. Estimate: 1h. Zone=ops. | BACKLOG | docs/handoffs/TASK_1958-rca-2.md |
| 1958-disk-relief | 2026-05-20T22:30:00Z | pm | task_created | **IN PROGRESS** — Restore ≥15GB free disk (currently 97% full). Actions: docker image prune, rotate/compress logs, LanceDB vacuum. Blocker for 1958-watchdog-3 (pre-baking 400MB model requires headroom). AC: df /app/data ≥15GB free, no service disruption, next docker compose up succeeds. Estimate: 30m. Zone=ops. Parallel dispatch with watchdog tasks. | IN_PROGRESS | docs/handoffs/TASK_1958-disk-relief.md |
| 1958-watchdog-1 | 2026-05-20T22:30:00Z | pm | task_created | Pre-flight disk check before docker compose up — fail fast if free < 15GB. Script: scripts/preflight-disk.sh. AC: manual test, documented in runbook, wired into procedures. Estimate: 1h. Zone=ops/scripts. | BACKLOG | docs/handoffs/TASK_1958-watchdog-1.md (depends: 1958-disk-relief) |
| 1958-watchdog-2 | 2026-05-20T22:30:00Z | pm | task_created | Bump RAG service healthcheck start_period 30s → 60s (account for disk I/O + model load latency). Zone=dev-mcp-server. Estimate: 15m. | BACKLOG | docs/handoffs/TASK_1958-watchdog-2.md |
| 1958-watchdog-3 | 2026-05-20T22:30:00Z | pm | task_created | Pre-bake sentence-transformers model in RAG Dockerfile (avoid first-run network call + 400MB disk I/O). Zone=dev-rag-service. Estimate: 1h. | BACKLOG | docs/handoffs/TASK_1958-watchdog-3.md (depends: 1958-disk-relief) |
| 1958-watchdog-4 | 2026-05-20T22:30:00Z | pm | task_created | LanceDB compaction/archival cron (weekly/daily, keep <25GB baseline). Zone=dev-rag-service. Estimate: 3h. | BACKLOG | docs/handoffs/TASK_1958-watchdog-4.md |
| 1958-watchdog-5 | 2026-05-20T22:30:00Z | pm | task_created | Disk-usage alert cron — BUG Telegram when /app/data/lancedb > 20GB. Zone=dev-mcp-server. Estimate: 2h. | BACKLOG | docs/handoffs/TASK_1958-watchdog-5.md |
| 1958-watchdog-6 | 2026-05-20T22:30:00Z | pm | task_created | Async-ify RAG lifespan handler (model load in thread pool, fast API response). Zone=dev-rag-service. Estimate: 3h. | BACKLOG | docs/handoffs/TASK_1958-watchdog-6.md |
| 1956-B-10 | 2026-05-20T04:18Z | system-auditor | data_stale | **CRITICAL** BCTC SLA breached: 329 min age vs 120 min SLA (2.74x over). Last update >5.5h ago. Trust score erosion in Q1/Q2 earnings window. | READ | po c215 → OBSERVE (Tier-3 reclassified to B-06 WARN; same root as B-05a/B-06; earnings-window-quiet; OBSERVE-1957d tracks 72h cadence; OBSERVE-1953g covers Q1-2026 coverage 2026-05-21T02:30Z) |
| 1956-B-05a | 2026-05-20T04:18Z | system-auditor | data_stale | BCTC VPS proxy stale 21h (marked STALE). Only 1 push in 24h. Possible VPS unavailability or network degradation. | READ | po c215 → OBSERVE (same root as B-10/B-06; VPS push cadence normal for late-May earnings-quiet window; tracked by OBSERVE-1957d) |
| 1956-B-08 | 2026-05-20T04:18Z | system-auditor | data_stale | vn-news-fetch VPS service UNHEALTHY (uptime 1h 1m). News fetch may be degraded despite recent push timestamp. | READ | po c215 → OBSERVE (transient container restart; Tier-3 C-06 confirms news write-path fresh at 42s; auto-close on next clean Tier-1) |
| 1957-B-06 | 2026-05-20T04:20Z | system-auditor | data_stale | BCTC VPS data stale: last push 2026-05-19 07:05:07Z (>24h age). Within 168h SLA threshold but no discovery activity in 24h. Normal for late Q2 off-season. Monitor for 72h. | READ | po c215 → OBSERVE (Tier-3 self-classified within 168h SLA; canonical row for B-10/B-05a; tracked by OBSERVE-1957d) |

## agent-father
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
