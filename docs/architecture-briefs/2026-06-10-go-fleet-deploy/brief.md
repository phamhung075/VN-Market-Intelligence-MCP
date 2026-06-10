# GO-FLEET-DEPLOY — Architecture Brief

**Sprint:** GO-FLEET-DEPLOY  
**Agent:** agents-architect  
**Date:** 2026-06-10T20:35:25Z  
**Input:** `docs/handoffs/GO-FLEET-DEPLOY-architect-brief.md` + `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-po.md`  
**Decision Journal:** `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-architect.md`  
**Output dir:** `docs/architecture-briefs/2026-06-10-go-fleet-deploy/`

---

## DJ-GATE-1 — Step A-1 (status: OPEN → IN-DESIGN)

**Task-id:** GFD-1  
**Agent:** agents-architect  
**What:** Opened GO-FLEET-DEPLOY architecture design. Input packet accepted from PO (4/6 services Go-ready with exit 0 build; news-fetch = Node→Go port; rag-service = Python Go-exception). Design authority granted for rag strategy, topology, soak gate, and DoD.  
**Decision:** Proceed to full design; no prior architect brief supersedes this sprint.

---

## (a) Go-Port Status Inventory

Ground truth per PO live verification 2026-06-10. No re-derivation.

| Service | go.mod | main() | .golangci.yml | `go build ./...` | CGO | Legacy | Status |
|---|---|---|---|---|---|---|---|
| **stock-price** | yes | `cmd/server/main.go` | yes | exit 0 | CGO (mattn/go-sqlite3) | package.json present | **DEPLOY+SOAK** — not a port task |
| **technical-analysis** | yes | `cmd/server/main.go` | yes | exit 0 | CGO=0 (modernc sqlite) | package.json present | **DEPLOY+SOAK** — not a port task |
| **kinh-dich-service** | yes | `cmd/server/main.go` | yes | exit 0 | CGO=0 | none | **DEPLOY+SOAK** — not a port task |
| **alert-engine** | yes | `cmd/server/main.go` | yes | exit 0 | CGO (sqlite) | none | **DEPLOY+SOAK** — not a port task |
| **news-fetch** | NONE | NONE | NONE | n/a | n/a | package.json (Node/Bun + Playwright) | **GENUINE PORT** — Node→Go |
| **rag-service** | NONE | NONE | NONE | n/a | n/a | requirements.txt (Python/FastAPI/LanceDB/torch) | **GO-EXCEPTION** — architect decision required |

**Reconciliation note:** The May-23 fleet-factory ratification (`docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md`) framed kinh-dich and news-fetch as TypeScript pilots. On-disk reality has since converged: kinh-dich is a mature Go binary with clean build. The sprint scope is COMPLETE+DEPLOY for 4 services, PORT for news-fetch, and exception-path for rag-service.

---

## (b) Target Topology + Zone Owners + rag-service Strategy

### rag-service Strategy — ARCHITECT DECISION

**Chosen strategy: Option (b) — keep rag-service as the lone Python service with a tight memory cap.**

**Justification:**

Option (a) — lean Go HTTP service shelling to a thin Python embedding/LanceDB sidecar — was rejected on the following grounds:

1. **Two-process IPC overhead with no benefit.** A Go HTTP wrapper shelling to Python adds an extra hop (inter-process socket or subprocess) for every embedding call. The Go layer adds no compute; it only adds latency, a new failure mode (sidecar crash), and deployment complexity (two images to build, two health checks to coordinate).

2. **LanceDB and sentence-transformers are Rust/Python-native.** Their performance characteristics are already tuned for single-process operation. There is no memory saving from wrapping them: the Python runtime + torch CPU wheels still load in full — the Go layer adds on top.

3. **RAG is not a hot-path service.** The `search_similar_context` tool is invoked episodically (analyst research queries), not on every market cycle. Its memory footprint is dominated by the sentence-transformer model loaded at startup, not request volume. A tight cap (512 MiB reservation / 768 MiB limit — down from the current 1 GiB/1.5 GiB) is the correct lever.

4. **The "dark capability" problem is a probe gap, not an architecture gap.** Defining a real capability_manifest probe (see §d below) brings rag-service into the observable fleet without any re-architecture.

