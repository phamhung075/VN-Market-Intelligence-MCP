# Architecture Brief — ARCH-1884: Forensic Analysis Host Decision

**Sprint:** ARCH-1884 (parallel, gates 1885 + 1886)
**Authored:** 2026-05-12
**Author:** Architect
**Status:** Ready for BA → PM handoff
**Gates:** Sprint 1885 (M-Score + F-Score), Sprint 1886 (BTN detectors)

---

## 1. Decision

**Option 3 — Hybrid.**

Pure-function forensic calculators (M-Score, F-Score, accruals) live inside `apps/mcp-server/src/domain/services/financial-reports/`; heuristic BTN trick-detectors (Cookie Jar, Big Bath, Big Bet, and eventually Virtual Capital) live in a new `apps/forensic-analysis/` microservice on port 5007. The two halves have fundamentally different complexity profiles: the calculators are deterministic formulas over BCTC rows already in SQLite (same-process direct DB read is correct), while the heuristic detectors require multi-quarter pattern matching and the Virtual Capital detector (Sprint 1887) will need its own graph storage, making an isolated service right for that growth trajectory.

---

## 2. Brownfield Scan

### Existing financial-reports domain (mcp-server)

| File | LOC | Role |
|---|---|---|
| `domain/services/financial-reports/ratioComputer.ts` | 208 | Pure function; 22+ ratios from BS+IS+CF |
| `domain/services/financial-reports/periodDeltaComputer.ts` | 148 | YoY/QoQ delta computation |
| `domain/services/financial-reports/balanceSheetExtractor.ts` | 814 | PDF regex extraction |
| `domain/services/financial-reports/incomeStatementExtractor.ts` | 516 | PDF regex extraction |
| `domain/services/financial-reports/cashFlowExtractor.ts` | 129 | PDF regex extraction |
| `domain/services/financial-reports/bctcValidator.ts` | 303 | Cross-field validation |
| `domain/services/financial-reports/financialFiguresValidator.ts` | 280 | Confidence scoring |

Total domain: ~3,225 LOC. Adding ~250 LOC of pure calculators (M-Score + F-Score + accruals = Sprint 1885) is well within the bounded context boundary — these are ratio computations, same family as `ratioComputer.ts`.

### Existing microservice pattern (technical-analysis reference)

`apps/technical-analysis/` uses: `domain/models.ts`, `domain/repositories.ts` (port interface), `domain/services.ts` (pure logic), `application/usecases.ts`, `application/dtos.ts`, `infrastructure/calculator.ts`, `infrastructure/repositories.ts` (SQLite adapter), `interface/handlers.ts` (Hono HTTP). ~9 files, ~400 LOC total for the skeleton. This is the established DDD scaffold for a new service.

### SQLite schema status

`financial_reports` table has `operating_cf` column. Sprint 1878 adds `operating_cash_flow` (confirm column name with BA — likely the same field or a rename). M-Score needs: `accounts_receivable`, `gross_profit`, `total_assets`, `current_assets`, `capex`, `depreciation` (via `depreciationAmortization` in IS), `operating_cf`. All present or being added by 1878. F-Score needs: `roe`, `operating_cf`, `total_assets`, `total_liabilities`, `current_ratio`, `gross_margin_pct`. All present in existing schema.

### Port inventory (Docker Compose)

| Port (host:container) | Service |
|---|---|
| 3000:3000 | mcp-server |
| 5001:5001 | pdf-extractor |
| 5002:5002 | rag-service |
| 5003:5003 | technical-analysis |
| 5004:5004 | macro-indicators |
| 5010:5000 | stock-price |
| 4000:4000 | api-gateway |
| 5005:5005 | kinh-dich-service |
| 5006:5006 | alert-engine |
| **5007:5007** | **forensic-analysis (new)** |

---

## 3. Bounded Context Map

### What stays in `apps/mcp-server/src/domain/services/financial-reports/`

