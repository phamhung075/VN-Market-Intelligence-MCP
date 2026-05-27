# REQ: MACRO-LIVE-PRICES
**Sprint:** MACRO-LIVE-PRICES
**BA:** ba
**Date:** 2026-05-27
**Status:** APPROVED (PO spec-gate 2026-05-27T22:08:19Z) — proceed to architect
**Handoff to:** architect
**Sprint size:** SPRINT-S (see §7 for sizing rationale and re-size flag)

---

## 0. Context and Root Cause (Confirmed Against Live Code)

### Incident
Telegram escalation #3003 confirmed 4 consecutive cron cycles (05:04 / 08:05 / 12:05 / 20:05 UTC 2026-05-27) serving:

| Field   | Served value | Reality (2026-05-27) |
|---------|-------------|----------------------|
| oil_usd | 82.5        | ~95 USD/bbl          |
| gold_usd| 2350.0      | ~4500 USD/oz (XAU)   |
| usd_vnd | 24500.0     | ~26143               |

Impact: macro regime miscalibration; gold safe-haven signal ±2σ error downstream of all `get_macro_snapshot` consumers.

### Root Cause (Code-Confirmed)

**File 1:** `apps/macro-indicators/pkg/infrastructure/repositories.go` — `HTTPCommodityFetcher` (lines 37–76).

`NewHTTPCommodityFetcher` builds a hardcoded `fixtures` map `{OIL:82.5, GOLD:2350.0, USDVND:24500.0}`. `FetchPrices()` returns these fixture values unconditionally. Zero HTTP calls are made. This is a deliberate sandbox security contract comment: "live-mode post-pilot deferred."

**File 2:** `apps/macro-indicators/pkg/application/usecases.go` — `resolveMarketPrices()` (lines 158–180).

`resolveMarketPrices()` calls `commodityFetcher.FetchPrices()`, falls back to `fixtureOilUSD/fixtureGoldUSD/fixtureUSDVnd` when the port returns zero or error. Since `HTTPCommodityFetcher.FetchPrices()` always succeeds with fixture values, the fallback path never fires, and the fixture values pass straight through as "live" values.

**Precedent (MACRO-SEED-WIRING):** VN-Index was live-wired by a prior sprint. `SQLiteMarketIndexRepository.FetchVNIndex()` reads `market_prices` table (code `VNINDEX`) from the shared `market.db` volume (DB_PATH env var). `usecases.go:resolveVNIndex()` reads from that port; falls back to `fixtureVNIndex` only when the port returns zero. This pattern works and its tests pass.

### Existing Live Data Path (Key Finding)

`yahooFinance.ts` in mcp-server already fetches `BZ=F` (Brent), `GC=F` (Gold XAU/USD), and `USDVND=X` every day at 06:00 UTC via `commodityTrackerRefreshJob`. It stores them in:
- `commodity_prices` table (source = `yahoo`, columns: `brent_crude_usd`, `gold_usd_per_oz`, `usd_vnd_rate`, `fetched_at`)
- `market_prices` table (code = `BRENT`, code = `GOLD` via `upsertMacroPrice`)
- `tracked_indicators` table (indicator = `brent_crude_usd`, `gold_usd_oz`)

The `market_data` named volume is shared between mcp-server and macro-indicators containers (confirmed in `docker-compose.yml`). **The data is already being written to the shared DB by mcp-server.** macro-indicators simply is not reading it.

---

## 1. Functional Requirements

### FR-1: Live Oil Price in get_macro_snapshot
The `oilUsd` field returned by `GET /snapshot` on macro-indicators MUST reflect the live Brent crude price, not the fixture value 82.5.

"Live" is defined as: a value read from a real data source (network feed or populated DB table) that is no older than **4 hours** from the time of the `get_macro_snapshot` call.

Acceptable staleness bound: 4 hours (matching the mcp-server commodity refresh cadence of daily 06:00 UTC with intraday drift tolerance for the VN market session).

