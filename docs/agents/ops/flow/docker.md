<!-- size-justification: 121L — FIX-OPS-DEPLOY-SELFREPORT-FABRICATED-FUTURE-TIMESTAMP-NONEXISTENT-IMAGE 2026-08-05: added the mandatory Deploy-Evidence Capture block (raw `date -u`/`docker inspect` output + SHA-gate pointer) to § Post-Rebuild Health Verification and tightened its Pass/Fail criteria (+9L over the prior 113L) — a fail-loud instrument with no factoring seam from the verification procedure it gates. -->
# Ops — Docker Flow

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Container down, restart loop, unhealthy health check, service unreachable

## Output
All containers healthy, `/health` returns 200 | Escalation if compose down fails

---

## FORBIDDEN — Scope-Destroying Compose Patterns

> **SSOT for this rule** — other ops flow files point here; do NOT duplicate.

The following patterns are **FORBIDDEN** in all ops flows:

| Forbidden | Why |
|---|---|
| `docker compose down` (bare) | Destroys ALL project containers — kills peer services not under repair (10:53Z 2026-06-05: 4-peer outage) |
| `docker-compose down` (any form) | Same — legacy alias |
| `up -d` without explicit `<service>` | Mass-starts all 12 compose services → 16GB host kernel-panic risk (`project_host_memory_panic`) |
| `--remove-orphans` | Silently kills services not in current compose scope |
| `--force-recreate` without explicit `<service>` | Same blast radius as bare down/up |

**Intended-running set SSOT:** `docs/data/system-map.json` `.project.infrastructure.docker.host_runtime_set` (6 services; 6 are NOT deployed by design).

**Correct scoped patterns:**
```bash
# Relaunch a destroyed/clean-exit container (no code change):
docker compose up -d --no-deps --no-build <service>

# Rebuild after code change:
docker compose build <service> && docker compose up -d --no-deps <service> && docker builder prune -f

# Inspect only:
docker compose ps
docker logs -f <service> --tail 100
```

## Docker Commands
```bash
docker compose ps
docker logs -f mcp-server --tail 100
# REBUILD mcp-server after code change:
docker compose build mcp-server && docker compose up -d --no-deps mcp-server && sleep 5 && docker builder prune -f
# RELAUNCH mcp-server (clean-exit, no code change):
docker compose up -d --no-deps --no-build mcp-server && sleep 5
curl http://localhost:3000/health
```

NEVER: `bun --hot` | `bun --watch` | `nodemon` | `pm2` | manual Bun restarts

## WHY: Builder Prune Is Mandatory After Every Rebuild

`docker builder prune -f` is an **unconditional final step** of every targeted rebuild.

**Root cause — 3 recurrences:**
- 2026-05-27: Docker build-cache accumulation from repeated `build --no-cache mcp-server` consumed host disk.
- 2026-06-07: Same pattern; manual `docker builder prune -f` recovered ~18 GB.
- 2026-06-14: Hit 97% / 6.7 Gi free; ENOSPC-blocked a QA agent; recovery again required `docker builder prune -f` (reclaimed 18.62 GB). A documented rule ("≥2 rebuilds/day → builder prune") existed but was never codified into the flow — it relied on memory and kept recurring.

**Why unconditional (not heuristic):** The ≥2/day threshold is impossible to track reliably across agent sessions. Making prune mandatory every rebuild eliminates the tracking burden and prevents accumulation from the first rebuild.

**Safety properties (must NOT be feared):**
- `docker builder prune -f` removes ONLY inactive build cache layers — it never touches running containers, named volumes (including `market.db`), or tagged images.
- It is safe to run at any time while services are running.

**generic_mandate — do NOT scope to mcp-server only:**
The builder cache is **host-wide**, not per-service. One prune step covers all 6 `host_runtime_set` services (see `docs/data/system-map.json` `.project.infrastructure.docker.host_runtime_set`). Never add a service condition; always run bare `docker builder prune -f`.

---

## Post-Rebuild Health Verification (MANDATORY)

**Trigger:** any `docker compose up -d --no-deps <svc>`, `docker compose build <svc>`, or container restart — even when scoped to ONE service. (Bare `down`/`up -d`/`--force-recreate` are FORBIDDEN — see § FORBIDDEN above.)