These are pure-function ratio computations over BCTC rows. Same data model, same DB access pattern, zero new I/O. Extending the existing bounded context is correct — no DDD violation.

| New file | Purpose |
|---|---|
| `mScoreComputer.ts` | Beneish 8-ratio model → M-Score float + flag (Sprint 1885) |
| `fScoreComputer.ts` | Piotroski 9-binary-criterion model → F-Score int (Sprint 1885) |
| `accrualsTrendComputer.ts` | NI − OCF per quarter over N quarters → accruals series + trend flag (Sprint 1878 already in scope) |

New MCP tool handlers for these live in `apps/mcp-server/src/interface/mcp/tools/financial-reports/forensicTools.ts` (new file, registered in `server.ts`).

### What goes to new `apps/forensic-analysis/` service (port 5007)

Heuristic detectors require reading patterns across ≥4 quarters, applying judgment thresholds, and — for Virtual Capital (Sprint 1887) — maintaining a related-party graph. These are behavioural detectors, not ratio calculators. Isolating them:
- Allows Sprint 1887 to add LanceDB or a lightweight graph store without touching the mcp-server.
- Keeps heuristic code versioned independently (BTN detectors evolve as new accounting tricks emerge).
- Prevents mcp-server memory growth from graph traversal in Sprint 1887.

| Module | Sprint |
|---|---|
| Cookie Jar Reserves detector | 1886 |
| The Big Bath detector | 1886 |
| Big Bet on the Future detector | 1886 (can be deferred to 1886b if needed) |
| Virtual Capital / related-party graph | 1887 (XL, deferred) |

---

## 4. MCP Tool Surface

All four tools are registered on `mcp-server` (the single MCP interface boundary). The forensic-analysis service is called via HTTP — the same pattern used for TA, macro, alert-engine. Tool names are snake_case per existing convention.

| Tool name | Params | Behaviour | Host |
|---|---|---|---|
| `compute_m_score` | `ticker: string` | Fetch 2 most recent quarters from `financial_reports` (current + prior period for delta ratios), compute all 8 Beneish components, return M-Score float + `elevated_risk: boolean` (threshold > −1.78) | mcp-server direct DB read → domain service |
| `compute_f_score` | `ticker: string` | Fetch current + prior quarter, compute 9 Piotroski binary criteria, return F-Score int (0–9) + `weak_quality: boolean` (score ≤ 3) | mcp-server direct DB read → domain service |
| `compute_accruals_trend` | `ticker: string`, `quarters?: number = 8` | Fetch N quarters ordered by `sort_key DESC`, compute `accruals = net_profit − operating_cf` per quarter, return series + `persistent_positive: boolean` (≥3 consecutive positive accruals) | mcp-server direct DB read → domain service |
| `detect_btn_tricks` | `ticker: string`, `quarters?: number = 8` | HTTP POST to forensic-analysis service → heuristic scan of N quarters for Cookie Jar / Big Bath / Big Bet patterns, return `{ tricks_detected: string[], details: Record<string, string> }` | mcp-server → HTTP → forensic-analysis:5007 |

HTTP client stub (`clients.ts` extension):

```
POST http://forensic-analysis:5007/detect-btn
Body: { ticker, quarters }
Response: { tricks_detected: string[], details: Record<string, string>, computed_at: string }
```

MCP tool handler file: `apps/mcp-server/src/interface/mcp/tools/financial-reports/forensicTools.ts`.

---

## 5. Data Flow

### Sprints 1885 + 1886 (calculators — mcp-server direct)

```
financial-analyst agent
  → MCP call: compute_m_score("VCB")
  → mcp-server interface layer (forensicTools.ts)
  → application use case: getForensicMetrics(ticker)
  → domain service: mScoreComputer.ts (pure function)
  → infrastructure: SqliteFinancialReportRepository.getLatestN(ticker, 2)
     → SELECT * FROM financial_reports WHERE action_code = ? ORDER BY sort_key DESC LIMIT 2
  ← return M-Score + flag
```