Fallback: when no live data is available within the staleness bound, the fixture value MAY be returned **only if** the response also carries a `data_source: "fixture"` flag (or equivalent) so callers can detect degraded mode. (Exact field shape: architect decision.)

### FR-2: Live Gold Price in get_macro_snapshot
The `goldUsd` field MUST reflect the live XAU/USD price, not 2350.0. Same "live" definition and staleness bound as FR-1.

### FR-3: Live USD/VND Rate in get_macro_snapshot
The `usdVnd` field MUST reflect the live USD/VND exchange rate, not 24500.0. Same "live" definition and staleness bound as FR-1.

### FR-4: Fixture Mode Preserved Behind Env Gate
Fixture mode (deterministic values for oil/gold/usdvnd) MUST remain fully functional when the env gate variable is unset or set to `false` (see §4). No production Go code may be removed; it must be conditioned.

### FR-5: Downstream Signal Accuracy
After live wiring: the oil/gold/usdvnd primitive classifiers (`macro_oil_impact_classifier`, `macro_gold_direction_classifier`, `macro_usdvnd_direction_classifier`) MUST receive the live values as input. Their output signals MUST change when the live input crosses a classifier threshold (e.g. oil >90, gold >2000, usdvnd >25500) compared to the fixture-era output.

---

## 2. Data Source Question — FOR THE ARCHITECT TO DECIDE

This is the single most consequential design decision. The BA does not pick it. Three options follow with trade-offs.

### Option A: Read from Existing DB Tables (Strongly Preferred — No New Network Calls from macro-indicators)

**Mechanism:** Mirror the VN-Index pattern. Add a `SQLiteCommodityRepository` in `pkg/infrastructure/repositories.go` that reads from the `commodity_prices` table (or `market_prices` table for BRENT/GOLD codes) already populated by mcp-server's `commodityTrackerRefreshJob`.

Resolution order (proposed, architect may adjust):
1. PRIMARY: `commodity_prices WHERE source = 'yahoo'` — columns `brent_crude_usd`, `gold_usd_per_oz`, `usd_vnd_rate`, `fetched_at`. This is the most canonical: a single row, upserted on every commodity refresh.
2. SECONDARY: `market_prices WHERE code IN ('BRENT','GOLD')` — populated by the same Yahoo job as a mirrored snapshot.
3. FALLBACK: `tracked_indicators WHERE indicator IN ('brent_crude_usd','gold_usd_oz') AND source = 'yahoo'` — last resort.

**Pros:** Zero new network calls from the macro-indicators container. No geo-block risk. No new API keys. Reuses data already fetched and validated. Consistent with the VN-Index precedent. Staleness is inherited from mcp-server cadence (~24h under current cron).

**Cons:** Staleness depends on mcp-server commodity cron running successfully. If mcp-server's Yahoo fetch fails for >4h, macro-indicators degrades to fixture. Architect must define the recency-bound enforcement (see §3 NFR-1).

**USD/VND note:** `usd_vnd_rate` column exists in `commodity_prices`. The `SBVRateRepository` fixture also returns 24500 for USD/VND — the architect must decide which port provides usdVnd to the use case (CommodityFetcherPort or SBVRatePort or a merged port).

### Option B: Direct HTTP Fetch from Yahoo Finance in macro-indicators Process

**Mechanism:** Replace or augment `HTTPCommodityFetcher.FetchPrices()` with live HTTP calls to `https://query1.finance.yahoo.com/v8/finance/chart/{BZ=F,GC=F,USDVND=X}`.

**Pros:** macro-indicators is self-sufficient; does not depend on mcp-server cron.

**Cons:** Yahoo Finance is geo-accessible from the Mac host but **the VPS-Vietnam proxy policy** (`project_bctc_vps_proxy.md`) mandates all geo-blocked VN sources route through VPS. It is unknown whether `query1.finance.yahoo.com` is geo-blocked from within the Docker network on the French host. **This triggers a SPRINT-M re-size** (see §7) because it requires ops to route the fetch through the VPS. Additionally, this would duplicate the Yahoo fetch already happening in mcp-server, creating a dual-source conflict risk (previously documented in Sprint 052 / backlog 921 for Brent news-mining).

