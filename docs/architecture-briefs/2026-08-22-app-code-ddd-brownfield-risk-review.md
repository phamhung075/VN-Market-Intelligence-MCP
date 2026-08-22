<!-- size-justification: ~95L — single brownfield risk-review brief covering an 11-service DDD
     boundary sweep + a 6-point ARCHITECTURE.md drift audit; splitting into per-service files would
     lose the cross-service comparison table that is this brief's main value (which services enforce
     their fence in CI vs which don't). -->
# UC-DDDRISK-P1 — Brownfield DDD Risk Review (apps/**) — Architect Design Brief

**Task:** `UC-DDDRISK-P1` (direct router/ultracode dispatch, not BA-initiated — sprint tag
`ULTRACODE-AUDIT-FIXALL`), zone `multi` (all 11 `apps/**` services + `docs/ARCHITECTURE.md`).
**Author:** architect · **Date:** 2026-08-22
**Scope (as dispatched):** domain-never-imports-infra violations, layering drift, and
stale/contradicted architecture docs vs current code reality. Analyze-and-document only — no
code edits, no `docs/architecture/microservice/<service>/` edits (dev-* owned, see doc-ownership
rule in `docs/references/agent-roster.md`).

## 1. DDD layering audit — RESULT: clean, zero live violations

| Service | Layer mechanism | Enforced in CI? | Live violations found |
|---|---|---|---|
| mcp-server (TS) | `eslint-plugin-boundaries` Fence-A/B | Yes (`mcp-server-eslint`) | 0 |
| news-fetch (TS) | `eslint-plugin-boundaries` Fence-A/B/C | Yes (`news-fetch-eslint`) | 0 |
| frontend (TS/Remix) | `eslint-plugin-boundaries` Fence-A/B/C | Yes (`frontend-eslint`) | 0 |
| api-gateway/stock-price/technical-analysis/macro-indicators/kinh-dich-service/alert-engine (Go) | `depguard` Fence-A/B/C (`.golangci.yml`) + `composition-root-logic-gate.go` | Yes (7 `*-go-lint` jobs incl. news-fetch's Go port + 1 `composition-root-logic-gate` job) | 0 |
| pdf-extractor (Python) | `import-linter` Fence-A/B/C (`pyproject.toml`) | Yes (`py-lint`, scoped to `apps/pdf-extractor`) | 0 |
| rag-service (Python) | `import-linter` Fence-A/C (`.importlinter` + `pyproject.toml` mirror) | **No — see Finding 1** | 0 (manually verified: `lint-imports --config pyproject.toml` → 3 kept, 0 broken) |

Verification method: grep for cross-layer import paths (`domain/` importing `infrastructure/`
etc.) across all 11 services (zero hits beyond doc-comment mentions), plus a live re-run of every
existing mechanized gate (`composition-root-logic-gate.go`, `no-hardcode-allowlist-scan.sh`,
`metric-mask-lint.sh`, `dead-code-gate.sh`, `shared-package-import-check.sh`) — all PASS, 0
offenders. No new domain-never-imports-infra debt found this cycle.

## 2. Finding 1 (actionable, code+CI) — rag-service import-linter fence unenforced

`apps/rag-service/pyproject.toml` (+ `.importlinter`) declares a real DDD-layer contract
("Fence-C: DDD layered architecture — domain is innermost, interface is outermost") but
`.github/workflows/ci.yml`'s only `py-lint` job scopes `lint-imports` to `apps/pdf-extractor`
alone (`working-directory: apps/pdf-extractor`) — rag-service's own fence has zero CI job running
it. Currently 0 violations (manually verified), so no live drift YET — but this is the identical
gap class `FACTORY-GUARD-CI-TSBOUNDARIES-IMPL` (2026-07-24) already fixed once for the 3 TS
services ("the gap this task closed was that ESLint never ran in CI at all"). Left unfixed, a
future rag-service commit can introduce a domain→infrastructure import with no gate to catch it.
**Minted:** `UC-DDDRISK-F1-RAGSVC-IMPORTLINTER-CI` (`task_board.backlog`, zone `apps/rag-service/`,
`next_agent=dev-rag-service`) — approach: extend the existing `py-lint` job with a second
`working-directory: apps/rag-service` step (mirrors the existing `pdf-extractor` step shape, same
job, no new job needed — both already `pip install import-linter` once), or split into 2 jobs if
Python-version pinning ever diverges between the two services. dod: `lint-imports` runs against
both services in CI; CI red on an injected synthetic domain→infrastructure import in rag-service.

## 3. Finding 2 (actionable, code cleanup) — apps/stock-price dead TS scaffold

`apps/stock-price/package.json` (`"module": "src/index.ts"`, scripts `start`/`test`/`check` all
invoking `bun run src/index.ts` / `bun test` / `bun tsc --noEmit`), `tsconfig.json` (`include:
["src/**/*", "__tests__/**/*"]`), and `bun.lock` are TS-era leftovers from before the service's
rewrite to Go — verified live: no `src/` or top-level `__tests__/` directory exists in the tree
today (`git ls-files` confirms both `package.json`/`tsconfig.json` ARE tracked; the directories
they reference are NOT), so every script in `package.json` would fail if invoked. Untouched since
the original `9d696ef70` "extract 4 TypeScript microservices with DDD + Hono" commit
(2026-05-11) predating the Go rewrite. **Not caught by `dead-code-gate.sh`'s Check-3** (its
`cmd/server + package.json + top-level src/` trigger requires `src/` to actually exist on disk —
here it doesn't, so the directory-shape predicate never fires; a distinct, narrower dead-artifact
shape than the one that check was built for). `technical-analysis/package.json` is a similar-looking
but legitimate exception (drives `dashboard/build.sh`, RAW-verified load-bearing per
`FACTORY-GUARD-CI-DEADCODE-IMPL`) — confirmed stock-price's own `Dockerfile` and CI job
(`stock-price-go-lint`) reference neither file, ruling out the same exception here.
**Minted:** `UC-DDDRISK-F2-STOCKPRICE-DEAD-SCAFFOLD` (`task_board.backlog`, zone
`apps/stock-price/`, `next_agent=dev-stock-price`) — approach: `git rm apps/stock-price/{package.json,tsconfig.json,bun.lock}`
after confirming (same RAW-verify bar as the sibling dead-code fixes) no CI job/Dockerfile/script
references them. dod: files removed, `stock-price-go-lint` + full CI suite still green, `docker
compose build stock-price` unaffected.