**Why:** rebuilds can collateral-damage neighbour services (port re-binding, network race). c71 incident (2026-05-13): `--force-recreate macro-indicators` for FRED activation knocked mcp-server gateway port 3000; 3 cowork agents + dev-team blocked ~50 min before detection. Single-service success in isolation ≠ fleet healthy.

**Procedure (run after EVERY rebuild, before declaring success):**

Service port list → `jq '.project.microservices[] | {id, port}' docs/data/system-map.json`
Query patterns → `.claude/skills/system-map-query/SKILL.md`

```bash
docker compose ps                                    # all services Up? note any Restarting/Exit
docker port mcp-server 3000                          # gateway port still bound?
# count against host_runtime_set (expect 6 Up): jq '.project.infrastructure.docker.host_runtime_set.services' docs/data/system-map.json
# curl health check each intended service at its port from system-map.json:
jq -r '.project.microservices[] | "curl -s -o /dev/null -w \"%{http_code}\\n\" http://localhost:\(.port)/health  # \(.id)"' docs/data/system-map.json
```

**Deploy-Evidence Capture (MANDATORY, before Pass/Fail — closes FIX-OPS-DEPLOY-SELFREPORT-FABRICATED-FUTURE-TIMESTAMP-NONEXISTENT-IMAGE, 2026-08-05):** `docker compose ps` + `/health`==200 alone cannot prove a redeploy actually happened — a container already `Up`/healthy BEFORE the dispatch stays `Up`/green if the `up -d --no-deps <svc>` swap silently no-ops. Run BOTH commands below and paste their LITERAL raw output into the notebook/decision-journal/task-board entry — a narrated conclusion ("Pass: all Up") with no attached command output is NOT a valid deploy report:
```bash
date -u                                                                   # copy verbatim as your report timestamp — never hand-type/estimate an ISO string
docker inspect <svc> --format '{{.State.StartedAt}} {{.RestartCount}}'   # StartedAt MUST be AFTER dispatch time, else the container was never swapped
docker image inspect <hash-you-are-about-to-cite> --format '{{.Id}}'     # MUST return with no error — never cite a hash you have not confirmed exists on this host
```
Code-change deploy in scope (e.g. `UNBLOCK-DEPLOY-*` / `FIX-*-RESTART-LOOP` redeploys, not a bare restart)? Also run the authoritative SHA gate instead of eyeballing timestamps: `docs/protocols/docker-deployment-runbook.md` § Microservice Code-Change Close Gate — `bash scripts/verify-deploy-sha.sh <svc>` MUST exit 0. Root cause of the 2026-08-05 fabrication: this gate already existed but ops's own flow never pointed to it for a directly-dispatched deploy task — the gap, not a missing tool, is what made a fabricated success narrative easier to produce than an honest partial-failure report.

**Pass:** all containers `Up`, port 3000 bound, all `/health` return 200, AND the Deploy-Evidence Capture output above shows `StartedAt` after dispatch time + a confirmed-existing image hash (SHA gate exit 0 when it applies).
**Fail:** any container Restarting/Exit OR any `/health` non-200 OR port unbound OR any Deploy-Evidence criterion above fails (stale `StartedAt`, unchanged `RestartCount` when a restart was expected, nonexistent image hash, SHA gate non-zero) →
- Report the gap exactly as observed (e.g. "build succeeded, swap did not take — StartedAt predates dispatch") via `send_telegram(channel="bug")` — an honest partial-failure report is the required output; never substitute a cleaner-looking invented result.
- `docker compose up -d --no-deps --no-build <degraded-service>` → re-verify
- If still failing after 1 restart → escalate. Do NOT mark rebuild as successful in signal/notebook, and do NOT claim a task_board update you did not execute via `scripts/orch-apply.sh` (ops has no other write path into `orch-state.json`).

**Final step — builder cache prune (MANDATORY, run AFTER health checks pass, BEFORE notebook write):**
```bash
docker builder prune -f
```
This step is unconditional — see § WHY: Builder Prune Is Mandatory After Every Rebuild above.
Do NOT skip on the grounds that "only one rebuild was done today" — the heuristic ≥2/day threshold is abolished.

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `ops`; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