### Option C: SBV XML Feed for USD/VND Only, Yahoo DB for Oil/Gold

**Mechanism:** Split: oil/gold from Option A (DB), usdVnd from SBV XML feed adapter in `SBVRateRepository`.

**Pros:** SBV is an authoritative domestic VN source for VND rates; not geo-blocked.

**Cons:** Adds a new HTTP dependency to macro-indicators for one indicator only. Requires SBV XML parse logic. The `SBVRatePort` interface already has a `TODO(P1-B1): implement SBV XML feed adapter` comment, so this is a known deferred item — but it is out of scope for this sprint unless combined.

**BA recommendation to architect:** Option A is the fastest path, reuses proven patterns, and avoids geo-block risk. It should be the default choice unless the architect identifies a data freshness problem with the 24h cron cadence.

---

## 3. Non-Functional Requirements

### NFR-1: Recency Bound Enforcement
The infrastructure adapter MUST check the `fetched_at` timestamp of the DB row it reads. If the row is older than **4 hours**, the adapter MUST return `(0, nil)` so the application layer falls back to fixture mode (with the `data_source: "fixture"` indicator). This is the same safe-degradation contract as VN-Index (returns 0 when no data).

Rationale: serving a 25h-old stale DB value is better than serving the wrong fixture, but serving a 4-day-old DB value is not. The 4h bound is conservative given mcp-server's 24h cron; architect may tighten to 2h if intraday refresh is added.

### NFR-2: No API Keys in macro-indicators Process
The macro-indicators container must continue to read ZERO secrets. The docker-compose `environment` block for `macro-indicators` must not gain any API key, external service credential, or VPS credential. Only `PORT`, `DB_PATH`, `DB_READONLY`, and the new env gate variable (§4) are permitted.

### NFR-3: Read-Only DB Access Preserved
`SQLiteCommodityRepository` MUST open market.db with `?mode=ro` (read-only), consistent with `SQLiteMarketIndexRepository`. `DB_READONLY=true` env var remains in force.

### NFR-4: Performance
`/snapshot` endpoint P99 latency must remain under 200ms. DB read of `commodity_prices` is a single-row indexed SELECT — this is not a risk. No external HTTP call may be added to the hot path without architect sign-off.

---

## 4. HARD Requirement: Fixture Mode Env Gate

### Contract
A new environment variable `COMMODITY_LIVE_MODE` controls whether the commodity fetcher reads from live DB or returns fixture values.

| Value         | Behavior                                              |
|---------------|-------------------------------------------------------|
| unset or `false` | Fixture mode: `HTTPCommodityFetcher` returns hardcoded map as today. Sandbox determinism maintained. |
| `true`        | Live mode: new `SQLiteCommodityRepository` (or equivalent) reads DB tables. Fixture fallback applies only when DB row missing or stale. |

### Rationale
The existing Go httptest sandbox and all deterministic replay tests (`handlers_snapshot_contract_test.go`, `usecases_test.go`, `repositories_test.go`) MUST remain green with `COMMODITY_LIVE_MODE` unset or `false`. No test may be modified to expect live values under fixture conditions.

### Implementation notes for architect
- The composition root `cmd/server/main.go` reads the env var and injects either the fixture fetcher or the live DB fetcher.
- No business logic lives in `main.go` — the env gate selects which concrete adapter to wire.
- The `CommodityFetcherPort` interface (`pkg/domain/ports.go`) does NOT change — it is the boundary that both adapters satisfy.

---

## 5. HARD False-Green Guard (QA Acceptance Criterion — NOT Optional)

### QA-GATE-1: End-to-End Verification Through MCP Tool
The live value MUST be verified end-to-end through the `get_macro_snapshot` MCP tool, not through a direct `curl` to the macro-indicators service at port 5004.