5. **Sprint scope is deploy, not port-every-service.** The user's directive is "make working." Adding a new Go wrapper binary is new code risk during a deploy sprint.

**rag-service implementation path:** reduce compose memory limits to 512m/768m, add a new `/health` probe and a `/embed/health` probe (see §d), keep the Python FastAPI service as-is. If over 6 months of soak the 512m limit causes OOM on model warm-up, dev-rag-service may revisit quantized embeddings (e.g. sentence-transformers MiniLM-L6-v2 at ~90 MiB vs all-mpnet-base-v2 at ~420 MiB).

### Target Topology

| Service | Port | Zone | Zone Owner (dev-*) | Action | mcp-server coupling |
|---|---|---|---|---|---|
| stock-price | 5000 / ext 5010 | apps/stock-price | **dev-stock-price** | DEPLOY+SOAK | Proxied: `get_market_snapshot`, `get_price_history` route to this svc post-deploy |
| technical-analysis | 5003 | apps/technical-analysis | **dev-technical-analysis** | DEPLOY+SOAK | Proxied: `get_technical_indicators`, TA alert scan jobs |
| kinh-dich-service | 5005 | apps/kinh-dich-service | **dev-kinh-dich** | DEPLOY+SOAK | Proxied: `get_portfolio_conviction`, `get_hexagram_history`, `get_kinhdich_reading` |
| alert-engine | 5006 | apps/alert-engine | **dev-alert-engine** | DEPLOY+SOAK | Proxied: `get_alerts`, `list_alert_rules`, `write_alert_verdict` |
| news-fetch | 5008 | apps/news-fetch | **developer** (no dedicated specialist) | PORT Node→Go then DEPLOY+SOAK | Proxied: `get_agent_signals`, `fetch_and_analyze` |
| rag-service | 5002 | apps/rag-service | **dev-rag-service** | MEM-CAP + PROBE-ADD then DEPLOY+SOAK | Proxied: `search_similar_context`, `record_evidence_fragment` |

**Monolith (mcp-server) transition policy:** mcp-server CONTINUES to proxy all 156 tools. Routing to the microservices is already wired via env vars (`STOCK_URL`, `TA_URL`, etc. — all present in docker-compose.yml). After each service deploys and soaks, mcp-server's internal fallback path (which currently holds the capability in-process) de-activates automatically because the upstream responds. No mcp-server code changes are required for this sprint. The `NOT_DEPLOYED_SERVICES` env var on api-gateway must be updated to remove each service's short_key as it passes DoD soak.

### news-fetch Port Scope (Node→Go)