## 4. docs/ARCHITECTURE.md corrections — applied directly this cycle (architect SSOT write authority)

6 stale/missing points found and fixed live in the same cycle (no code change required, doc-only,
in scope for architect per `init.md`'s `docs/ARCHITECTURE.md` read+write authority): (1) 3 services
mis-labeled TypeScript/Bun, verified Go 1.22+CGO (technical-analysis/macro-indicators/
kinh-dich-service); (2) `frontend` (port 3001) entirely absent from the doc despite being live in
docker-compose.yml/system-map.json since Phase 3; (3) `news-fetch` missing from the
Microservices-Communication HTTP-downstream diagram; (4) stale "10 services" docker-compose count
(verified 12) and stale "9 services" restart-policy count (now points at the dynamic
`system-map.json` query instead of a second hardcoded number); (5) `packages/shared-*` described
as actively-used shared contracts — verified 0 importers repo-wide
(`shared-package-import-check.sh --check`), corrected to reflect the tracked
`FACTORY-SHARED-wire-or-prune-shared-packages` BACKLOG status; (6) **most significant** — the
VPS→Local-Docker diagram routed all 5 VPS systemd services to 4 *different* local services by
data-type association (e.g. `vn-bctc-fetch.service → PDF Extractor`); verified against
`apps/mcp-server/src/interface/mcp/server.ts` that ALL 5 VPS push endpoints
(`/api/push-prices`, `/api/push-bctc-pdf`, `/api/push-news`, `/api/push-sbv-rates`) are served by
MCP Server alone, which then fans out internally — the diagram had never reflected the actual
single-ingress-point topology the adjacent "zenmidi.com bridge" arrow already implied.

## RETURN
DONE: DDD layering review complete (0 live violations across 11 services); 2 actionable findings
minted as backlog rows; `docs/ARCHITECTURE.md` corrected in place this cycle.
ZONE: multi (apps/rag-service/, apps/stock-price/, docs/ARCHITECTURE.md)
NEXT: pm (routes `UC-DDDRISK-F1-RAGSVC-IMPORTLINTER-CI` → dev-rag-service, `UC-DDDRISK-F2-STOCKPRICE-DEAD-SCAFFOLD` → dev-stock-price, when promoted from backlog)
BUILD-STANDARD: not-applicable (both findings are bug-fix/tooling-scope, no new service/feature primitive)