Rationale: the mcp-server `get_macro_snapshot` tool proxies to macro-indicators via HTTP. A direct curl to :5004 bypasses mcp-server entirely and does not prove the MCP surface works. A previous false-green in this system confirmed that the tool can return 200-OK while the underlying data is stale. Per system policy (`feedback_trust_verification_is_system_job.md`): verification is the agent calling the live tool.

**QA gate invocation:**
```
call_tool(server="vn-market", tool="get_macro_snapshot", arguments={})
```
The response `oilUsd` field MUST be > 90 (as of 2026-05-27 real value ~95), `goldUsd` MUST be > 3000 (real ~4500), `usdVnd` MUST be > 25000 (real ~26143). These thresholds are live-reality bounds as of sprint date, not fixture values.

If the test uses a DB-populated fake (Option A test path), the injected fake values MUST also differ from fixtures: e.g., oil=96.0, gold=4480.0, usdVnd=26150.0 to confirm the use case reads from the port, not from the fixture constants.

### QA-GATE-2: Fixture Mode Remains Green
With `COMMODITY_LIVE_MODE` unset (or `false`), all existing Go tests MUST pass:
```
cd apps/macro-indicators && go test ./...
```
Zero test modifications to accommodate live-mode behavior.

---

## 6. Test Matrix

| Test ID | Layer | Mode | Description | Pass Condition |
|---------|-------|------|-------------|----------------|
| T-MLP-1 | Infrastructure (Go) | fixture off | `SQLiteCommodityRepository.FetchPrices()` returns live values when `commodity_prices` row exists and `fetched_at` < 4h ago | oil=injected value, gold=injected value, usdvnd=injected value |
| T-MLP-2 | Infrastructure (Go) | fixture off | `SQLiteCommodityRepository.FetchPrices()` returns empty map when `fetched_at` > 4h ago (recency bound enforcement) | map is empty → application uses fixture |
| T-MLP-3 | Infrastructure (Go) | fixture off | `SQLiteCommodityRepository.FetchPrices()` returns empty map when table has no rows | map is empty → application uses fixture |
| T-MLP-4 | Application (Go) | fixture off | `resolveMarketPrices()` passes live DB values through when port returns non-zero | `oilPrice`, `goldPrice`, `usdVnd` in response equal injected port values |
| T-MLP-5 | Application (Go) | fixture off | `resolveMarketPrices()` falls back to fixture constants when port returns zero (degraded mode) | response values equal `fixtureOilUSD`, `fixtureGoldUSD`, `fixtureUSDVnd` |
| T-MLP-6 | Application (Go) | fixture on | All existing `usecases_test.go` tests pass unchanged | `go test ./pkg/application/...` exits 0 |
| T-MLP-7 | Infrastructure (Go) | fixture on | All existing `repositories_test.go` tests pass unchanged | `go test ./pkg/infrastructure/...` exits 0 |
| T-MLP-8 | Interface (Go) | fixture on | Contract test `handlers_snapshot_contract_test.go` passes unchanged | `go test ./pkg/interface/...` exits 0 |
| T-MLP-9 | Composition root | fixture on | With `COMMODITY_LIVE_MODE` unset, `cmd/server/main.go` wires `HTTPCommodityFetcher` (fixture) | confirmed by env gate path in main.go |
| T-MLP-10 | Composition root | fixture off | With `COMMODITY_LIVE_MODE=true`, `cmd/server/main.go` wires `SQLiteCommodityRepository` (live) | confirmed by env gate path in main.go |
| T-MLP-11 | End-to-end (MCP) | live (docker) | `get_macro_snapshot` via `call_tool` returns `oilUsd > 90`, `goldUsd > 3000`, `usdVnd > 25000` | QA-GATE-1 — tool response values exceed fixture-era thresholds |
| T-MLP-12 | Signal accuracy | live (injected) | With oil=96.0 as input, `macro_oil_impact_classifier` emits `ELEVATED` (>90 threshold) not `NEUTRAL` (82.5 fixture band) | primitive signal reflects live input |

