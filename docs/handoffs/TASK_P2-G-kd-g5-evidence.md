# TASK P2-G — kinh-dich G5b/G5c Audit + G5a Hold Confirmation

**Task:** P2-G (QA)
**Date:** 2026-05-24
**Owner:** qa
**Status:** DONE — PASS
**Blocked by:** P2-F DONE (G5a confirmed)

---

## [QA] Review Record

### AC-1 — Zero direct kinh-dich domain imports in mcp-server tool handlers

```bash
grep -rn "from.*apps/kinh-dich-service\|require.*kinh-dich-service" \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/
```

**Result:** 0 matches (exit:1 = grep found nothing) — PASS

### AC-2 — HTTP client confirmed at port 5005

```bash
grep -n "5005\|kinhDich\|kinh.dich" apps/mcp-server/src/infrastructure/microservices/clients.ts
```

**Result:** 8 matches — PASS

Key evidence lines:
- `apps/mcp-server/src/infrastructure/microservices/clients.ts:12` — `*   - kinh-dich-service (5005): hexagram readings`
- `clients.ts:27` — `kinhDich: Bun.env.KINH_DICH_URL ?? 'http://localhost:5005'` (config-sourced, not hardcoded magic)
- `clients.ts:464` — `const url = \`\${BASE_URLS.kinhDich}/reading/\${code}?days=\${days}\`` — getKinhDichReading
- `clients.ts:473` — `const url = \`\${BASE_URLS.kinhDich}/market\`` — getMarketHexagram
- `clients.ts:482` — `const url = \`\${BASE_URLS.kinhDich}/readings/\${code}/history?days=\${days}\`` — getKinhDichHistory
- `clients.ts:495` — `const url = \`\${BASE_URLS.kinhDich}/hexagram/\${hexagramNumber}/transitions...\`` — getHexagramTransitions
- `clients.ts:504` — `const url = \`\${BASE_URLS.kinhDich}/backtest/\${code}?days=\${days}\`` — runKinhDichBacktest
- `clients.ts:513` — `const url = \`\${BASE_URLS.kinhDich}/hexagram/\${hexagramNumber}/explain\`` — explainHexagram

Port sourced from: `Bun.env.KINH_DICH_URL ?? 'http://localhost:5005'` — config not hardcoded.

### AC-3 — Zero TODO.*migrat markers (G5c)

```bash
grep -rn "TODO.*migrat" apps/kinh-dich-service/ apps/mcp-server/src/interface/mcp/tools/kinhdich/ \
  --include='*.ts' --include='*.go'
```

**Result:** 0 matches (exit:1 = grep found nothing) — PASS

### AC-4 — _deprecated/ free of TODO.*migrat

```bash
grep -rn "TODO.*migrat" apps/kinh-dich-service/src/_deprecated/
```

**Result:** 0 matches (exit:1 = grep found nothing) — PASS

---

## G5a Hold Confirmation

### Live TS files outside _deprecated/

```bash
find apps/kinh-dich-service/src -name "*.ts" ! -path "*/node_modules/*" ! -path "*/_deprecated/*"
```

**Result:** 0 files — live_ts_count: 0 — PASS

### Go build

```bash
cd apps/kinh-dich-service && CGO_ENABLED=0 go build ./...
```

**Result:** exit 0 — PASS

### Go test

```bash
cd apps/kinh-dich-service && CGO_ENABLED=0 go test ./...
```

**Result:** 6/6 packages pass (39 tests) — exit 0 — PASS

Packages: hao_encoder, hexagram_resolver, ngu_hanh_classifier, reading_scorer, nuclear_hexagram, reading_composer

### Sandbox primitive tier

```bash
cd apps/kinh-dich-service && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=all
```

```
  [GREEN] hao-encoder-edge.json
  [GREEN] hao-encoder-failure.json
  [GREEN] hao-encoder-golden.json
  [GREEN] hexagram-resolver-edge.json
  [GREEN] hexagram-resolver-failure.json
  [GREEN] hexagram-resolver-golden.json
  [GREEN] ngu-hanh-classifier-edge.json
  [GREEN] ngu-hanh-classifier-failure.json
  [GREEN] ngu-hanh-classifier-golden.json
  [GREEN] nuclear-hexagram-computer-edge.json
  [GREEN] nuclear-hexagram-computer-failure.json
  [GREEN] nuclear-hexagram-computer-golden.json
  [GREEN] reading-scorer-edge.json
  [GREEN] reading-scorer-failure.json
  [GREEN] reading-scorer-golden.json

=== SANDBOX SUMMARY ===
Tier: primitive
Passed: 15/15
All scenarios GREEN
```

**Result:** exit 0 — PASS

### Sandbox module tier

