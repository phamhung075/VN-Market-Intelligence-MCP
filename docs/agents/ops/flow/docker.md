<!-- size-justification: 121L — FIX-OPS-DEPLOY-SELFREPORT-FABRICATED-FUTURE-TIMESTAMP-NONEXISTENT-IMAGE 2026-08-05: added the mandatory Deploy-Evidence Capture block (raw `date -u`/`docker inspect` output + SHA-gate pointer) to § Post-Rebuild Health Verification and tightened its Pass/Fail criteria (+9L over the prior 113L) — a fail-loud instrument with no factoring seam from the verification procedure it gates. FIX-BEHAVIORAL-VERIFICATION-GATE-OPS-SIDE 2026-08-26 (agent-father, `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md` §5b): +28L — new mandatory Behavioral-Predicate Probe loop, riding the already-mandatory Post-Rebuild Health Verification (timestamp-gated against the row's own commit, NOT the confirmed-dead `vn.market.git_sha` label), positioned after Pass/Fail, before builder-prune. Zero new cron/step — same "ride an already-unconditional mechanism" design as brief §8.3. -->
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

**Behavioral-Predicate Probe (MANDATORY, after Pass/Fail above, before builder-prune below — `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md` §5b, the "actual teeth" of the gate):**

1. Find open predicates for the just-rebuilt `<svc>`: `done_verified[]` + this-month's `docs/data/orch/archive/*.json` rows where `zone` maps to `<svc>`, `verification.behavior_predicate` is present, `verification.behavior_probe` is absent, AND the row's `created_at`/`qa_verified_at` is `>= BEHAVIOR_PREDICATE_CUTOFF = "2026-08-26T19:57:54Z"` — rows minted before that instant never got a predicate to probe; skip them, that is not a gap.
```bash
jq --arg svc "<svc>" '(.task_board.done_verified // []) | map(select((.zone // "") | test("apps/" + $svc)) | select(.verification.behavior_predicate != null and .verification.behavior_probe == null))' docs/data/orch/orch-state.json
```
2. Ordering check — do **NOT** use the `vn.market.git_sha` Docker label (confirmed dead, `"unknown"` on 9/11 running services, `docker-compose.yml` never wires `GIT_SHA` — brief §3). Reuse the Deploy-Evidence Capture timestamps captured above instead: confirm `docker inspect <svc> --format '{{.State.StartedAt}}'` postdates `git show -s --format=%cI <row's commit>`. Not yet postdated → skip this row this cycle, the commit is not in this build.
3. Run the predicate's `cmd` against the now-healthy service; capture raw stdout verbatim (same "paste literal raw output, never a narrated conclusion" discipline as Deploy-Evidence Capture above).
4. Write the result — reuses `RawProbeSchema`'s shape (`.passthrough()`, schema-legal today, zero code change required):
```bash
jq --arg id "<row id>" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg tool "<predicate cmd, verbatim>" \
   --arg args "svc=<svc>; commit=<commit>" --arg obs "<literal raw stdout captured in step 3>" --argjson match <true|false> '
  (.task_board.done_verified // []) as $dv
  | ([$dv[] | select(.id == $id)][0]) as $t
  | if $t == null then error("id not in done_verified[] -- refuse") else . end
  | .task_board.done_verified = ([$dv[] | select(.id != $id)] + [
      ($t + {verification: (($t.verification // {}) + {
        behavior_probe: {tool:$tool, args:$args, live_value_observed:$obs, observed_at:$now, observed_by:"ops", match:$match}
      })})
    ])
' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
5. On `match:false` — do NOT silently continue: move the row `done_verified[]` (or the matching archive month) → `.task_board.review[]` via the same `orch-apply.sh` mechanism (mirror `docs/agents/qa/flow/main.md`'s `vc-changes` lane-move jq shape — pop from source array, push `{status:"REVIEW", next_agent: (row's owner // "po"), status_note: (...+"\n[ops] behavior_probe match:false — deploy-time observation contradicts DONE_VERIFIED")}` into `.task_board.review[]`), then `send_telegram(channel="bug", message="[ops] behavior_probe match:false — <id> reopened to review[] (predicate: <cmd>, expected <expect>, observed <live_value_observed>)")`. This is the mechanism that makes DONE_VERIFIED provisional and mechanically revocable instead of a terminal unfalsifiable claim (anchor case: `FIX-DASH-CRON-LAYERB-NEVERFIRED-FALSE-LABEL`, `DONE_VERIFIED` landed 13 minutes before its own image was built — this loop is what would have caught it).
6. Rung-0 remediation (§7 of the brief) rides this same `match:false` write — no separate step needed here; `orch-sentinel`'s OH-2.4 (`docs/agents/orch-sentinel/flow/dim-oh2-verification-coverage.md`) reads the `behavior_probe` field this step just wrote, it does not need ops to also touch `signal_queue` directly.

**Final step — builder cache prune (MANDATORY, run AFTER health checks pass, BEFORE notebook write):**
```bash
docker builder prune -f
```
This step is unconditional — see § WHY: Builder Prune Is Mandatory After Every Rebuild above.
Do NOT skip on the grounds that "only one rebuild was done today" — the heuristic ≥2/day threshold is abolished.

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `ops`; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

---

## AC-7 Cgroup Memory Sampler (pdf-extractor)

**Script:** `scripts/pdf-extractor-cgroup-sampler.sh`

**Purpose:** Collect longitudinal cgroup memory metrics for pdf-extractor container AC-7 (>=12h passive sampling window, one sample per 5 min).

**Metrics:** ts, container_id, memory.current, memory.stat{anon,file,inactive_file,pgscan,pgsteal,workingset_refault_anon}, memory.events{max,oom,oom_kill}, /proc/1/status{VmRSS,VmHWM}

**Output:** CSV at `docs/incidents/data/pdf-extractor-ac7-sampler.csv`

**Key design element:** Container ID is stamped on every row to detect silent recreation and invalidate the series loudly.

**Start command:**
```bash
nohup bash scripts/pdf-extractor-cgroup-sampler.sh > /tmp/pdf-extractor-sampler.log 2>&1 &
```

**Verify running:**
```bash
ps aux | grep pdf-extractor-cgroup-sampler | grep -v grep
wc -l docs/incidents/data/pdf-extractor-ac7-sampler.csv   # should increase every 5 min
```

**Stop (if needed):**
```bash
pkill -f pdf-extractor-cgroup-sampler
```

For complete AC-7/AC-8 closure criteria, see task UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT, field po_ac4_bar_ruling_20260824T0850Z (B1-B4 definitions).