**Test infrastructure note:** T-MLP-1..T-MLP-5, T-MLP-9, T-MLP-10 use in-memory SQLite (`:memory:`) and Go httptest — zero network, zero credentials, consistent with existing test patterns in `repositories_test.go`. T-MLP-11 requires the live Docker stack and populated `market.db`.

---

## 7. Sprint Sizing and VPS Flag

### Recommendation: SPRINT-S (with conditional re-size flag)

**If architect chooses Option A (DB read):** SPRINT-S is correct. The work is:
1. Add `SQLiteCommodityRepository` in `pkg/infrastructure/repositories.go` — mirrors `SQLiteMarketIndexRepository` pattern, ~60 lines.
2. Add env gate in `cmd/server/main.go` — 5–10 lines, read `COMMODITY_LIVE_MODE`.
3. Add `COMMODITY_LIVE_MODE=true` to `docker-compose.yml` macro-indicators environment block.
4. Write T-MLP-1..T-MLP-5 tests (new) + confirm T-MLP-6..T-MLP-10 (existing green).
5. QA verifies T-MLP-11.

All work stays within `apps/macro-indicators/` plus `docker-compose.yml`. No new services, no proxy changes, no VPS involvement.

**If architect chooses Option B (direct Yahoo HTTP from macro-indicators):** RE-SIZE TO SPRINT-M. Reasons:
- The VPS-Vietnam proxy policy (`project_bctc_vps_proxy.md`) must be evaluated: if `query1.finance.yahoo.com` is geo-accessible from within the Docker network on the French host without VPS routing, Option B is SPRINT-S. If geo-block is confirmed, Option B requires routing the fetch through the Vinahost VPS proxy, which adds ops scope (new proxy route, container env vars, network policy) and crosses zone boundaries.
- BA flags this decision for architect. The architect must test geo-reachability of `query1.finance.yahoo.com` from within the macro-indicators container before committing to Option B.

**BA recommendation:** architect should default to Option A. It is scope-minimal, proven by precedent, and avoids the geo-block question entirely.

---

## 8. DDD Layer Mapping

| Requirement | DDD Layer | File(s) |
|-------------|-----------|---------|
| FR-1/2/3: Live DB read | Infrastructure | `apps/macro-indicators/pkg/infrastructure/repositories.go` |
| FR-4: Fixture env gate | Infrastructure + Composition Root | `apps/macro-indicators/cmd/server/main.go` |
| FR-5: Signal accuracy | Domain (primitives, unchanged) | `pkg/primitive/macro_oil_impact_classifier/`, `macro_gold_direction_classifier/`, `macro_usdvnd_direction_classifier/` |
| NFR-1: Recency bound | Infrastructure | `SQLiteCommodityRepository.FetchPrices()` implementation |
| NFR-2: No API keys | Composition Root | `cmd/server/main.go`, `docker-compose.yml` |
| NFR-3: Read-only DB | Infrastructure | `SQLiteCommodityRepository` (open with `?mode=ro`) |
| QA-GATE-1: E2E via MCP | Interface (test) | mcp-server `get_macro_snapshot` tool |

---

## 9. Edge Cases

| Edge case | Handling |
|-----------|----------|
| `commodity_prices` table absent (schema not yet migrated or fresh DB) | Repository returns empty map → application falls back to fixture values |
| `fetched_at` column is NULL | Treat as infinitely stale → return empty map |
| DB file missing or unreadable | `sql.Open` fails → return `(nil, nil)` → application falls back to fixture (consistent with `SQLiteMarketIndexRepository` precedent) |
| Partial row (e.g. `gold_usd_per_oz` is NULL) | Return non-zero values only for non-NULL columns; omit zeros so application fixture fallback fires per-commodity |
| Oil value in DB is 0 or negative | Treat as missing → application fixture fallback for that field |
| mcp-server commodity cron hasn't run yet (fresh deploy) | All three commodity fields return 0 → application returns fixture values + `data_source: "fixture"` flag |
| `COMMODITY_LIVE_MODE=true` but `DB_PATH` points to wrong file | Repository fails to open → returns empty map → fixture fallback; no crash |

