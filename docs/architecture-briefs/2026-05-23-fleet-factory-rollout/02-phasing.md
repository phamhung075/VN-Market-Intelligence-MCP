---
title: "Fleet Factory Rollout — Phased Pilot Sequence"
date: "2026-05-23"
author: "architect"
status: "DRAFT"
parent: "00-roadmap.md"
---

# Phased Pilot Sequence

## Shared Infrastructure Prework (Do Once Before Any Per-Service Pilot)

These items should be completed ONCE at program level before the third per-service pilot begins.
They reduce per-pilot overhead and enforce consistency across all future pilots.

### SI-1 — Fleet Pilot-Status SSOT Schema (1-2h, agent-father)

The TA pilot introduced `docs/data/pilot-status.json` and macro introduced `pilot-status-macro-indicators.json`.
A consistent per-service file schema must be defined once and reused for every pilot.

**Deliverable:** A `docs/data/pilot-status-schema.json` template (JSON Schema or example) that every future pilot
status file MUST conform to, with these standard fields:
- `pilot`, `charterRef`, `charterVersion`, `status`, `language`, `languageLockSource`
- `openedAt`, `closedAt`, `closedBy`, `closureSignal`, `closureDecisionDoc`
- `phase0`, `goals` (G1-G12 with status, verifiedAt, verifiedBy)
- `decisionMatrix` (speed/trust/scale verdicts + outcome)

**Owner:** agent-father (SSOT maintenance). Dev agent not involved.

### SI-2 — Fleet Dashboard Index (2-4h, dev-<svc> first pilot to complete)

A top-level `docs/dashboards/index.html` that links to each service's `apps/<svc>/dashboard/index.html`.
After each service pilot completes G6, the fleet index gains a new card.

**Structure:**
```
docs/dashboards/
└── index.html          ← master fleet index (cards per service)

apps/technical-analysis/dashboard/index.html     ← GREEN (exists)
apps/macro-indicators/dashboard/index.html       ← GREEN (exists)
apps/kinh-dich-service/dashboard/index.html      ← created at G6 for pilot 3
apps/stock-price/dashboard/index.html            ← created at G6 for pilot 4
...
```

The fleet index must be wired at pilot 3 G6 time and updated for each subsequent pilot.
**Owner:** dev agent for pilot 3 (kinh-dich). Template from TA dashboard build.sh pattern.

### SI-3 — TypeScript ESLint Fence Rule Definition (1 spike, before pilot 3)

Go services use `golangci-lint + depguard`. TypeScript services (kinh-dich, news-fetch, mcp-server)
need the equivalent: an ESLint rule that enforces Fence-A/B/C import isolation.

This was flagged in TA pilot brief `11-open-questions.md` §Phase 6 scope addition but not yet resolved.