**Why Go?** Playwright/Chromium is a runtime dependency, not a language dependency. The news-fetch service's VPS-proxied fetch path does not require a headless browser — that path goes through `news-vps` (the VPS proxy at `/proxy/news`). The Playwright dependency is used only for direct-chromium scraping of `trading-economics-chromium` source. That source can be either:
- Moved to a separate minimal Playwright sidecar (single-purpose, only for chromium-mode scraping, keeps existing Bun runtime)
- Or dropped from news-fetch scope entirely (trading-economics data is already fetched via the `trading-economics` direct path by mcp-server's macro indicators)

**Architect decision for news-fetch port:** Port the primary RSS/API news fetch logic (vneconomy-rss, vnexpress-rss, newsapi, news-vps proxy) to Go. Playwright/chromium scraping is NOT ported — it is either delegated to mcp-server's existing chromium path or managed via a separate ultra-thin Bun scraper container (no new ports, shares news-fetch compose slot if needed).

The Go news-fetch service provides:
- `/health` endpoint (standard)
- `/fetch` POST endpoint accepting source configuration
- SQLite write via modernc/sqlite (CGO=0 consistent with technical-analysis pattern)
- golangci-lint + depguard gate (Factory v2 G12 standard)

---

## (c) Footprint Math + HONOR-PANIC-GUARD Soak Gate

### Full-Go-Fleet Footprint Estimate

**Current deployed fleet (RSS empirical):**

| Service | RSS |
|---|---|
| mcp-server | 914 MiB |
| pdf-extractor | 144 MiB |
| headroom-proxy | 274 MiB |
| frontend | 49 MiB |
| mcp-gateway | 23 MiB |
| macro-indicators (Go) | 13 MiB |
| api-gateway (Go, no-CGO) | 9 MiB |
| **Current total** | **~1,426 MiB (~1.4 GiB)** |

**Headroom available:** 7.8 GiB Docker VM ceiling - 1.4 GiB current = **~6.4 GiB**

**Projected new services (conservative Go estimates anchored to fleet proof):**

| Service | RSS estimate | Rationale |
|---|---|---|
| stock-price | ~20 MiB | Go + CGO sqlite; slightly heavier than api-gateway due to connection pool |
| technical-analysis | ~15 MiB | CGO=0, modernc sqlite; similar to macro-indicators |
| kinh-dich-service | ~10 MiB | CGO=0, pure-Go; smallest possible — no DB drivers |
| alert-engine | ~20 MiB | CGO sqlite + dedup in-memory state |
| news-fetch (Go port) | ~18 MiB | CGO=0, HTTP client, sqlite write |
| rag-service (Python, capped) | ~512 MiB reservation | sentence-transformer model warm; capped 768 MiB limit |
| **New services total** | **~595 MiB** | Conservative (Go 5x = ~83 MiB + rag 512 MiB) |

**Full fleet projected total:** 1,426 + 595 = **~2,021 MiB (~2.0 GiB)**

**Safety margin:** 7,800 - 2,021 = **~5.8 GiB remaining** (74% headroom)

Even at 2x pessimistic Go RSS estimate (Go services at 40 MiB each instead of 10-20) and rag at 768 MiB (limit ceiling):
- Pessimistic: 1,426 + (5 x 40) + 768 = 2,394 MiB = **still 69% headroom**

**Verdict: footprint is trivially safe.** The concern is not aggregate RSS but startup-time model loading spike for rag-service and CGO sqlite initialization. The soak gate below handles these.

### HONOR-PANIC-GUARD Soak Gate

**Purpose:** Detect host memory / swap pressure before declaring any service "working." Host kernel panic occurred historically (see `project_host_memory_panic`) — guard must catch accumulation before it reaches panic threshold.

**Mandatory gate for every service bring-up:**

#### Phase 1 — Pre-bring-up baseline
```bash
# Capture baseline BEFORE docker compose build / up
vm_stat | grep "Pages free\|Pages wired\|Pages active\|Pages inactive\|Pages speculative"
sysctl vm.swapusage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

#### Phase 2 — Targeted bring-up (NEVER down&&up)
```bash
# Build only the target service — never touch running peers
docker compose build <svc>
# Bring up only the target service, no-deps, no peer restart
docker compose up -d --no-deps <svc>
```

#### Phase 3 — Sustained watch window (10-minute minimum)
```bash
# Watch host memory every 30s for 10 minutes (20 samples)
for i in $(seq 1 20); do
  echo "=== Sample $i @ $(date -u +%H:%M:%SZ) ==="
  vm_stat | grep "Pages free\|Pages wired"
  sysctl vm.swapusage | grep -v "^$"
  docker stats --no-stream --format "{{.Name}}: {{.MemUsage}}" | grep <svc>
  sleep 30
done
```

#### ABORT criteria (ops MUST abort bring-up and rollback if ANY threshold is hit):

| Metric | ABORT threshold | Action |
|---|---|---|
| macOS free pages | < 500,000 pages (~2 GiB free) | `docker compose stop <svc>`; signal BUG channel |
| Swap usage | > 4 GiB swap used | `docker compose stop <svc>`; signal BUG channel |
| Single service RSS | > 768 MiB (rag) OR > 200 MiB (any Go service) | `docker compose stop <svc>`; escalate to dev-rag-service / relevant dev-* |
| Sustained swap growth | > 500 MiB swap increase over 10-min window | Stop immediately regardless of absolute level |
| Host kernel panic | n/a — automatic | Docker VM enforces cgroup limit; any OOMKill in docker logs triggers immediate sprint halt |

**Bring-up order** (minimizes blast radius — deploy lightest and most stable first):
1. kinh-dich-service (CGO=0, smallest, no external deps beyond sqlite)
2. technical-analysis (CGO=0, modernc sqlite)
3. alert-engine (CGO sqlite, bounded memory state)
4. stock-price (CGO sqlite, VPS bridge)
5. rag-service (Python — deploy last; highest memory risk; model warm-up spike)
6. news-fetch (Go port must complete first; deploy after port DoD)

**Between each service:** Wait for health 200 AND full 10-minute soak window before proceeding to next service. Never stack bring-ups.

---

## (d) Per-Service "Working Correctly" DoD

DoD = container health 200 + live capability_manifest probe returning real data.

### Standard DoD (all services)

1. `docker compose ps <svc>` shows status `running` (not `starting`, not `unhealthy`)
2. `curl -s http://localhost:<port>/health` returns HTTP 200 with JSON containing `"status":"ok"` or equivalent
3. Capability probe (below) returns non-empty real data
4. No OOMKill in `docker logs <svc>` for 10-minute soak window
5. Factory v2 G12 gate: `golangci-lint run ./...` (with depguard) exits 0 for Go services

### Per-Service Capability Probes

| Service | Short key | Health endpoint | Capability probe | Real-data criterion |
|---|---|---|---|---|
| stock-price | stock | `GET /health` → 200 | `get_market_snapshot` via mcp-server | VN-Index value ≠ null, timestamp same-day |
| technical-analysis | ta | `GET /health` → 200 | `get_technical_indicators` via mcp-server | RSI/MACD values for at least 1 watchlist ticker |
| kinh-dich-service | kinh-dich | `GET /health` → 200 | `get_portfolio_conviction` via mcp-server | ≥ 1 hexagram reading returned |
| alert-engine | alert | `GET /health` → 200 | `get_alerts` via mcp-server | Alert list returned (empty list acceptable; no error) |
| news-fetch | news | `GET /health` → 200 | `get_agent_signals` via mcp-server | ≥ 1 signal with non-null ticker |
| rag-service | rag | `GET /health` → 200 | NEW probe (see below) | Semantic query returns ≥ 1 result |

### rag-service New Capability Probe

**Current state:** `probe_type: none` — rag is genuinely dark.

**New probe definition:**

```json
"rag": {
  "capability": "live",
  "probe_type": "http_endpoint",
  "probe": "GET http://rag-service:5002/embed/health",
  "expected_response": {
    "status": "ok",
    "model_loaded": true,
    "index_size": ">= 0"
  },
  "live_evidence": null,
  "probe_added": "2026-06-10"
}
```

**What dev-rag-service must implement:**

Add `GET /embed/health` to the FastAPI app (alongside existing `/health`). This endpoint:
- Verifies the sentence-transformer model is loaded and callable (run a 1-token encode to confirm)
- Verifies LanceDB table is accessible (open table, return row count — 0 is acceptable for fresh deploy)
- Returns JSON: `{"status": "ok", "model_loaded": true, "index_size": <int>, "model_name": "<str>"}`
- Fails fast (return `{"status": "error", "reason": "<str>"}` with 503) if model is not loaded

This endpoint is also the api-gateway capability probe target for rag in `/health` aggregation. Update `NOT_DEPLOYED_SERVICES` on api-gateway to remove `rag` once this probe passes.

---

## Implementation Chain

### Task batch to dispatch via pm

**GFD-2** (dev-kinh-dich) — Pre-deploy validation gate for kinh-dich-service:
- Verify `cmd/server/main.go` health endpoint exists and returns 200 locally
- Confirm golangci-lint + depguard pass
- Confirm compose healthcheck definition is correct
- Status: READY (go build exit 0 confirmed)

**GFD-3** (dev-technical-analysis) — Pre-deploy validation gate for technical-analysis:
- Same as GFD-2 pattern
- Verify modernc sqlite CGO=0 flag is set in Dockerfile
- Status: READY

**GFD-4** (dev-alert-engine) — Pre-deploy validation gate for alert-engine:
- Same pattern; note CGO sqlite requires musl/libc in Docker image
- Status: READY

**GFD-5** (dev-stock-price) — Pre-deploy validation gate for stock-price:
- Same pattern; CGO sqlite + VPS_HOST env wiring verification
- Status: READY

**GFD-6** (ops) — Sequential targeted deploy + HONOR-PANIC-GUARD soak (kinh-dich → ta → alert → stock):
- Depends on GFD-2,3,4,5 all passing
- Deploy in stated order; full 10-minute soak between each
- Update `NOT_DEPLOYED_SERVICES` on api-gateway after each passes DoD
- Targeted rebuild only: `docker compose build <svc> && docker compose up -d --no-deps <svc>`
- DJ-GATE-1: emit soak result to decision journal per service

**GFD-7** (dev-rag-service) — Add `/embed/health` probe endpoint + reduce memory limits:
- Add `GET /embed/health` as described in §d
- Update docker-compose.yml: limits.memory 1.5g → 768m; reservations.memory 1g → 512m
- Keep existing Python/FastAPI service otherwise untouched
- golangci-lint not applicable (Python); flake8/mypy gate if already present

**GFD-8** (ops) — Deploy rag-service (depends on GFD-7):
- Targeted build+up for rag-service only
- Extended soak window: 20 minutes (model warm-up takes up to 60s on first request)
- ABORT if swap > 4 GiB during model load
- Verify `/embed/health` returns `model_loaded: true`

**GFD-9** (developer — news-fetch zone) — Port news-fetch Node→Go:
- New `go.mod` at `apps/news-fetch/`
- Port VPS-proxied news fetch (vneconomy-rss, vnexpress-rss, newsapi, news-vps) to Go HTTP client
- Playwright/chromium path: exclude from port; this source is served by mcp-server's existing chromium cron
- Implement `/health` endpoint; SQLite writes via modernc/sqlite (CGO=0)
- Full golangci-lint + depguard gate
- Preserve existing compose port mapping (5008)
- DoD: `go build ./...` exit 0 + golangci-lint exit 0 + unit test coverage of fetch paths

**GFD-10** (ops) — Deploy news-fetch (depends on GFD-9):
- Targeted build+up
- Verify `get_agent_signals` probe returns real data via mcp-server

**GFD-11** (qa) — Full fleet capability verification:
- Run capability_manifest probes for all 6 services
- Verify system-map `host_runtime_set.services` updated to include all 6
- Verify system-map `not_deployed_by_design` is empty
- Verify api-gateway `/health` returns all 6 services as healthy
- Report Axis-A status flip from INFO/grey → AVAIL PASS

**GFD-12** (po) — Sprint sign-off:
- Depends on GFD-11 QA pass
- system-map update: move 6 services from `not_deployed_by_design[]` → `services[]`
- quality-audit Axis-A checks flip
- Router push authorization

### Hard Constraints carried into all downstream tasks

- Targeted rebuild ONLY: `docker compose build <svc> && docker compose up -d --no-deps <svc>` — NEVER `docker compose down && up`
- HONOR-PANIC-GUARD: ops must run soak window per §c before marking any service DONE
- Factory v2 G12 gate + golangci-lint depguard on every Go service (stock-price, ta, kinh-dich, alert-engine, news-fetch)
- Commit owned paths only via explicit pathspec from repo ROOT; no `-a`/`-A`; no zone intruders
- DJ-GATE-1: every status flip must have a decision-journal STEP in the same commit
- No push — commit + report only; router owns push + live soak sign-off with user

---

## Summary

**rag strategy chosen:** Option (b) — keep rag as the lone Python service with a 512m/768m memory cap. Option (a) (Go wrapper + Python sidecar) rejected: adds IPC overhead, no memory saving, and new failure modes for an episodic-use service.

**news-fetch port scope:** Core RSS/API paths ported to Go (CGO=0, modernc/sqlite). Playwright/chromium scraping excluded — delegated to mcp-server's existing chromium path. Single Go binary serves port 5008.

**Footprint verdict:** Full fleet projects to ~2.0 GiB RSS, leaving ~5.8 GiB (74%) headroom — safe by a large margin even at 2x pessimistic estimates.

**First concrete task:** GFD-2 (dev-kinh-dich — pre-deploy gate) concurrent with GFD-3, GFD-4, GFD-5 and GFD-7 (dev-rag-service probe addition) and GFD-9 (developer — news-fetch port). WIP discipline: pm manages parallelism per CLAUDE.md WIP≤2 rule.