---

## 10. Out of Scope

- SBV XML feed adapter implementation (`SBVRateRepository`) — deferred, tagged `TODO(P1-B1)` in domain ports.
- Intraday commodity refresh cadence for macro-indicators (currently 24h via mcp-server cron) — separate sprint.
- `fixtureVNDDepositRate`, `fixtureFedFundsRate`, `fixtureEarningYield` live-wiring — separate sprint.
- Any changes to `apps/mcp-server/` — strictly out of scope for this sprint.
- Any changes to primitive classifier thresholds — no-touch.

---

## 11. Files in Scope (Zone: apps/macro-indicators/)

Write zone (architect/dev may modify):
- `apps/macro-indicators/pkg/infrastructure/repositories.go`
- `apps/macro-indicators/pkg/infrastructure/repositories_test.go`
- `apps/macro-indicators/pkg/application/usecases_test.go` (add T-MLP-4/5 only; existing tests unchanged)
- `apps/macro-indicators/cmd/server/main.go`
- `docker-compose.yml` (add `COMMODITY_LIVE_MODE=true` to macro-indicators environment block only)

Read-only (must not be modified):
- `apps/macro-indicators/pkg/domain/ports.go`
- `apps/macro-indicators/pkg/application/usecases.go` (resolveMarketPrices already correct; no change needed)
- All primitive and module files under `apps/macro-indicators/pkg/primitive/` and `apps/macro-indicators/pkg/module/`
- All `apps/mcp-server/` files

Out of scope entirely:
- `docs/handoffs/pilot-status-*.json` — do not touch
- Any agent `.md` or flow `.md` file

---

## 12. § PO RULING — SPEC-GATE (2026-05-27T22:08:19Z)

**VERDICT: APPROVED → architect (brownfield analysis).**

This REQ passes all five spec-gate axes. The decision is APPROVED, not CHANGES_REQUESTED. The notes below are non-blocking guidance the architect must carry into design — they do not gate the handoff.

### Gate axis 1 — Testability
PASS. Acceptance criteria are concrete and falsifiable. The Test Matrix (§6) is layered correctly: T-MLP-1..5/9/10 are zero-network in-memory Go (`:memory:` + httptest), T-MLP-6..8 lock existing green, T-MLP-11 is the live MCP gate, T-MLP-12 proves the signal actually moves. The QA-GATE-1 live bounds (oil>90, gold>3000, usdVnd>25000) are reality-anchored, not fixture-anchored, so they cannot pass on the stale seed. Good.

### Gate axis 2 — Recency bound (4h) sanity
PASS with a noted asymmetry, NOT a blocker. The 4h bound (NFR-1) is *tighter* than the data producer's cadence: mcp-server's `commodityTrackerRefreshJob` runs daily 06:00 UTC (~24h), confirmed at `apps/mcp-server/src/scheduler/macro/commodityTrackerRefreshJob.ts`. A strict 4h gate therefore degrades macro-indicators to fixture for ~20h of every 24h day — which would re-introduce exactly the stale-fixture bug this sprint exists to kill. The REQ itself flags this tension (NFR-1 rationale: "serving a 25h-old stale DB value is better than serving the wrong fixture"). **Architect decision required:** reconcile the recency bound with the 24h producer cadence — either (a) widen the bound to ~26h (cron+drift) so the live value survives a normal day, or (b) keep 4h ONLY if paired with an intraday refresh, which §10 explicitly defers. Picking 4h as written without (a) or (b) is self-defeating. This is a design tradeoff for the architect, not a spec defect — the REQ surfaced it honestly, which is why it stays APPROVED.

