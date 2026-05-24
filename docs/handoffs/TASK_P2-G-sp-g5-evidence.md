---
task_id: "P2-G"
phase: "2"
pilot: "stock-price"
authored_by: "qa"
authored_at: "2026-05-24T00:44:37Z"
previous_task: "P2-F (DONE 2026-05-24T02:37:46Z, commit 6225f926)"
next_task: "P2-H (G3 composition root cleanup + OpenAPI)"

g5a_deprecated_path: apps/stock-price/pkg/domain/_deprecated/services_v1.go
g5a_deprecated_test_path: apps/stock-price/pkg/domain/_deprecated/services_v1_test.go
g5a_verified_by: pm (P2-F verification commit 6225f926)
g5a_verified_at: "2026-05-24T02:40:59Z"

g5b_audit_scope: mcp-server tool handlers (market-data tools)
g5b_zero_direct_domain_imports: "YES (AC-1 grep = 0 matches)"
g5b_http_client_present: "YES (port 5000 in clients.ts, AC-2 grep = 4 matches)"
g5b_http_integration_target: "port 5000 (internal) per system-map.json (.project.microservices[2].port = 5000, external_port = 5010)"

g5c_zero_todo_migrat: "YES (AC-3 grep = 0 matches)"
g5c_deprecated_path_clean: "YES (AC-4 grep = 0 matches)"

g5_ready_to_grade: "YES (all conditions met; G5 close gate PASS)"
g5_signal_emitted: docs/signals/qa-sp-P2-G-g5-evidence-done-20260524T004437Z.json
---

# P2-G — G5b/G5c MCP Handler HTTP-Port Audit Evidence

## Scope

Read-only audit confirming:
- G5b: Zero direct stock-price domain imports in mcp-server tool handlers (HTTP client routes correctly to port 5000)
- G5c: Zero `TODO.*migrat` migration-debt markers in either service

G5a (deprecated file move) was verified by PM in P2-F (commit 6225f926, 6/6 ACs PASS).

---

## AC-1 — Zero Direct stock-price Domain Imports in mcp-server

**Command:**
```bash
grep -rn "from.*apps/stock-price\|require.*stock-price" \
  apps/mcp-server/src/interface/mcp/tools/market-data/
```

**Output:** (empty — 0 matches)

**Verdict: PASS** — Match count = 0. No cross-service domain imports exist in the market-data tool handlers. The isolation boundary holds.

**Note:** Per brownfield §5, the tool files (`priceHistoryTools.ts`, `tickerIntelligenceTools.ts`, `priceAlertTools.ts`) use local SQLite caching (`bun:sqlite`) — confirmed not a DDD violation.

---

## AC-2 — HTTP Client Confirmed at Correct Port

**Command:**
```bash
grep -n "5000\|5010\|stock-price" \
  apps/mcp-server/src/infrastructure/microservices/clients.ts
```

**Output:**
```
7: *   - stock-price (5000): multi-tier price resolution
22:  stockPrice: Bun.env.STOCK_PRICE_URL ?? 'http://localhost:5000',
270:/** Go stock-price service /price/history response envelope.
271: * Source: apps/stock-price/pkg/application/usecases.go PriceHistoryResponse.
```

**Verdict: PASS** — Match count = 4 (≥1 required). Port 5000 confirmed as internal HTTP target in `clients.ts` line 22. Matches system-map.json declaration (`"port": 5000`, `"external_port": 5010`).

**Port verification (system-map.json jq query result):**
- `.project.microservices[2].id` = `stock-price`
- `.project.microservices[2].port` = `5000` (internal)
- `.project.microservices[2].external_port` = `5010`

---

## AC-3 — Zero `TODO.*migrat` Markers (G5c)

**Command:**
```bash
grep -rn "TODO.*migrat" \
  apps/stock-price/ \
  apps/mcp-server/src/interface/mcp/tools/market-data/ \
  --include='*.ts' \
  --include='*.go'
```

**Output:** (empty — 0 matches)

**Verdict: PASS** — Match count = 0. No migration-debt markers remain in either service. G5c refactoring is complete.

---

## AC-4 — `_deprecated/` Path Free of `TODO.*migrat`

**Command:**
```bash
grep -rn "TODO.*migrat" \
  apps/stock-price/pkg/_deprecated/ \
  apps/stock-price/pkg/domain/_deprecated/
```

**Output:** (empty — 0 matches from existing path)

**Note:** `apps/stock-price/pkg/_deprecated/` does not exist (only `apps/stock-price/pkg/domain/_deprecated/` exists, containing `services_v1.go` + `services_v1_test.go`). The non-existent path produced a warning but no matches. The existing `pkg/domain/_deprecated/` is clean.

**Files in `pkg/domain/_deprecated/`:**
- `services_v1.go` — archived with `//go:build ignore` compile gate (standard Go archival pattern)
- `services_v1_test.go` — archived with `//go:build ignore` compile gate

**Verdict: PASS** — 0 `TODO.*migrat` matches in deprecated archival files. Files are clean archives.

---

## AC-5 — G5 Evidence Summary

| AC | Description | Grep Matches | Verdict |
|----|-------------|-------------|---------|
| AC-1 | Zero stock-price domain imports in mcp-server market-data tools | 0 | PASS |
| AC-2 | HTTP client routes to port 5000 in clients.ts | 4 | PASS |
| AC-3 | Zero `TODO.*migrat` in stock-price + mcp-server market-data | 0 | PASS |
| AC-4 | Zero `TODO.*migrat` in `_deprecated/` archival files | 0 | PASS |
| AC-5 | Evidence file written + signal emitted | — | PASS |

**g5_ready_to_grade: YES**

All G5b and G5c conditions are met. The stock-price → mcp-server integration uses HTTP-only coupling (port 5000), zero domain coupling, and carries zero migration-debt markers.

**Invariants honored:**
- No goal flips — `goalsEarned`/`decisionMatrix` untouched (§4.5 binding)
- `docs/data/pilot-status-stock-price.json` not modified (PM SSOT)
- Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` not touched
- `.golangci.yml` freeze at `d5ce886e` not touched
- No cross-pilot files touched (`apps/kinh-dich-service/**` etc. untouched)

---

**Evidence authored by:** qa
**Authored at:** 2026-05-24T00:44:37Z
**Based on:** P2-F commit 6225f926 (6225f926), P2-G read-only audit
