<!-- size-justification: index only — points to canonical sources, no goal duplication. -->
# Scale Rollout — Three-Tier-Trust Refactor

The technical-analysis pilot is **DONE** (verdict=`scale`, `docs/data/pilot-status.json`). This directory rolls the proven 12-goal three-tier-trust pattern out to every other microservice. **Each service is driven from its OWN Claude Code terminal by its `dev-<service>` specialist.**

## Canonical sources (do NOT duplicate per service)
- **G1–G12 + Decision Matrix + Security Clause + Baseline Capture:** `../pilot-charter.md`
- **Phase plan:** `../07-phases.md` · **QA gates:** `../qa-gates/`
- **The 12 goals are language-agnostic and universal.** Per-service charters document deltas ONLY.

## Per-service charters + status files
| Service | Charter | Status file | Owner | Lang | Order |
|---|---|---|---|---|---|
| macro-indicators | `macro-indicators-charter.md` | `docs/data/refactor-status-macro-indicators.json` | dev-macro-indicators | Go | **FIRST** |
| stock-price | `stock-price-charter.md` | `docs/data/refactor-status-stock-price.json` | dev-stock-price | Go | wave |
| kinh-dich-service | `kinh-dich-service-charter.md` | `docs/data/refactor-status-kinh-dich-service.json` | dev-kinh-dich | Go (pivot) | wave |
| alert-engine | `alert-engine-charter.md` | `docs/data/refactor-status-alert-engine.json` | dev-alert-engine | Go | wave |
| api-gateway | `api-gateway-charter.md` | `docs/data/refactor-status-api-gateway.json` | dev-api-gateway | Go | wave (after macro) |
| pdf-extractor | `pdf-extractor-charter.md` | `docs/data/refactor-status-pdf-extractor.json` | dev-pdf-extractor | Python | wave |
| rag-service | `rag-service-charter.md` | `docs/data/refactor-status-rag-service.json` | dev-rag-service | Python | wave |
| frontend | `frontend-charter.md` | `docs/data/refactor-status-frontend.json` | dev-frontend | TS (Remix) | wave |
| news-fetch | `news-fetch-charter.md` | `docs/data/refactor-status-news-fetch.json` | developer | TS | wave |
| **mcp-server** | `mcp-server-charter.md` | `docs/data/refactor-status-mcp-server.json` | dev-mcp-server | TS (Bun) | **LAST — RUN-SOLO** |

## technical-analysis (PILOT) — DONE, no charter
12/12 goals YES, verdict=`scale`. **Closeout remainder:** G9 and G12 were graded PASS via the pilot's terminal close, but two OPTIONAL closeout follow-ups remain from `pilot-status.json` phase2.closure_summary.post_close_followups: (a) G9/G12 evidence durability — the G9 Playwright artifact was ephemeral and G12's 3-task streak (P2-F3) closed atomically; confirm both are captured in the TA dashboard before TA is cited as the scale exemplar; (b) the OPTIONAL charter §Decision-Matrix amendment + Phase-2 TASKS archive. These are TA-pilot housekeeping, NOT new scale work.

## Parallel-safety
Each service writes ONLY its own `refactor-status-<service>.json` — never the shared `pilot-status.json` — so parallel terminals never clobber each other. **mcp-server runs SOLO, LAST** (shared-substrate write surface + ~132-tool barrel churn).