### Gate axis 3 — Data-source question correctly deferred to architect
PASS. §2 is exactly right: the BA enumerates A/B/C with trade-offs and explicitly does NOT pre-decide. Option A (read `commodity_prices` from the shared DB, mirroring the proven VN-Index `SQLiteMarketIndexRepository` pattern) is the sound default and I endorse it as the BA does — but the binding choice is the architect's. I code-verified the three load-bearing premises of Option A:
- `commodity_prices` IS written by mcp-server with columns `brent_crude_usd / gold_usd_per_oz / usd_vnd_rate / fetched_at`, upserted on `source` PK (`macroIndicatorRefreshJob.ts:207-213` and `commodityTrackerRefreshJob.ts:104`, source='yahoo'). BA's PRIMARY filter `WHERE source='yahoo'` matches the live write.
- The `market_data` named volume is mounted on BOTH mcp-server and macro-indicators (`docker-compose.yml` L12, L192), both `DB_PATH=/app/data/market.db`. The cross-container read is real.
- macro-indicators ALREADY carries `DB_PATH=/app/data/market.db` + `DB_READONLY=true` (L195-196), so NFR-3 is pre-satisfied and the ONLY new env is `COMMODITY_LIVE_MODE`.
- `resolveMarketPrices()` (`usecases.go` L160-180) already does per-commodity `>0`-guarded port reads with fixture fallback — BA correctly scopes usecases.go as NO-CHANGE (tests-only). Confirmed.

**ARCHITECT'S SINGLE DECISION = data-source A / B / C.** Recommended default: **A**. Multi-source note for architect: `commodity_prices` is keyed by `source` and is upserted by *two* jobs (commodityTracker source='yahoo' AND the macro refresh job under its own source); pick the canonical source row deliberately so the read doesn't grab the wrong upsert.

### Gate axis 4 — False-green resistance
PASS — this is the strongest part of the spec and directly answers `feedback_fence_false_green` + incident 3bd9e6ae. Two independent guards: (1) the env-gate contract (§4) keeps fixture mode green under `COMMODITY_LIVE_MODE` unset/false so deterministic Go tests are untouched — and the REQ forbids modifying any existing test to expect live values; (2) QA-GATE-1 (§5) mandates END-TO-END verification through `call_tool get_macro_snapshot`, NOT a direct `:5004` curl — closing the exact "200-OK but stale" hole that bit this system before (`project_mcp_server_write_wedge`). The injected-fake values (oil=96.0/gold=4480.0/usdVnd=26150.0) are distinct from fixtures, so a test passing proves the port was read, not the constants. Sufficient.

### Gate axis 5 — Host / zone safety
PASS for Option A. All writes stay in zone `apps/macro-indicators/` + a single additive line in `docker-compose.yml` (§11). No new service, no API key (NFR-2), no VPS, no cross-zone reach. The mcp-server tree is correctly read-only / out-of-scope (§10, §11). **Zone flag honored:** the REQ's §7 conditional re-size is correct — Option B (direct Yahoo HTTP from macro-indicators) would cross into ops/VPS scope under `project_bctc_vps_proxy.md` (geo-block unknown from the French Docker host) and MUST re-size to SPRINT-M. If the architect picks B, this APPROVAL does NOT extend to it — bounce back to PO for a re-sized batch entry before any VPS/ops work.

### Non-blocking note for architect (QA threshold vs existing validation band)
`dataAuditJob.ts` already enforces sanity bands on these same fields (oil 10-300, gold 500-5000, usd_vnd 20000-30000). The QA-GATE-1 live bounds (gold>3000, usdVnd>25000) sit comfortably inside those, so no conflict — just confirm the live ~4500 gold value passes the existing 5000 ceiling (it does). No action needed; logged for awareness.

### Ruling summary
- **APPROVED → architect.**
- Architect's single binding decision: **data-source A / B / C** (recommend A).
- Architect MUST resolve in design: the **4h recency-bound vs 24h producer-cadence** asymmetry (axis 2).
- If architect picks **Option B**: re-size to SPRINT-M and return to PO before ops/VPS work — this approval is Option-A-scoped.
- Sprint stays SPRINT-S under Option A.
