# UC-DDDRISK-P1 — Brownfield DDD Risk Review (apps/**)

**Origin:** direct router/ultracode dispatch (not a BA spec — no BA step this cycle), sprint tag
`ULTRACODE-AUDIT-FIXALL`. Scope: brownfield DDD risk review of `apps/**` — domain-never-imports-
infra violations, layering drift, stale/contradicted architecture docs vs current code reality.

## [Architect] Brownfield Findings

- **Zone:** multi — `apps/rag-service/`, `apps/stock-price/`, `docs/ARCHITECTURE.md` (doc-only,
  applied directly this cycle)
- **Verified paths:**
  - `apps/rag-service/pyproject.toml` / `apps/rag-service/.importlinter` — DDD-layer contract
    declared, 0 live violations (`lint-imports --config pyproject.toml` → 3 kept, 0 broken)
  - `.github/workflows/ci.yml:371-385` (`py-lint` job) — scopes `lint-imports` to
    `apps/pdf-extractor` only; rag-service's own fence has no CI job
  - `apps/stock-price/package.json`, `apps/stock-price/tsconfig.json`, `apps/stock-price/bun.lock`
    — tracked, dead: reference a `src/`/`__tests__/` tree that no longer exists (Go rewrite
    superseded the original TS service, `9d696ef70`, 2026-05-11)
  - `apps/mcp-server/src/interface/mcp/server.ts:680,708,750,756,762` — all 5 VPS push endpoints
    (`/api/watchlist`, `/api/push-prices`, `/api/push-bctc-pdf`, `/api/bctc-fetch-queue`,
    `/api/push-sbv-rates`) confirmed served by MCP Server alone
- **Reuse patterns:**
  - Finding 1 mirrors the already-shipped `FACTORY-GUARD-CI-TSBOUNDARIES-IMPL` pattern (extend
    the existing `py-lint` job with a second `working-directory` step) rather than inventing a new
    CI mechanism
  - Finding 2 follows the same RAW-verify-then-delete bar `FACTORY-GUARD-CI-DEADCODE-IMPL` used
    for `apps/technical-analysis`'s prior TS-scaffold cleanup
- **Design decisions:**
  - Finding 1: extend `py-lint`'s existing job with a second `lint-imports` step scoped to
    `apps/rag-service` (same job, no new job, no new toolchain install)
  - Finding 2: `git rm` the 3 dead files after confirming zero CI/Dockerfile/script references
    (already confirmed this cycle — see brief §3)
  - Both findings routed to their `dev-*` specialist per `zone-detect` (Tier-1 explicit zone
    match: `apps/rag-service/` → `dev-rag-service`, `apps/stock-price/` → `dev-stock-price`)
  - `docs/ARCHITECTURE.md` corrections applied directly this cycle — in scope per architect
    `init.md`'s `docs/ARCHITECTURE.md` read+write authority; NO edits made to any
    `docs/architecture/microservice/<service>/` file (dev-* owned per doc-ownership rule)
- **Full design + evidence:** `docs/architecture-briefs/2026-08-22-app-code-ddd-brownfield-risk-review.md`
- **Scan clean:** false — 2 actionable findings (Findings 1/2 above), both minted as backlog rows;
  0 DDD golden-rule (domain-never-imports-infrastructure) violations found live across any of the
  11 `apps/**` services

**Standard Detection:** BUG-FIX / REFACTOR (in-zone, no new primitives) — `BUILD-STANDARD: not-applicable`

## RETURN
DONE: Technical design complete, brownfield findings written to docs/handoffs/UC-DDDRISK-P1.md
ZONE: multi
NEXT: pm | route UC-DDDRISK-F1-RAGSVC-IMPORTLINTER-CI to dev-rag-service, UC-DDDRISK-F2-STOCKPRICE-DEAD-SCAFFOLD to dev-stock-price, when promoted from backlog
HANDOFF: docs/handoffs/UC-DDDRISK-P1.md
PIPELINE: continue
