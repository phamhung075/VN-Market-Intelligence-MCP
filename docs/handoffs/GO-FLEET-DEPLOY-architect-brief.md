# GO-FLEET-DEPLOY — Architect Design Brief (PO → agents-architect)

**Sprint:** GO-FLEET-DEPLOY
**From:** po (full autonomy; no user approval needed)
**To:** agents-architect — `run docs/agents/agents-architect/flow/main.md`
**Date:** 2026-06-10
**Decision journal:** `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-po.md`

---

## User directive (verbatim, two lines)
1. "i dont want it off need thinking too make working correct, maybe change architecture design."
2. "use go for make it litter" → USE GO to make the services LIGHTER so they can ALL genuinely run on the constrained host.

**Interpretation (PO-ratified):** The 6 services currently `not_deployed_by_design` must GENUINELY RUN as working, deployed containers. User explicitly authorizes ARCHITECTURE REDESIGN and explicitly directs PORTING TO GO as the lightening strategy. Go-port-then-deploy-all is the PRIMARY path and a HARD CONSTRAINT — not an option to weigh away. Fallbacks (formalize-monolith / scale-to-zero / VPS offload) may be discussed ONLY where a Go port is infeasible for a specific service.

---

## Scope: the 6 services (SSOT `system-map.json .host_runtime_set.not_deployed_by_design`)
`stock-price · technical-analysis · kinh-dich-service · alert-engine · rag-service · news-fetch`

## MEASURED EVIDENCE — already gathered live by PO. DO NOT RE-DERIVE.

### A. Footprint reality (router-measured, host = 16GB Mac, Docker VM cap ~7.8 GB)
- Docker steady-state NOW = ~1.4 GB / 7.8 GB ceiling → ~6.4 GB headroom.
- Per-container RSS: mcp-server (Node monolith) **914 MiB** (heaviest by 70-100x); pdf-extractor (Py) 144 MiB; headroom-proxy 274 MiB; frontend 49 MiB; mcp-gateway 23 MiB; macro-indicators (**Go**) **13 MiB**; api-gateway (**Go**, no-CGO) **9 MiB**.
- **THE GO PROOF IS IN THE FLEET:** the two smallest containers are the two Go services (9 & 13 MiB). 6 Go services @ ~10-20 MiB ≈ 60-120 MiB total — trivially within 6.4 GB headroom.

### B. Go-port maturity — PO verified on disk + live `go build ./...` (2026-06-10)
| Service | go.mod | main() | depguard `.golangci.yml` | `go build ./...` | Compose wired | Legacy still present | Verdict |
|---|---|---|---|---|---|---|---|
| **stock-price** | yes | `cmd/server/main.go` | yes | **exit 0** | yes (`:9xxx`) | package.json | **GO-READY** (CGO sqlite) |
| **technical-analysis** | yes | `cmd/server/main.go` | yes | **exit 0** | yes (`:162`) | package.json | **GO-READY** (pure-Go modernc sqlite, CGO=0) |
| **kinh-dich-service** | yes | `cmd/server/main.go` | yes | **exit 0** | yes (`:301`) | — | **GO-READY** (pure-Go, CGO=0) |
| **alert-engine** | yes | `cmd/server/main.go` | yes | **exit 0** | yes (`:333`) | — | **GO-READY** (CGO sqlite) |
| **news-fetch** | NONE | NONE | NONE | n/a | yes (`:366`, `:5008`) | package.json (Node) | **NOT STARTED** (1 stray .go) |
| **rag-service** | NONE | NONE | NONE | n/a | yes (`:129`, `:5002`) | requirements.txt (Py) | **PYTHON — Go-exception** |

**KEY RECONCILIATION vs the May-23 fleet-factory ratification** (`docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md`): that decision framed kinh-dich + news-fetch as **TS** pilots. Disk reality has since converged on Go-everywhere — kinh-dich is now a mature Go port that builds clean. The program direction already IS the user's directive. This sprint COMPLETES + DEPLOYS it; it does NOT re-port the 4 that build.

