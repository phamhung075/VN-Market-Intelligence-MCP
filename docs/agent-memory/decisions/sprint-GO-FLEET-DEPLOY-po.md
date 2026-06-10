# Decision Journal — Sprint GO-FLEET-DEPLOY · po

**Sprint goal:** Genuinely DEPLOY the 6 `not_deployed_by_design` services as lightweight working containers. User directive: redesign architecture if needed + PORT TO GO to make services lighter so the full fleet runs on the 16GB host without panic. Go-port is the PRIMARY path (hard constraint), not an option to weigh away.
**Agent:** po
**Started:** 2026-06-10T20:27:00Z

---

### STEP po-S1 · po · 2026-06-10T20:35:00Z
**task-id:** GO-FLEET-DEPLOY
**what-done:** Opened sprint; measured disk reality of all 6 not-deployed services before routing to architect (router handed footprint evidence; I verified Go-port maturity live).
**what-considered:**
- Trust router's "3 of 6 have Go pilots" framing as-is → REJECTED: stale. Disk shows 4 of 6 already have mature Go ports.
- Treat all 6 as greenfield Go ports → REJECTED: wasteful; 4 already build clean.
**why-decision:** Live `go build ./...` PASSES (exit 0) for stock-price, technical-analysis, kinh-dich-service, alert-engine — all have go.mod + cmd/server/main.go + .golangci.yml depguard. Only news-fetch (1 stray .go, no go.mod, still Node) and rag-service (pure Python/LanceDB) are genuinely non-Go. The May-23 fleet-factory ratification framed kinh-dich+news as TS pilots; program has since converged on Go-everywhere — exactly the user's directive. This sprint COMPLETES + DEPLOYS, it does not re-port what's done.
**why-change:** Sharper than the brief assumed: 4/6 Go-ready not 3/6. Reduces scope.

### STEP po-S2 · po · 2026-06-10T20:40:00Z
**task-id:** GO-FLEET-DEPLOY
**what-done:** Set rag-service as the designated Go-exception and named the HONOR-PANIC-GUARD soak gate as a hard DoD.
**what-considered:**
- Force rag to pure-Go → REJECTED: LanceDB + embeddings are Python/Rust-native; pure-Go port is high-risk and out of scope for a deploy sprint.
- Keep rag dark (status quo) → REJECTED: user wants ALL 6 running; rag is the only genuinely dark capability (no live probe).
- rag = lean Go HTTP service shelling to a thin Python embedding/LanceDB sidecar → CANDIDATE for architect to rule on.
**why-decision:** rag compose already reserves 1g / limits 1.5g — that one Python service outweighs all 6 tiny Go binaries combined (~60-120 MiB). It is the only real footprint + portability risk. Architect must own the rag strategy explicitly; the other 5 are a deploy+soak exercise.
**why-change:** no change from plan — matches router's rag caveat.

### STEP po-S3 · po · 2026-06-10T20:45:00Z
**task-id:** GO-FLEET-DEPLOY
**what-done:** Routed to ARCHITECT with full measured evidence packet; deferred all topology/footprint design to the architect brief; held WIP≤2 and respected the OPEN CI-RED-RECONCILE entry (did not clobber).
**what-considered:**
- Dispatch dev-* directly to deploy → REJECTED: user explicitly authorized architecture REDESIGN; that is the architect's gate, not PO's. Must not skip design.
**why-decision:** CLAUDE.md: router never implements; PO routes design work to architect first. The redesign authorization makes the architect brief mandatory before any dev/ops dispatch.
**why-change:** no change from plan.

### STEP po-S4 · po · 2026-06-10T22:46:57Z
**task-id:** GFD-12
**what-done:** SSOT graduation: system-map host_runtime_set now lists all 12 services (6 graduated in), not_deployed_by_design[] + not_deployed_short_keys[] emptied, _note rewritten + _last_verified=2026-06-11; flipped 6 materialized Axis-A AVAIL checks INFO/grey -> PASS/WARN.
**what-considered:**
- Hand-edit Axis-A vs assume derived-on-read -> VERIFIED first: quality-checklist.json holds 6 MATERIALIZED AVAIL entries (STOCK/TA/KINH/ALERT/RAG/NEWS-AVAIL-01) — NOT computed-on-read, so explicit edit required.
- Keep stale "kernel-panic / absent-by-design" _note -> REJECTED: disproven by GFD-6/8/10 soak (11 containers @ ~1.3-2.1 GiB << 8 GiB cap); rewrote honestly crediting the Go-port lightness + rag lazy-load.
**why-decision:** Ground truth (docker ps: all 6 Up+healthy) + GFD-11 qa-verify (6/6 /health 200) make the old premise factually wrong; SSOT must reflect proven reality, not legacy guard prose.
**why-change:** Axis-A path turned out MATERIALIZED-edit (not derived-auto) — adjusted from "verify-then-maybe-edit" to definite edit of 6 entries.

### STEP po-S5 · po · 2026-06-10T22:46:57Z
**task-id:** GFD-12
**what-done:** Added 2 infra-test backlog tasks (INFRA-TEST-TZ-FIX -> dev-alert-engine, INFRA-TEST-SEEDDATE-FIX -> dev-stock-price); set GFD-12 status_note with the remaining dispatch chain; HELD GFD-12 at READY (not DONE).
**what-considered:**
- Flip GFD-12 DONE now -> REJECTED: api-gateway /health still shows the 6 as not_deployed (hardcoded main.go:44 default + compose:280 ENV). DONE requires the code+compose root-cause fix (dev-api-gateway) + targeted rebuild (ops) + re-verify 6x ok — none done yet. Flipping now would be a false-green.
- Make the api-gateway main.go/docker-compose edit myself -> REJECTED: init.md hard rule "NEVER write production code"; api-gateway zone belongs to dev-api-gateway, HONOR-PANIC-GUARD rebuild belongs to ops.
**why-decision:** PO owns SSOT (system-map), quality-audit artifact, orch-state, backlog — all done. The runtime fix is a dev/ops dispatch the router must spawn; my surface lacks spawn + MCP-gateway tools, so I hand the exact edits + rebuild + verify gate back to the router and keep GFD-12 honest at READY.
**why-change:** Discovered my sub-agent surface has no spawn/gateway binding -> cannot self-dispatch dev-api-gateway/ops or take the commit-mutex; serialized PO commits myself (explicit pathspecs, git show --stat verify) and surfaced the binding gap.