```bash
cd apps/kinh-dich-service && CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=kinh-dich -scenario=all
```

```
  [GREEN] reading-composer-edge.json
  [GREEN] reading-composer-golden.json

=== SANDBOX SUMMARY ===
Tier: module
Passed: 2/2
All scenarios GREEN
```

**Result:** exit 0 — PASS

### Combined sandbox: 17/17 GREEN EXIT:0 CONFIRMED

---

## G5b Kinh-Dich MCP Tool List (6 tools, all routed via HTTP to port 5005)

| Tool | Client function | HTTP endpoint | Port |
|------|----------------|---------------|------|
| `get_kinhdich_reading` | `getKinhDichReading()` | `/reading/{code}?days={days}` | 5005 |
| `get_market_hexagram` | `getMarketHexagram()` | `/market` | 5005 |
| `get_hexagram_history` | `getKinhDichHistory()` | `/readings/{code}/history?days={days}` | 5005 |
| `get_transition_probabilities` | `getHexagramTransitions()` | `/hexagram/{number}/transitions` | 5005 |
| `run_hexagram_backtest` | `runKinhDichBacktest()` | `/backtest/{code}?days={days}` | 5005 |
| `explain_hexagram` | `explainHexagram()` | `/hexagram/{number}/explain` | 5005 |

All 6 tools import from `../../../../infrastructure/microservices/clients.js` (within mcp-server).
ZERO imports from `apps/kinh-dich-service/src/...`.

### Allowed glue helpers (not flagged as violations — AC-8 architecture)

The following helpers remain in `kinhDichTools.ts` as mcp-server-local integration glue.
They are NOT domain imports from kinh-dich-service source tree:
- `computeSentimentScore()` — reads mcp-server's own SQLite DB
- `computeFundamentalsScore()` — reads mcp-server's own SQLite DB
- `computePriceScore()` — reads mcp-server's own SQLite DB
- `computeForeignFlowScore()` — reads mcp-server's own SQLite DB
- `computeSectorScore()` — calls mcp-server `domain/services/sectorPeers.js`
- `computeMacroScore()` — reads mcp-server's own SQLite DB
- `computeHaoScores()` — aggregates the above 6 helpers
- `tickerJitter()` — deterministic per-ticker jitter (pure function)
- `computeMacroIndicatorScore()` — reads mcp-server's own SQLite DB
- `formatKinhDichTradingContext()` — pure string formatter

These helpers are explicitly approved in P2-KD-G AC-8 and referenced in `kinhDichTools.ts` header comment.

---

## G5 Evidence Summary

```
g5a_deprecated_path: apps/kinh-dich-service/src/_deprecated/services_v1.ts
g5a_live_ts_outside_deprecated: 0 files (CLEAN)
g5b_zero_direct_domain_imports: YES
g5b_http_client_present: YES (port 5005 in clients.ts via Bun.env.KINH_DICH_URL)
g5b_port_sourced_from_config: YES (not hardcoded magic)
g5b_6_tools_routed_via_http: YES (get_kinhdich_reading, get_market_hexagram, get_hexagram_history, get_transition_probabilities, run_hexagram_backtest, explain_hexagram)
g5c_zero_todo_migrat: YES (grep exit:1 on both kinh-dich-service/ and mcp-server kinhdich/ handlers)
g5c_deprecated_zero_todo_migrat: YES
g5_ready_to_grade: YES
go_build_exit: 0
go_test_exit: 0 (39/39 pass)
sandbox_primitive: 15/15 GREEN exit 0
sandbox_module: 2/2 GREEN exit 0
sandbox_combined: 17/17 GREEN (confirmed)
```

**G5 status:** EARNED-PENDING (evidence complete; PO flips G5 only at 12/12 terminal Phase-3 close)

---

## Dashboard State Note

dash-check verdict: WARN (17 pending/NOT-RUN, 0 green, 0 red, 0 errors)

The dashboard is a static file:// asset. It populates GREEN dots only when the user pastes
sandbox output via the browser UI (Apply & Update Cards). The WARN/NOT-RUN state is the
honest cold-start state per G8 contract. P2-H (stale-comment cleanup) has already been applied:
zero `language=ts` or `runtime=bun` found in index.html. Go-correct comments: 1 occurrence of
`language=go` found in line 13 header comment.

For G9 Playwright Path B (P2-I), the PO must:
1. Run the sandbox to get output
2. Open the dashboard in a browser
3. Paste sandbox output via the "Apply & Update Cards" UI
4. Playwright then captures the green dots

The sandbox output (17/17 GREEN) is now available from this QA run above.

**G5a hold: CONFIRMED**
**P2-G verdict: PASS — all 5 ACs green**