**Decision needed (PO):**
- Option A: Custom ESLint plugin with import boundary rules (eslint-plugin-boundaries or custom)
- Option B: TypeScript path-alias restrictions via tsconfig + CI check
- Option C: Defer fence rule to G4 per-service (accept it's weaker for TS than Go)

**Owner:** architect designs, dev agent implements. Must be decided before pilot 3 charter is written.
**Blocks:** G4 gate for kinh-dich and news-fetch.

### SI-4 — Python Fence Tool Decision (1 spike, before Python pilots)

Python services (pdf-extractor, rag-service) have no proven G4 fence tool in this codebase.

**Options:**
- `import-linter` (Python package, supports contract enforcement between layers)
- `pylint` with custom checker
- `pytest-style` import graph assertion (test that fails on cross-layer imports)

**Owner:** architect designs (separate brief when Python track approaches). Not blocking Go/TS pilots.

### SI-5 — `dev-news-fetch` Agent File (0.5h, agent-father)

`system-map.json` shows news-fetch specialist = `developer` (generic).
A dedicated `dev-news-fetch` agent file must be authored before the news-fetch pilot begins.
This is the same pattern as dev-macro-indicators.md authored at macro Phase 0.

**Owner:** agent-father. Triggers: before news-fetch pilot charter.

---

## Pilot Sequence

### Priority Criteria Applied

1. **Go stack first** — same toolchain as proven pilots. Zero fence-tool risk. Fastest time-to-value.
2. **Business value** — user-trust-critical services (alert-engine) over data services (news-fetch).
3. **Domain richness** — services with more logic benefit more from primitive decomposition + dashboard trust.
4. **Dependency** — services with pending G5 rewires from mcp-server should be earlier (allows mcp-server to progressively clean up).
5. **Stack novelty** — TS services after Go consolidation; Python track deferred until SI-3/SI-4 resolved.

---

### Pilot 3 — kinh-dich-service (TS, port 5005)

**Rationale:** Was the ORIGINAL Phase 1 pilot target in the deep-module brief. Domain is rich (hexagram logic,
trigram classification, Kinh Dich calculation chains). Very suitable for primitive decomposition. High user-trust
value (user explicitly designed the system around hexagram insights). TS stack — requires SI-3 fence rule to be
designed first (can author charter before SI-3 is built, but G4 gate depends on it).

| Attribute | Value |
|---|---|
| Target service | `apps/kinh-dich-service/` |
| Dev agent | `dev-kinh-dich` |
| Language | TypeScript (Bun) |
| Estimated primitives | 4-6 (hexagram-resolver, trigram-classifier, palace-calculator, line-transformer, hexagram-library-lookup, reading-formatter) |
| Estimated modules | 1 (kinh-dich-engine, composing all primitives) |
| Sandbox approach | Bun test + narrator pattern; scenarios JSON in `cmd/sandbox/` equivalent |
| G4 blocker | SI-3 (TS ESLint fence rule) must be designed before G4 gate |
| Dependencies | SI-1 (schema), SI-2 (fleet index trigger), SI-3 (TS fence) |
| G5 scope | Verify whether mcp-server still imports kinh-dich domain directly; rewire if so |
| Charter file | `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` (to be created by PO) |
| Pilot status SSOT | `docs/data/pilot-status-kinh-dich.json` (to be created at Phase 0) |

**Pre-pilot gate:** SI-1 + SI-3 design decision must be done. SI-3 build can be in Phase 0.

---

### Pilot 4 — stock-price (Go, port 5000)

**Rationale:** Go stack — exact same toolchain as TA + macro. stock-price is a high-frequency service (price aggregation). Dashboarding the fetcher primitives (HOSE/HNX/UPCOM routing, OHLCV normalization) gives the user direct visibility into data quality. Domain logic in `pkg/domain/services.go` is the primitive target.

| Attribute | Value |
|---|---|
| Target service | `apps/stock-price/` |
| Dev agent | `dev-stock-price` |
| Language | Go |
| Estimated primitives | 3-5 (ohlcv-normalizer, exchange-router, price-aggregator, change-calculator, volume-classifier) |
| Estimated modules | 1 (stock-price-engine) |
| Sandbox approach | Go test + `cmd/sandbox/` pattern (identical to TA/macro) |
| G4 blocker | None — depguard proven |
| Dependencies | SI-1 (schema), pilot 3 completion recommended (TS pattern stabilized first) |
| G5 scope | mcp-server HTTP client for stock-price already in `infrastructure/microservices/clients.ts` — verify no direct domain imports remain |
| Charter file | `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` |
| Pilot status SSOT | `docs/data/pilot-status-stock-price.json` |

---

### Pilot 5 — alert-engine (Go, port 5006)

**Rationale:** Alert-engine contains the signal-evaluation domain logic — the most user-trust-critical service (stop-loss alerts). `evaluate.go` + `services.go` have clear primitive candidates. Go stack — zero new tooling. The G7 zero-creds gate is especially important: sandbox must NEVER have Telegram credentials. Dashboard showing which alert rules are active and their pass/fail is high-value for user trust.

| Attribute | Value |
|---|---|
| Target service | `apps/alert-engine/` |
| Dev agent | `dev-alert-engine` |
| Language | Go |
| Estimated primitives | 3-5 (signal-evaluator, threshold-checker, alert-formatter, cooldown-tracker, condition-chain) |
| Estimated modules | 1 (alert-rules-engine) |
| Sandbox approach | Go test + `cmd/sandbox/` pattern. Critical: zero Telegram credentials in sandbox process |
| G4 blocker | None — depguard proven |
| Dependencies | SI-1, pilots 3+4 recommended before (pattern at 4 consecutive services validates fleet) |
| G5 scope | Verify mcp-server alert evaluation path — mcp-server calls alert-engine via HTTP (confirmed in ARCHITECTURE.md: alert-engine POSTs to mcp-server). Rewire any remaining direct imports. |
| Charter file | `docs/architecture-briefs/2026-05-23-alert-engine-factory/pilot-charter.md` |
| Pilot status SSOT | `docs/data/pilot-status-alert-engine.json` |

---

### Pilot 6 — news-fetch (TS, port 5008)

**Rationale:** TS stack — positioned after kinh-dich (pilot 3) so the TS ESLint fence rule (SI-3) is proven before news-fetch starts. news-fetch domain logic is thinner than kinh-dich (mostly scraper coordination). Value of dashboard: shows which news sources are live/dead in the sandbox.

| Attribute | Value |
|---|---|
| Target service | `apps/news-fetch/` |
| Dev agent | `developer` (generic — SI-5 must create `dev-news-fetch` agent first) |
| Language | TypeScript (Bun) |
| Estimated primitives | 3-4 (headline-normalizer, source-router, article-deduplicator, publication-date-parser) |
| Estimated modules | 1 (news-aggregation-engine) |
| Sandbox approach | Same as kinh-dich TS pattern |
| G4 blocker | SI-3 (must be proven in pilot 3 first), SI-5 (dev-news-fetch agent) |
| Dependencies | SI-1, SI-3 (TS fence proven in pilot 3), SI-5 (agent file) |
| G5 scope | mcp-server news path — verify no direct domain imports |
| Charter file | `docs/architecture-briefs/2026-05-23-news-fetch-factory/pilot-charter.md` |
| Pilot status SSOT | `docs/data/pilot-status-news-fetch.json` |

---

### Pilot 7 — pdf-extractor (Python, port 5001)

**Rationale:** Deferred until SI-4 (Python fence tool) is resolved and proven. pdf-extractor has clean DDD layers. Domain primitives: pdf-page-splitter, ocr-extractor, confidence-scorer, table-parser. The Python sandbox approach (pytest monkeypatching for zero-creds) needs to be designed and proven ONCE before this pilot.

| Attribute | Value |
|---|---|
| Target service | `apps/pdf-extractor/` |
| Dev agent | `dev-pdf-extractor` |
| Language | Python 3.13 |
| Estimated primitives | 4-5 |
| Estimated modules | 1 (bctc-extraction-engine) |
| G4 blocker | SI-4 (Python fence tool decision + implementation) |
| Dependencies | SI-1, SI-4, pilots 3-6 (pattern mature) |
| Charter file | `docs/architecture-briefs/2026-05-23-pdf-extractor-factory/pilot-charter.md` |
| Pilot status SSOT | `docs/data/pilot-status-pdf-extractor.json` |

---

### Pilot 8 — rag-service (Python, port 5002)

**Rationale:** Same Python track as pdf-extractor. Can follow immediately after pilot 7 — same SI-4 tooling, same pytest sandbox pattern. RAG domain logic: embedder, similarity-ranker, chunk-splitter.

| Attribute | Value |
|---|---|
| Target service | `apps/rag-service/` |
| Dev agent | `dev-rag-service` |
| Language | Python 3.13 |
| Estimated primitives | 3-4 |
| Estimated modules | 1 (rag-retrieval-engine) |
| G4 blocker | SI-4 (proven in pilot 7) |
| Dependencies | SI-1, SI-4, pilot 7 (Python pattern proven) |
| Charter file | `docs/architecture-briefs/2026-05-23-rag-service-factory/pilot-charter.md` |
| Pilot status SSOT | `docs/data/pilot-status-rag-service.json` |

---

## Sequencing Diagram

```
NOW
 │
 ├─[SI-1] Fleet SSOT schema                     (agent-father, ~1-2h, do now)
 ├─[SI-3] TS ESLint fence design                (architect spike, ~2-4h, before pilot 3)
 │
 ├─[Pilot 3] kinh-dich-service   Go→TS          (dev-kinh-dich, 6-sprint charter)
 │   ├─ triggers SI-2 (fleet dashboard index at G6)
 │   └─ validates TS fence rule in production
 │
 ├─[Pilot 4] stock-price         Go              (dev-stock-price, 6-sprint charter)
 │   └─ can START after Pilot 3 Phase 0 clears (parallel if WIP permits)
 │
 ├─[Pilot 5] alert-engine        Go              (dev-alert-engine, 6-sprint charter)
 │   └─ can START after Pilot 4 Phase 0 clears
 │
 ├─[SI-5] dev-news-fetch agent                  (agent-father, ~0.5h, before pilot 6)
 ├─[Pilot 6] news-fetch          TS              (dev-news-fetch, 6-sprint charter)
 │
 ├─[SI-4] Python fence tool decision            (architect spike, before pilot 7)
 ├─[Pilot 7] pdf-extractor       Python          (dev-pdf-extractor, 6-sprint charter)
 └─[Pilot 8] rag-service         Python          (dev-rag-service, 6-sprint charter)

FLEET COMPLETE → all 8 service pilots closed → docs/dashboards/index.html = full fleet card view
```

**WIP rule:** Maximum 2 pilot charters ACTIVE simultaneously (one per dev-zone agent). Do not open pilot 5 charter until pilot 3 or 4 has cleared Phase 1.

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| SI-3 TS fence rule — ESLint boundary rules are complex to author correctly | HIGH | Architect designs rule + test in spike before pilot 3 charter. Accept weaker G4 for TS (Option C) if spike exceeds 1 sprint. |
| SI-4 Python fence — no proven tool | HIGH | Dedicate 1 architect spike before pilot 7. Pilots 3-6 (Go+TS) buffer time to resolve. |
| news-fetch has no dedicated dev agent | MEDIUM | SI-5 agent-father task. Blocks pilot 6 charter only, not pilots 3-5. |
| alert-engine sandbox: Telegram credentials must NEVER appear | HIGH | G7 AC explicitly requires `grep -r TELEGRAM` in sandbox env to return empty. Wired in charter Day 0. |
| stock-price DB isolation — CGO/SQLite | MEDIUM | stock-price uses named Docker volume (per ARCHITECTURE.md). Sandbox must not touch production DB_PATH. Standard zero-creds gate handles this. |
| Python services: pytest sandbox doesn't produce trace JSON for HTML renderer | MEDIUM | SI-4 spike must define Python-equivalent narrator pattern (JSON trace format). May differ from Go implementation. |
| Fleet dashboard index becomes stale if a pilot regresses a service | LOW | Fleet index re-renders from latest trace JSON at each pilot's G8. CI step added per pilot. |