### C. Capability reality (SSOT `capability_manifest`, ground-truth 2026-06-02)
5/6 capabilities already serve LIVE from the mcp-server monolith (stock/ta(data_limited 30/35)/kinh-dich/alert/news). **Only rag-service is genuinely DARK** (probe_type:none — embedded in the 156 tool-count, never probed). So deploying the 5 Go services is largely about lifting capability OUT of the monolith into its own lean container; rag is the one new-capability stand-up.

### D. The rag problem (PO-flagged for architect to OWN explicitly)
rag compose reserves **1g / limits 1.5g** — that single Python service outweighs ALL 6 tiny Go binaries combined. LanceDB + embeddings are Python/Rust-native; a pure-Go port is high-risk and NOT in scope for a deploy sprint. PO candidate for architect to rule on: **lean Go HTTP service shelling to a thin Python embedding/LanceDB sidecar**, OR keep rag as the lone non-Go service with a tight memory cap. Architect MUST pick and justify.

---

## WHAT THE ARCHITECT BRIEF MUST DELIVER (→ `docs/architecture-briefs/2026-06-10-go-fleet-deploy/`)
1. **(a) Go-port status inventory** per service (use the table in §B as ground truth; correct if you find more).
2. **(b) Go-service-per-capability target topology:** port plan per service, the `dev-*` Go-zone owner for each (roster: dev-stock-price, dev-technical-analysis, dev-kinh-dich, dev-alert-engine, dev-news-fetch→`developer` if no dedicated agent, dev-rag-service), and the **rag exception strategy** decided explicitly. For the monolith: define how each capability moves OUT of mcp-server (or whether mcp-server keeps proxying during transition).
3. **(c) Footprint math + soak gate:** estimate full-Go-fleet RSS vs the 6.4 GB headroom; define the **HONOR-PANIC-GUARD soak test** — sustained-window host memory/swap watch with explicit ABORT criteria. **NEVER blind `docker compose up` the full fleet.** Targeted per-service bring-up only.
4. **(d) Per-service "working correctly" DoD:** container health 200 + live capability probe per `capability_manifest` (e.g. stock→get_market_snapshot, kinh-dich→get_portfolio_conviction, alert→get_alerts, news→get_agent_signals, ta→get_technical_indicators, rag→a NEW probe you must define since it's currently `none`).
5. **Route microservice-doc edits to the matching dev-\* zone owner** — never architect/generic-developer for a service that has a dedicated dev agent.

## HARD CONSTRAINTS (carry into every downstream task)
- Targeted rebuild ONLY — **never `down && up`** (kills peers ~21min; `project_rebuild_recreate_destroys_peers`).
- HONOR-PANIC-GUARD: soak-validate target topology (run + watch host mem/swap sustained, abort criteria) before "done" (`project_host_memory_panic`).
- Go services honor **Factory v2 G12 DoD gate + depguard** already in those pilots.
- Commit owned paths via **commit-mutex** from repo ROOT, explicit pathspec, never `-a`/`-A`. **DJ-GATE-1** on every status flip.
- You (and all downstream) do **NOT push** — emit commits + report back. Router owns push + raw-verify + the live soak sign-off with the user.
- Decision-journal every step (`sprint-GO-FLEET-DEPLOY-<agent-id>.md`).

## On success (PO sign-off criteria)
- system-map `host_runtime_set`: move now-running services from `not_deployed_by_design[]` → `services[]` (+ short_keys).
- quality-audit Axis-A checks flip INFO/grey → live AVAIL PASS for the deployed services.
- rag capability_manifest flips `dark` → live probe.

## Chain (WIP ≤ 2)
architect (this brief) → pm → dev-* Go zone owners (complete each port) + ops (targeted deploy + soak) → qa → PO sign-off → router push + live soak with user.

**RETURN to PO:** the Go-port target topology, the chosen rag strategy, the per-service port/deploy plan, and the first concrete dev/ops task to dispatch.
