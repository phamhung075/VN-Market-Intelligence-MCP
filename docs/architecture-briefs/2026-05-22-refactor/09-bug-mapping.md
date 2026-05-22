# Bug / Problem Mapping — Refactor Payoff

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

This is the highest-value section for the user. It proves the refactor pays for itself by making recurring bugs structurally impossible — not just patching them.

Sources read: agent notebooks, docs/signals/DASHBOARD.md, git log (2026-04-01 onward, 1723 commits), system-map anomalies.

---

## Bug Map

### BUG-001: `dailyDashboardJob` ENOENT `/docs/data/project-stats.json` (5 days)

**Tier:** Cross-cutting (path hardcode pattern — same anti-pattern as janitor job 1965d-JANITOR-PATHFIX)  
**Root cause:** Job uses a hardcoded absolute path `/docs/data/project-stats.json` instead of the canonical `getProjectRoot()` helper. When Docker container mounts the volume at a different absolute path, the file is not found.  
**How refactor kills it:** P-2 (Port-Driven Score) at L2 makes it structurally impossible for any primitive or service to read `process.env` or hardcode paths. Config/paths must flow through a config port injected at the composition root. Any job that tries to hardcode a path will fail the import-graph check before it reaches production.  
**Recurrence prevention metric:** P-2 at L2 on the job's owning primitive; S-1 composition root at L2 ensures all paths come from the wired config adapter.  
**Phase that resolves it structurally:** Phase 0 (immediate fix); Phase 4 (S-1 composition root makes the structural prevention permanent).

---

### BUG-002: SQLite Scan order in GetHistory — `close=0` bug (TASK-1971)

**Tier:** Primitive — `stock-price` Go service, `GetHistory` query  
**Root cause:** SQLite `Scan()` reads columns in the wrong order; `close` field receives 0 because it picks up a different column. The Go struct binding was misaligned with the SELECT column order.  
**How refactor kills it:** At the primitive tier, each primitive has a dedicated port interface for its data access. The port's contract is tested via scenario JSON — scenario includes expected `close` values. If the Scan order is wrong, the scenario assertion catches it immediately. P-4 (scenario coverage) at L2 with edge cases (including zero-close candles) makes this class of bug surface in CI before production.  
**Recurrence prevention metric:** P-4 scenario coverage at L2 on `stock-price` price-fetch primitive; explicit `close: 28500` assertion in scenario JSON.  
**Phase:** Phase 2 (primitive extraction with scenarios).

---

### BUG-003: VnDirect OHLCV null-coercion — missing OHLC fields (TASK-1972)

**Tier:** Primitive — `stock-price` data ingestion  
**Root cause:** VnDirect API occasionally returns records with null/missing OHLC fields. The ingestion code did not validate these before writing to DB, creating corrupt records. Fixed by skipping records with missing OHLC fields.  
**How refactor kills it:** P-2 port-driven at L2 means the primitive for price parsing has its own defined port interface with explicit types. The output DTO has non-nullable OHLC fields. Any scenario that feeds null OHLC data will surface at the port boundary (P-4 edge-case scenario). The in-memory adapter in the scenario can inject a null-OHLC record and verify the primitive returns an appropriate error DTO instead of writing corrupt data.  
**Recurrence prevention metric:** P-4 at L2 on `stock-price-ingestion` primitive; edge-case scenario: `"close": null` input → `{ error: "OHLC_INCOMPLETE" }` output.  
**Phase:** Phase 2.

---

### BUG-004: HPG `get_cash_flow` all-zeros — multi-key fallback missing (TASK-1942c)

**Tier:** Module — `financial-reports`  
**Root cause:** BCTC PDF extraction for steel company financial statements (HPG) uses different label keys than standard templates. The extractor had no multi-key fallback — if the primary key was absent, it returned zeros instead of trying the alternative keys.  
**How refactor kills it:** M-2 (primitive composition) at L2 means the `bctc-cash-flow-extractor` primitive has an explicit port interface that defines the fallback chain as part of its contract. P-4 scenario JSON for the extractor includes a "steel OCR label variant" scenario that exercises the multi-key fallback. If the fallback is missing, the scenario fails in CI.  
**Recurrence prevention metric:** P-4 at L3 on `bctc-cash-flow-extractor` (industry-variant scenarios); M-4 module scenario includes HPG as an explicit test stock.  
**Phase:** Phase 2 (primitive extraction with HPG-specific scenario); Phase 3 (module scenario confirms composition).

---

### BUG-005: `vnstockFundamentalsRefresh` + `vnstockTradingStatsRefresh` CRASHED (4 days undetected, BUG-A21/A21b)

**Tier:** Microservice — `mcp-server` scheduler  
**Root cause:** Two scheduler jobs crashed silently. The system-auditor detected the staleness 4 days later via OHLCV age check. No health check surfaced the crash. Root cause of the crash itself is unknown — likely an unhandled exception in the job's domain logic path (service not found, port not available).  
**How refactor kills it:**  
1. S-4 (deployment health) at L2 means each job's health is observable. The `/health` endpoint reports job states including last-run time and last error.  
2. S-1 (composition root) at L2 means all ports are validated at startup. If a required service port is unavailable, the service fails to start loudly rather than failing silently mid-run.  
3. P-4 scenario coverage on the job's underlying primitives catches the "service not found" path before production.  
**Recurrence prevention metric:** S-4 at L2 (health endpoint with job states); system-auditor L4 reads /health nightly (S-4 L4).  
**Phase:** Phase 4.

---

### BUG-006: `bctcReparseJob` 84.2% success rate — sporadic parse failures (WARN-A29)

