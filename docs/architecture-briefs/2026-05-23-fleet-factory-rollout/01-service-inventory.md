---
title: "Fleet Factory Rollout — Service Inventory (Brownfield)"
date: "2026-05-23"
author: "architect"
status: "DRAFT"
parent: "00-roadmap.md"
survey_date: "2026-05-23"
---

# Service Inventory — Brownfield Survey

All service data sourced from `docs/data/system-map.json` via jq queries (never hardcoded).
Survey is READ-ONLY — no `apps/**` source was modified.

## Legend

- GREEN: factory-complete (all 12 G-goals achieved — can skip to dashboard wiring only if dashboard missing)
- YELLOW: partial — DDD structure exists, primitives/modules/sandbox partially done
- RED: untouched — no primitive decomposition, no sandbox, no dashboard

---

## 1. technical-analysis (port 5003 — Go)

| Attribute | Value |
|---|---|
| Language | Go (lang-lock applied) |
| Dev agent | `dev-technical-analysis` |
| DDD layers present | domain / application / infrastructure / interface (all in `pkg/`) |
| Primitive dirs | `pkg/primitive/bollinger_bands`, `detect_cross`, `macd`, `moving_average`, `rsi` — 5 primitives |
| Module dirs | `pkg/module/technical_analysis` — 1 module |
| Sandbox | `cmd/sandbox/main.go` (1541L) + `sandbox_test.go` (347L); compiled binary at `sandbox/` |
| Dashboard | `dashboard/index.html` (1729L) + full toolchain (`app.ts`, `rerun-handler.ts`, `build.sh`) |
| Fence linter | `golangci-lint + depguard` wired (G4 DONE per pilot closure) |
| Anchor | Frozen per pilot SSOT |
| G5 MCP rewire | DONE per pilot closure |
| Pilot SSOT | `docs/data/pilot-status.json` — status=DONE, verdict=scale |

**Verdict: GREEN** — factory complete, pilot closed 2026-05-23. Reference implementation. Do NOT re-pilot.

---

## 2. macro-indicators (port 5004 — Go)

| Attribute | Value |
|---|---|
| Language | Go (lang-lock applied from TA pilot lesson L1) |
| Dev agent | `dev-macro-indicators` |
| DDD layers present | domain / application / infrastructure / interface (all in `pkg/`) |
| Primitive dirs | `pkg/primitive/`: macro_carry_trade_signal, macro_gold_direction_classifier, macro_investment_clock, macro_oil_impact_classifier, macro_usdvnd_direction_classifier, macro_yield_spread_signal — 6 primitives |
| Module dirs | `pkg/module/macro_signals` — 1 module |
| Sandbox | `cmd/sandbox/main.go` — compiled and wired |
| Dashboard | `dashboard/index.html` (1876L) — rendered, present |
| Fence linter | Wired per Phase 2 plan (G4 target) |
| Anchor | Tracked in pilot-status-macro-indicators.json |
| G5 MCP rewire | Targeted in Phase 2 (P2-B1 completed per dev signals) |
| Pilot SSOT | `docs/data/pilot-status-macro-indicators.json` — status=DONE 2026-05-23T21:42:47Z, verdict=scale |

**Verdict: GREEN** — factory complete, second pilot closed 2026-05-23. Pattern proven twice. Do NOT re-pilot.

---

## 3. kinh-dich-service (port 5005 — TypeScript/Bun)

| Attribute | Value |
|---|---|
| Language | TypeScript (Bun runtime) |
| Dev agent | `dev-kinh-dich` |
| DDD layers present | `src/domain/`, `src/application/`, `src/infrastructure/`, `src/interface/` — all 4 layers |
| Primitive dirs | NONE — no `pkg/primitive/` |
| Module dirs | NONE — no `pkg/module/` |
| Sandbox | NONE |
| Dashboard | NONE |
| Fence linter | NONE (no ESLint import rules for DDD fence) |
| G5 MCP rewire | Unknown — mcp-server may still import domain directly |
| Notes | Was Phase 1 pilot target in original deep-module brief (`07-phases.md` §Phase 1 — kinh-dich). That plan was superseded when the actual pilot moved to technical-analysis. kinh-dich is TS, requires TS-specific fence tools (ESLint custom rule), not Go's depguard. |

**Verdict: RED** — untouched. Full 12-G-goal pilot required. Hexagram logic is the most knowledge-dense service — clean primitive decomposition (hexagram-resolver, trigram-classifier, etc.) is high-value.