No cross-service HTTP for Sprint 1885 calculators. Direct SQLite read via the established repository port (`infrastructure/db/repositories/`). Same `getDb()` singleton pattern used by all other mcp-server tools.

**Sprint 1878 dependency:** `operating_cash_flow` (or `operating_cf` — confirm column name) must exist before Sprint 1885 starts. If Sprint 1878 renames the column, `accrualsTrendComputer.ts` must use the new name. BA must add an explicit AC on Sprint 1885: "operating_cash_flow column exists in financial_reports."

### Sprint 1886 (BTN detectors — cross-service HTTP)

```
financial-analyst agent
  → MCP call: detect_btn_tricks("VCB", 8)
  → mcp-server interface layer (forensicTools.ts)
  → HTTP POST to forensic-analysis:5007/detect-btn
  → forensic-analysis service:
      application use case: detectBtnTricks(ticker, quarters)
      → HTTP GET to mcp-server:3000/internal/financial-reports?ticker=VCB&limit=8
         (or direct DB read if forensic-analysis shares the market_data named volume)
      domain services: cookieJarDetector.ts, bigBathDetector.ts, bigBetDetector.ts
  ← JSON response: { tricks_detected, details, computed_at }
  ← MCP tool formats for agent consumption
```

**Data access for forensic-analysis service:** Two viable approaches — (a) the service reads `financial_reports` directly via the shared `market_data` Docker named volume (same SQLite file, read-only mount), or (b) it calls an mcp-server internal HTTP endpoint. Option (a) is simpler and avoids circular HTTP; option (b) is cleaner DDD but adds a hop. **Recommendation: option (a), read-only SQLite mount.** The DB is already shared across mcp-server (read-write) and all other services that need it. Set the mount as `:ro` in docker-compose to make the intent explicit.

---

## 6. Test Strategy

Following `reference_ddd_microservices.md` three-tier model.

### Sprint 1885 — calculators (mcp-server extension)

| Tier | What | Where |
|---|---|---|
| Unit | `mScoreComputer.ts`, `fScoreComputer.ts`, `accrualsTrendComputer.ts` — pure functions, fixture data, zero I/O | `apps/mcp-server/src/__tests__/domain/forensic/` |
| Unit | Edge cases: all-zero income (broken extraction), missing prior-period row, null operating_cf | same |
| Integration | `forensicTools.ts` handler: inject mock `SqliteFinancialReportRepository`, verify MCP output shape | `apps/mcp-server/src/__tests__/interface/forensicTools.test.ts` |
| E2E | `compute_m_score("VCB")` against in-memory SQLite seeded with 2 quarters of realistic fixture data | `apps/mcp-server/src/__tests__/e2e/forensic.e2e.test.ts` |

Estimated: ~30 unit tests + ~8 integration + ~3 e2e. Net test delta: ~41 tests. Budget is healthy (base: 5,922).

### Sprint 1886 — BTN detectors (new service)

| Tier | What | Where |
|---|---|---|
| Unit | `cookieJarDetector.ts`, `bigBathDetector.ts`, `bigBetDetector.ts` — pure logic, fixture arrays | `apps/forensic-analysis/src/__tests__/domain/` |
| Unit | Edge: fewer than 4 quarters (insufficient history → return `insufficient_data`), all-zero provision fields | same |
| Integration | Hono handler `POST /detect-btn`: inject mock repo, verify response schema | `apps/forensic-analysis/src/__tests__/interface/` |
| E2E | `detect_btn_tricks` MCP tool → HTTP → local forensic-analysis service → seeded SQLite | `apps/mcp-server/src/__tests__/e2e/btnDetection.e2e.test.ts` |

Estimated: ~25 unit + ~6 integration + ~2 e2e. Net test delta: ~33 tests.

**Total cross-sprint test delta: ~74 tests** → projected base: ~5,996.

---

## 7. Forward Look — Sprint 1887 (Virtual Capital + Related-Party Graph)