**Tier:** Module — `financial-reports`  
**Root cause:** PDF parsing is probabilistic (OCR). But 15.8% failure rate suggests some systematic failure path (unsupported PDF structure, corrupt upload, extraction timeout) that falls through without explicit handling. No alert fires for individual parse failures — they are silent.  
**How refactor kills it:** M-4 scenario coverage at L2 for the `financial-reports` module includes an "OCR failure path" scenario: PDF with missing tables → explicit `{ error: "EXTRACTION_FAILED", reason: "no_tables_found" }` DTO. The scenario forces explicit failure handling. At L3, the error path is also rendered on the dashboard, making it visible.  
**Recurrence prevention metric:** M-4 at L2 (error scenario for parse failure); X-1 bug count includes this as tracked until success rate ≥95%.  
**Phase:** Phase 3.

---

### BUG-007: `AnalysisThought` / `AnalysisResult` domain types leaking through barrel (analysis module)

**Tier:** Primitive / Module — `analysis`  
**Root cause:** `analysis/index.ts` re-exports `AnalysisThought` and `AnalysisResult` which are internal domain entity types. Any caller that imports them creates a hidden coupling — if the domain type changes, the caller breaks even if the application service contract is unchanged.  
**How refactor kills it:** P-5 (shape compliance) at L2 on the analysis module's public barrel means only `SequentialAnalysisResponseDTO` is exported. The internal domain types are not visible to callers. If a developer tries to re-export a domain type, the AST lint rule (P-5 L4) blocks the PR.  
**Recurrence prevention metric:** P-5 at L2 immediately; AST lint rule at L4 makes it permanently impossible.  
**Phase:** Phase 1 pilot (for kinhdich as template); Phase 3 (analysis module rebuild with translator).

---

### BUG-008: Interface layer bypasses application layer — 10+ tool handler files import from `domain/services/index.ts` directly

**Tier:** Cross-cutting DDD violation (affects all 12 modules)  
**Root cause:** When tool handlers were written, the application layer was not fully built out. Developers took the shortcut of importing directly from the domain megabarrel. This is the root cause of the entire refactor — it is not a bug in the traditional sense but it enables all the other bugs (domain type leaks, no error boundary, no DTO translation).  
**How refactor kills it:** S-5 (no domain logic leakage) at L2 means interface layer physically cannot import from `domain/services/`. TypeScript path aliases (S-5 L4) make it a compile error. Once the composition root (S-1) is in place, all domain logic flows through modules via use cases.  
**Recurrence prevention metric:** S-5 at L2 (structural fix); TypeScript tsconfig path exclusion at L4 (permanent enforcement).  
**Phase:** Phase 3 (anti-corruption translators) + Phase 4 (barrel shrink + domain import removal) = structural resolution.

---

### BUG-009: `projectRoot()` anti-pattern — same path bug in 2 separate jobs (1960-DAILYDASH, 1965d-JANITOR)

**Tier:** Cross-cutting (infra pattern)  
**Root cause:** Two separate developers independently used local `projectRoot()` helper implementations instead of the canonical `getProjectRoot()` imported from infrastructure. This is the "no single source of truth for infra patterns" problem.  
**How refactor kills it:** S-1 (composition root) at L2 means the canonical `getProjectRoot()` is injected at bootstrap as a config port value — it is not a function any developer can re-implement locally. At P-2 L2, no primitive reads paths directly. The config port provides paths. Developers cannot locally re-implement the config port without a lint violation.  
**Recurrence prevention metric:** P-2 at L2 (no env/path reads in primitives); S-1 at L2 (all paths from composition root).  
**Phase:** Phase 4 (composition root creation permanently ends this pattern).

---

### BUG-010: Technical indicator candles too few — RSI/MACD/BB fail with <35 candles (market-watcher blocked)

**Tier:** Primitive — `ta-rsi-calculator` / `ta-macd-calculator`  
**Root cause:** The market-watcher notebook records: "technical_indicator_readiness: BLOCKED (5-22 candles <35 min for MACD)". The minimum candle requirement is not surfaced as a clear error DTO — it appears as a "calculation failed" condition that callers must interpret.  
**How refactor kills it:** P-5 (shape compliance) at L2 on TA primitives means the output DTO has an explicit `{ status: "INSUFFICIENT_HISTORY", minRequired: 35, available: 22 }` shape. P-4 scenario coverage includes a "not enough candles" scenario. The market-watcher can react to the structured DTO instead of interpreting a generic error.  
**Recurrence prevention metric:** P-4 at L2 (insufficient-candles scenario); P-5 at L2 (explicit error DTO shape).  
**Phase:** Phase 2 (TA primitive extraction with explicit error DTOs).

---

## Structural Impossibility Summary

The table below shows which refactor metric makes which class of bug impossible:

| Bug class | Killed by metric | At level |
|---|---|---|
| Hardcoded paths / env reads in jobs | P-2 Port-Driven + S-1 Composition Root | L2 |
| SQLite column order misalignment | P-4 Scenario Coverage (edge case) | L2 |
| Null field coercion silently corrupting DB | P-4 edge-case scenario | L2 |
| Domain type leaking through barrel | P-5 Shape Compliance | L2 (structural); L4 (compile-time) |
| Interface layer bypassing application layer | S-5 No Domain Leakage | L2 (structural); L4 (tsconfig) |
| Silent job crashes undetected for days | S-4 Deployment Health + system-auditor | L2 (health endpoint); L4 (auto-detect) |
| Multi-key fallback missing in extractor | P-4 industry-variant scenarios | L2 |
| Duplicate infra helper re-implementations | S-1 Composition Root | L2 |
| OCR parse silent failure rate | M-4 Module Scenario Coverage (error path) | L2 |
| Insufficient candles — unstructured error | P-5 Shape Compliance (error DTOs) | L2 |