---

## 4. stock-price (port 5000 — Go)

| Attribute | Value |
|---|---|
| Language | Go |
| Dev agent | `dev-stock-price` |
| DDD layers present | `pkg/domain/`, `pkg/application/`, `pkg/infrastructure/`, `pkg/interface/` — all 4 layers |
| Primitive dirs | NONE — no `pkg/primitive/` |
| Module dirs | NONE — no `pkg/module/` |
| Sandbox | NONE |
| Dashboard | NONE |
| Fence linter | NONE |
| Notes | Stock-price is primarily a data-fetching/aggregation service (fetchers.go in infrastructure). Domain has models, ports, services (price computation). Go service — depguard fence directly applicable. Clear primitive candidates: price-normalizer, ohlcv-aggregator, exchange-router. |

**Verdict: RED** — untouched. Full 12-G-goal pilot required. Go stack = same toolchain as proven pilots, low implementation risk.

---

## 5. alert-engine (port 5006 — Go)

| Attribute | Value |
|---|---|
| Language | Go |
| Dev agent | `dev-alert-engine` |
| DDD layers present | `pkg/domain/`, `pkg/application/`, `pkg/infrastructure/`, `pkg/interface/` — all 4 layers |
| Primitive dirs | NONE — no `pkg/primitive/` |
| Module dirs | NONE — no `pkg/module/` |
| Sandbox | NONE |
| Dashboard | NONE |
| Fence linter | NONE |
| Notes | Alert-engine contains meaningful domain logic: `evaluate.go` in application layer, `services.go` in domain. Primitive candidates: signal-evaluator, threshold-checker, alert-formatter. Go stack — depguard directly applicable. Critical service (stop-loss alerts) — sandbox zero-creds gate is especially important here (no Telegram credentials in sandbox). |

**Verdict: RED** — untouched. Full 12-G-goal pilot required. High-value: alert logic correctness is user-trust-critical.

---

## 6. pdf-extractor (port 5001 — Python/FastAPI)

| Attribute | Value |
|---|---|
| Language | Python 3.13 (FastAPI + aiohttp) |
| Dev agent | `dev-pdf-extractor` |
| DDD layers present | `domain/`, `application/`, `infrastructure/`, `interface/` — all 4 layers at top-level (not `pkg/`) |
| Primitive dirs | NONE |
| Module dirs | NONE |
| Sandbox | NONE |
| Dashboard | NONE |
| Fence linter | NONE — Python has no depguard equivalent proven in this codebase |
| Notes | YELLOW-leaning RED. DDD structure is correct Python layout. Primitive candidates: pdf-page-splitter, ocr-text-extractor, confidence-scorer, table-parser. The fence tool problem is unresolved: Python has no depguard analog. Options: pylint-import-linter or custom pytest fixture that checks import graph. Must be decided before G4 is credible. Python sandbox is pytest-based — zero-creds is achievable with monkeypatching. |

**Verdict: RED** — DDD structure present but no primitives/modules/sandbox/dashboard, and fence linter tooling for Python is UNDEFINED (blocker for G4). Requires pre-pilot decision on Python fence tool before charter can be written. Scope: defer until after at least one more Go pilot stabilizes the program.

---

## 7. rag-service (port 5002 — Python/FastAPI)

| Attribute | Value |
|---|---|
| Language | Python 3.13 (FastAPI) |
| Dev agent | `dev-rag-service` |
| DDD layers present | `domain/`, `application/`, `infrastructure/`, `interface/` — all 4 layers |
| Primitive dirs | NONE |
| Module dirs | NONE |
| Sandbox | NONE |
| Dashboard | NONE |
| Fence linter | NONE |
| Notes | Same Python fence problem as pdf-extractor. RAG domain logic: embedder.py (infrastructure), domain services for search/retrieval. Primitive candidates: embedding-normalizer, cosine-similarity-ranker, chunk-splitter. Depends on LanceDB — sandbox must mock LanceDB reads. Python sandbox with pytest monkeypatching is the approach. |

**Verdict: RED** — same Python fence blocker as pdf-extractor. Defer to same Python-track pilot (can run pdf-extractor + rag-service back-to-back once Python G4 tooling is decided).

---

## 8. news-fetch (port 5008 — TypeScript/Bun)