Virtual Capital detection requires tracking circular fund flows across related entities — a graph problem, not a ratio problem. The new `apps/forensic-analysis/` service is the correct host. Sprint 1887 work:

1. Add LanceDB (already in `rag-service`, so the Docker image pattern exists) **or** use SQLite with an adjacency-list table. Recommendation: start with SQLite adjacency list (simpler, no new dependency); upgrade to LanceDB only if query performance becomes a problem at scale.
2. New table: `related_party_flows (id, ticker, counterparty, flow_date, amount, flow_type, quarter)` in `forensic-analysis`'s own DB volume (`forensic_data:/app/data`), separate from `market_data`. This keeps forensic storage isolated.
3. New HTTP endpoint: `POST /detect-virtual-capital` → graph traversal → circular flow detection.
4. New MCP tool: `detect_virtual_capital(ticker, quarters)` — registered on mcp-server, calls forensic-analysis:5007.

**Sprint 1887 can be scoped independently without touching mcp-server domain code or forensic-analysis BTN code.** The service boundary is clean.

The forensic-analysis service will then expose three endpoint families:
- `/detect-btn` (Sprint 1886)
- `/detect-virtual-capital` (Sprint 1887)
- `/health` (always present)

---

## 8. Risks

### R1 — Sprint 1878 column name dependency (HIGH — gates 1885)

`compute_accruals_trend` and `compute_m_score` both read `operating_cash_flow` (or `operating_cf` — the existing column name in `financial_reports`). If Sprint 1878 adds a new column with a different name and the old column is not renamed atomically, Sprint 1885 calculators will silently read stale data.

**Mitigation:** BA must add explicit AC on Sprint 1885: "Sprint 1878 `operating_cash_flow` column is present in `financial_reports` at Sprint 1885 start." Dev adds a startup check (PRAGMA table_info assertion) in `accrualsTrendComputer.ts`.

### R2 — M-Score accuracy on VN BCTC data (MEDIUM)

Beneish M-Score was calibrated on US GAAP data. Vietnamese BCTC uses VAS (Vietnamese Accounting Standards). Two components are at risk:
- **AQI (Asset Quality Index)**: requires long-term assets / total assets two periods back. The ratio is valid in VAS but "soft assets" (intangibles, deferred charges) classification differs.
- **TATA (Total Accruals to Total Assets)**: Beneish uses balance-sheet accruals method; this codebase has `operating_cf` which enables the cash-flow accruals method. Use cash-flow method — it is more reliable and avoids VAS balance-sheet ambiguity.

**Mitigation:** `mScoreComputer.ts` must document which formula variant it uses. BA spec for Sprint 1885 should call out the cash-flow TATA variant explicitly.

### R3 — SQLite concurrent read from two containers (LOW)

`forensic-analysis` reads `market_data` volume in read-only mode while `mcp-server` writes it. SQLite WAL mode supports concurrent readers without blocking writes. Confirm WAL is enabled on `market.db` (check `PRAGMA journal_mode` — likely already WAL given the corruption-fix work in Sprint 1336). If not, developer must enable WAL before Sprint 1886 ships.

### R4 — Port 5007 not yet registered in api-gateway health check (LOW — administrative)

The api-gateway fans health checks to all configured downstream services. Adding `forensic-analysis:5007` to the gateway health fan-out is a 1-line config change. Must be included in Sprint 1886 scope to avoid a "service count drift" flag on the next architecture audit.

### R5 — `detect_btn_tricks` latency budget (LOW)

Scanning 8 quarters of data for 3 heuristic patterns over HTTP adds ~20–50ms to the MCP tool round-trip. Acceptable for a forensic gate (not a real-time alert path). If future detectors require scanning 20+ quarters, add a result cache layer (SQLite table in forensic-analysis DB: `btn_cache (ticker, computed_at, result_json)`). Not needed for Sprint 1886 scope.

### R6 — Tool naming collision (LOW)

`compute_accruals_trend` is listed in the brief as a Sprint 1878 deliverable. If Sprint 1878 ships it under a different name, Sprint 1885 must coordinate the name. BA must align tool names across both sprint specs before either starts.

---

## 9. Files to Create / Modify

### Sprint 1885

| Action | Path | Notes |
|---|---|---|
| CREATE | `apps/mcp-server/src/domain/services/financial-reports/mScoreComputer.ts` | Pure function, no I/O |
| CREATE | `apps/mcp-server/src/domain/services/financial-reports/fScoreComputer.ts` | Pure function, no I/O |
| CREATE | `apps/mcp-server/src/domain/services/financial-reports/accrualsTrendComputer.ts` | Pure function, no I/O (if not already created by 1878) |
| CREATE | `apps/mcp-server/src/interface/mcp/tools/financial-reports/forensicTools.ts` | MCP tool handlers for compute_m_score, compute_f_score, compute_accruals_trend |
| MODIFY | `apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts` | Export forensicTools |
| MODIFY | `apps/mcp-server/src/server.ts` | Register forensicTools on McpServer instance |
| CREATE | `apps/mcp-server/src/__tests__/domain/forensic/mScore.test.ts` | Unit tests |
| CREATE | `apps/mcp-server/src/__tests__/domain/forensic/fScore.test.ts` | Unit tests |
| CREATE | `apps/mcp-server/src/__tests__/domain/forensic/accruals.test.ts` | Unit tests |
| CREATE | `apps/mcp-server/src/__tests__/interface/forensicTools.test.ts` | Integration tests |

### Sprint 1886

| Action | Path | Notes |
|---|---|---|
| CREATE | `apps/forensic-analysis/` | New microservice root (scaffold from technical-analysis pattern) |
| CREATE | `apps/forensic-analysis/src/domain/services/cookieJarDetector.ts` | Heuristic, pure function |
| CREATE | `apps/forensic-analysis/src/domain/services/bigBathDetector.ts` | Heuristic, pure function |
| CREATE | `apps/forensic-analysis/src/domain/services/bigBetDetector.ts` | Heuristic, pure function |
| CREATE | `apps/forensic-analysis/src/infrastructure/repositories.ts` | SQLite read-only adapter (market.db) |
| CREATE | `apps/forensic-analysis/src/interface/handlers.ts` | Hono: POST /detect-btn, GET /health |
| CREATE | `apps/forensic-analysis/src/index.ts` | Service entrypoint |
| CREATE | `apps/forensic-analysis/Dockerfile` | Bun image, port 5007 |
| MODIFY | `docker-compose.yml` | Add forensic-analysis service, port 5007, market_data volume :ro |
| MODIFY | `apps/mcp-server/src/infrastructure/microservices/clients.ts` | Add `detectBtnTricks()` HTTP client |
| MODIFY | `apps/mcp-server/src/interface/mcp/tools/financial-reports/forensicTools.ts` | Add detect_btn_tricks tool |
| MODIFY | `apps/mcp-server/src/infrastructure/microservices/clients.ts` | Add forensic-analysis base URL + env var `FORENSIC_ANALYSIS_URL` |

---

## 10. DDD Layer Assignment

| Component | Layer |
|---|---|
| `mScoreComputer.ts`, `fScoreComputer.ts`, `accrualsTrendComputer.ts` | Domain — Services |
| `cookieJarDetector.ts`, `bigBathDetector.ts`, `bigBetDetector.ts` | Domain — Services (forensic-analysis service) |
| `SqliteFinancialReportRepository` (existing) | Infrastructure — DB Repositories |
| `forensic-analysis/infrastructure/repositories.ts` | Infrastructure — DB Repositories (read-only) |
| `forensicTools.ts` (mcp-server) | Interface — MCP Tools |
| `forensic-analysis/interface/handlers.ts` | Interface — HTTP Handlers |
| `clients.ts` extension (`detectBtnTricks`) | Infrastructure — Microservice Clients |

No domain service may import from infrastructure. All DB access flows through repository port interfaces. This matches the canonical pattern enforced since Sprint 1839a.