| Attribute | Value |
|---|---|
| Language | TypeScript (Bun) |
| Dev agent | `developer` (no dedicated zone specialist in system-map — cross-service fallback) |
| DDD layers present | `src/domain/`, `src/application/`, `src/infrastructure/scrapers/`, `src/interface/` — all 4 |
| Primitive dirs | NONE — no `pkg/primitive/` (TS equivalent) |
| Module dirs | NONE |
| Sandbox | NONE |
| Dashboard | NONE |
| Fence linter | NONE |
| Notes | news-fetch is primarily a scraper/crawler service. Domain logic is thin (models + repositories). Primitive candidates: article-deduplicator, headline-normalizer, source-router. TS ESLint fence rules apply. BUT: no dedicated dev zone specialist in system-map (specialist = `developer` generic). This means no named dev-news-fetch agent exists — piloting this service requires either assigning the generic `developer` agent or creating a dedicated `dev-news-fetch` agent. |

**Verdict: YELLOW** — DDD structure exists, but no primitives/modules/sandbox/dashboard. Additional blocker: no dedicated zone specialist. Recommend creating `dev-news-fetch` agent before piloting.

---

## 9. api-gateway (port 4000 — Go)

| Attribute | Value |
|---|---|
| Language | Go |
| Dev agent | `dev-api-gateway` |
| DDD layers present | `pkg/domain/`, `pkg/application/`, `pkg/infrastructure/`, `pkg/interface/` — all 4 layers |
| Primitive dirs | NONE (not a factory target) |
| Notes | Pure routing + health-aggregation service. Application layer = AggregateHealthUseCase (proxies health checks to all downstream services). Domain = AggregatedHealth model + AggregatorPort interface + registry. No business logic suitable for primitive decomposition — every "primitive" would be a trivial HTTP ping. Factory overhead >> value. |

**Verdict: OUT OF SCOPE** — routing layer, not a factory target. See `00-roadmap.md` §Scope Boundaries.

---

## 10. mcp-server (port 3000 — TypeScript/Bun)

| Attribute | Value |
|---|---|
| Language | TypeScript (Bun) |
| Dev agent | `dev-mcp-server` |
| DDD layers present | `src/domain/`, `src/application/`, `src/infrastructure/`, `src/interface/`, `src/scheduler/` |
| Notes | Orchestrator and MCP interface layer. Its role is to consume services via HTTP (the G5 rewire target). As each service pilot completes G5, mcp-server's direct domain imports for that service are replaced by HTTP client calls. The mcp-server is factored indirectly through every service's G5 gate — it does not need its own 12-G-goal charter. |

**Verdict: OUT OF SCOPE** — orchestrator/interface layer, not a factory target. G5 per-service rewires progressively clean it up.

---

## 11. frontend (port 3001 — TypeScript)

| Attribute | Value |
|---|---|
| Language | TypeScript (Vue/Nuxt, Playwright) |
| Dev agent | `dev-frontend` |
| Notes | UI rendering layer. Component architecture ≠ DDD primitives model. Trust layer = Playwright visual regression tests, not sandbox scenario pass/fail. Not applicable. |

**Verdict: OUT OF SCOPE** — UI layer, different trust model.

---

## Summary Table

| Service | Language | Port | Verdict | Dev Agent | Notes |
|---|---|---|---|---|---|
| technical-analysis | Go | 5003 | GREEN | dev-technical-analysis | Pilot 1 DONE |
| macro-indicators | Go | 5004 | GREEN | dev-macro-indicators | Pilot 2 DONE |
| kinh-dich-service | TS | 5005 | RED | dev-kinh-dich | No primitives/sandbox/dashboard |
| stock-price | Go | 5000 | RED | dev-stock-price | No primitives/sandbox/dashboard |
| alert-engine | Go | 5006 | RED | dev-alert-engine | No primitives/sandbox/dashboard |
| pdf-extractor | Python | 5001 | RED | dev-pdf-extractor | + Python fence blocker |
| rag-service | Python | 5002 | RED | dev-rag-service | + Python fence blocker |
| news-fetch | TS | 5008 | YELLOW | developer (no specialist) | + needs dev-news-fetch agent |
| api-gateway | Go | 4000 | OUT | dev-api-gateway | Pure router — excluded |
| mcp-server | TS | 3000 | OUT | dev-mcp-server | Orchestrator — excluded |
| frontend | TS | 3001 | OUT | dev-frontend | UI layer — excluded |

Factory-eligible services: **7 remaining** (5 RED + 1 YELLOW + 0 pending spec).
Two already GREEN (closed pilots). Three excluded from scope.
