<!-- size-justification: 380L — 6-unit sprint brief; each unit carries root-cause + fix-seam (file:line) + DoD + ARCH-BLOCKER resolution; fan-out stubs load-bearing for PO next cycle; no duplication with BA spec. -->

# Architecture Brief — TOOL-SURFACE-UPGRADE

**Task:** ARCH-TSU
**Sprint:** TOOL-SURFACE-UPGRADE
**Date:** 2026-06-13
**Author:** architect
**Status:** REVIEW
**Input:** docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md (481L) + .task_board.active_sprints[21] evidence
**Output:** Fan-out dev-task stubs for PO to grind next cycle
**BUILD-STANDARD:** lean (existing service, new features/fixes across multiple subsystems)

---

## AC9 — No-Code Gate Confirmation

This deliverable is the architecture brief ONLY. No production code was written. No container was rebuilt. No test or CI gate was run. DoD for ARCH-TSU is satisfied by brief presence + fan-out stubs. The orch-state task_board is NOT modified here — that is the router's job.

---

## Tool-Count Reconciliation (SSOT binding)

**SSOT pointer:** `docs/data/project-stats.json` field `toolCount` — do NOT hardcode a number; query live.

**At-spec-time counts (from BA spec, 2026-06-07):**
- `/health` runtime count: **162** (via `Object.keys(registeredToolsMap)` at startup)
- Static `server.tool()` grep in `tools/**/*.ts`: **161**
- `project-stats.json` `toolCount` at brief time: **157** (stale — not yet updated post-sprint)

**Delta resolution (ARCH-U2-2 RESOLVED):**
The delta of 1 between runtime (162) and static grep (161) is explained by a single non-standard registration: `sequential_market_analysis` in `apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts:241` uses `server.registerTool()` (legacy SDK API) instead of `server.tool()`. The runtime `agentBootstrap.ts:303-344` `buildToolNameMap` probe handles BOTH APIs, producing count 162. The U2 static generator must scan for BOTH `server.tool(` AND `server.registerTool(` patterns to output `totalCount=162`.

After U3 deregistrations (5 tools removed), the settled count will be **157** (runtime) / **157** (generator output). `project-stats.json` `toolCount` must be updated to match generator output after U3 settles (FR-U2-4 gate). The generator — not `/health` and not a hardcoded literal — is the arbiter.

---

## U1 — Per-Call Telemetry Counter

**Root cause:** `sessionToolCache` (populated at SSE handshake in `apps/mcp-server/src/infrastructure/cache/sessionToolCache.ts`) is never populated under the gateway per-call model. Gateway dials SSE per-call and drops the connection; the `server.ts:205` handshake never fires. `trackSessionToolUsageJob` reads `sessionToolCache.snapshot()` which is always empty. `tool-usage-stats.json` shows `sessionCount:0 / toolCounts:{}` permanently.

**Fix seam:**
- New file: `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts`
  - Singleton `Map<string, number>` (tool name → invocation count)
  - Exports: `incrementTool(name: string): void` (synchronous Map write, no I/O)
  - Exports: `getSnapshot(): Record<string, number>` (shallow copy)
  - Exports: `resetCounters(): void` (called by flush job after write or on container start)
  - DDD layer: Infrastructure
- Hook location: `apps/mcp-server/src/interface/mcp/server.ts` — after `registerAllTools(server)` completes (line ~220), iterate `Object.entries(server._registeredTools)`, wrap each `handler` with a proxy that calls `incrementTool(name)` then delegates to the original handler. This pattern is already used in `server.ts:203-219` (same `_registeredTools` private field access). Shim = 1 loop, ~5 lines. Fire-and-forget — NFR-U1-1 satisfied.
- Modified file: `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts`
  - Replace `sessionToolCache.snapshot()` with `perCallCounterStore.getSnapshot()`
  - **Ruling on `sessionCount`:** REMOVE the field entirely. Post-gateway, the field is semantically undefined (gateway has no sessions). `uniqueTools = Object.keys(toolCounts).length` remains valid. Output schema: `{ generatedAt, uniqueTools, toolCounts: { [toolName]: number } }`.

**Per-unit DoD:**
- `perCallCounterStore.ts` exports `incrementTool` / `getSnapshot` / `resetCounters`.
- Proxy shim applied in `server.ts` after `registerAllTools`.
- `trackSessionToolUsageJob.ts` reads from `perCallCounterStore`, writes `tool-usage-stats.json` with `sessionCount` removed.
- QA gate: invoke any tool via gateway wrapper once; force-run job; assert `tool-usage-stats.json toolCounts[<toolName>] >= 1`.

---

## U2 — Registry Generation from Source + Parity Assertion

**Root cause:** `docs/data/tool-registry.json` was last hand-edited 2026-05-03 (125 tools listed vs 162 live). No generator existed; hand-maintenance decayed. TSH ran a manual reconcile 2026-06-01 (154 tools) — still decayed.

**ARCH-U2-1 RESOLVED:** No tool registrations exist outside `tools/**/*.ts`. `server.ts` calls `registerAllTools(server)` which executes `toolRegistry` from `registry.ts` — no direct `server.tool()` calls in `server.ts` itself. The only non-standard call is `server.registerTool()` in `sequential-market-analysis.ts` which is under `tools/`. Generator scope = `apps/mcp-server/src/interface/mcp/tools/**/*.ts`, scanning BOTH `server.tool(` AND `server.registerTool(` patterns.

**ARCH-U2-2 RESOLVED:** Delta of 1 = `server.registerTool()` in `sequential-market-analysis.ts:241`. Not a mystery registration. Generator must scan both APIs. See tool-count reconciliation section above.

**Fix seam:**
- New file: `scripts/gen-tool-registry.ts`
  - Scans `apps/mcp-server/src/interface/mcp/tools/**/*.ts`
  - Regex extracts tool names from `server.tool("name",` and `server.registerTool("name",` call-sites
  - Groups by source folder (parent directory name = category: market-data, financial-reports, system, alerts, macro, briefings, sector, portfolio, backtesting, news-analysis, kinhdich, analysis)
  - Writes `docs/data/tool-registry.json`: `{ "_maintained_by": "generator (do not hand-edit)", "lastUpdated": ..., "totalCount": N, "groups": [...] }`
  - Expected totalCount post-U3: 157 (162 minus 5 deregistrations). Post-U2-GEN pre-U3: 162.
- New file: `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts`
  - Reads `docs/data/tool-registry.json`
  - Runs same static extraction on `tools/**/*.ts`
  - Asserts: `registry.totalCount == source-extracted count`; every registry name exists in source
  - Deliberate-violation proof (NFR-FENCE): inject fake name `"__test_fake_tool__"` into registry; assert test fails; revert. This is NOT a skip-the-proof false-green exit 0 fence.
- `scripts/gen-project-stats.ts` update: import `totalCount` from generated `tool-registry.json` to populate `project-stats.json toolCount` (FR-U2-4). The `_generation_note` already states the extraction logic — share or import the registry output.

**Sequencing constraint (Risk R-1):** U2-PARITY test must run LAST in the dev pipeline — after all U3 deregistrations (5 tools) and U6 description updates are committed. A stale parity test before U3 settles will fail on count mismatch. Fan-out stub TSU-DEV-U2-PARITY is pinned as the final mcp-server task.

**Per-unit DoD:**
- `scripts/gen-tool-registry.ts` runs without error, writes valid JSON to `docs/data/tool-registry.json` with correct totalCount.
- `tool-registry-parity.test.ts` passes; deliberate-violation proof documented in test file.
- `project-stats.json toolCount` updated to match generator output.
- NFR-U2-1: `_maintained_by` header present in output JSON.

---

## U3 — 12 Weak-Claim Tool Verdicts

**Root cause:** 12 tools have zero usage claims across all 4 layers (agents / flows / skills / cron). Single-layer grep is forbidden per NFR-U3-2 (2026-05-03 incident: 6/6 false positives). All verdicts below are from full 4-layer + internal-call sweep.

**ARCH-U3-1 RESOLVED:** `scripts/agents-flow/cowork-match-slots.js` on `main` branch does NOT call `is_trading_day`. The BA spec cited a `DWF-PHASE1` worktree version not yet merged to main. Verdict: DEREGISTER — DWF-PHASE1 is not active in the current codebase.

**NFR-U3-1 applied:** `read_bctc_pdf` settled FIRST (DEREGISTER confirmed below).

**5-question verdict matrix:**

| Tool | Q1 agent/flow | Q2 internal call | Q3 live data | Q4 overlap | Q5 sprint plan | VERDICT |
|---|---|---|---|---|---|---|
| `read_bctc_pdf` | NO | NO | NO (reads static PDFs only) | YES — `get_bctc_page_text` / `get_bctc_page_image` cover PDF analysis via OCR/PEK pipeline | NO | **DEREGISTER** |
| `backfill_bctc_scalars` | NO | NO | NO (admin backfill utility) | NO | NO | **DEREGISTER** |
| `compute_accruals` | NO | NO | NO (domain calculation, no live store dependency) | NO | NO | **DEREGISTER** |
| `get_accuracy_context` | NO | NO | NO | YES — `get_calibration_report` covers the use case | NO | **DEREGISTER** |
| `is_trading_day` | NO (main branch) | NO (DWF-PHASE1 worktree only, not merged) | YES (trading calendar) | NO | NO | **DEREGISTER** — DWF-PHASE2 re-registers when active |
| `mark_alert_outcome` | NO agent claims | NO | YES (SQLite alerts table, post-hoc scoring) | DISTINCT from `write_alert_verdict` (different datastore: alerts table vs pending_verdicts; different lifecycle: post-hoc vs at-fire-time) | NO | **INTEGRATE** — update description: "post-hoc outcome scoring on fired alert; complements write_alert_verdict (at-fire-time)"; add to alert-commander or ops package |
| `get_market_foreign_flow` | NO | NO | YES (market-wide aggregate from daily_ohlcv) | DISTINCT from `get_foreign_flow` (market-wide SUM vs per-ticker; different source table) | NO | **INTEGRATE** — wire into market-analyst or ops package; description update: "market-wide net foreign flow aggregate (daily_ohlcv SUM); distinct from get_foreign_flow (per-ticker)" |
| `diagnose_foreign_flow_circuit_breaker` | NO agent claims | YES — `foreignFlowTools.ts:277` calls it as internal function (same file, not via MCP routing) | YES (circuit breaker state) | SIBLING with `reset_foreign_flow_circuit_breaker` | NO | **INTEGRATE** — Q2 is direct function call in same file, not MCP-to-MCP routing. Tool itself has zero MCP-layer claims. Wire both diagnose+reset into ops or foreign-flow debug package |
| `get_label_accuracy_report` | NO agent claims | NO | YES (label accuracy DB) | DISTINCT from `get_calibration_report` (TSH FR-3 confirmed: label-level breakdown vs calibration curve) | NO | **INTEGRATE** — wire into market-analyst accuracy package; description: "per-label accuracy breakdown; complement to get_calibration_report (calibration curve)" |
| `get_public_contracts` | PARTIAL — `docs/agents/tools/package/tran-ngoc-bau.md:87` lists it (Layer 4 claim via agent package) | NO | YES (public investment data) | NO | YES (tran-ngoc-bau agent exists) | **INTEGRATE** — Q1 partial YES via agent package; confirm tran-ngoc-bau flow references it; if not yet wired in flow, add it. Signal to cowork-refactory-expert (they own the list/ doc) |
| `list_flagged_bctc_cells` | NO | NO | YES (reads bctc DB) | NO overlap; complements `submit_bctc_correction` | NO | **INTEGRATE** — wire into bctc-analyst human-inspect path; pairs with submit_bctc_correction |
| `submit_bctc_correction` | NO | NO | YES (writes bctc_corrections table) | NO | NO | **INTEGRATE** — wire into bctc-analyst human-correction path; confirmed MCP entry point for BCTC-HUMAN-CONFIRM pipeline |

**Summary:**
- Deregister (5): `read_bctc_pdf`, `backfill_bctc_scalars`, `compute_accruals`, `get_accuracy_context`, `is_trading_day`
- Integrate (7): `mark_alert_outcome`, `get_market_foreign_flow`, `diagnose_foreign_flow_circuit_breaker` + `reset_foreign_flow_circuit_breaker` (paired), `get_label_accuracy_report`, `get_public_contracts`, `list_flagged_bctc_cells`, `submit_bctc_correction`

**Signal to cowork-refactory-expert (PM responsibility, NFR-COWORK-SIGNAL):** 5 deregistrations require `docs/agents/tools/list/` entries removed; 7 integrations require package/*.md updates. PM queues signal after U3 commit. Architect does NOT touch `docs/agents/tools/{list,package}/`.

**Per-unit DoD:**
- 5 `server.tool()` blocks + orphaned imports removed from `apps/mcp-server/src/interface/mcp/tools/`.
- 7 tool descriptions updated to clarify integration target.
- After deregistration commits: `list_server_tools("vn-market")` raw response does NOT contain any of the 5 deregistered names.
- U2 generator re-run confirms count drop (done via TSU-DEV-U2-PARITY stub, sequenced last).

---

## U4 — Direction+Delta Sweep (get_macro_snapshot)

**Root cause:** `get_macro_snapshot` (and other market-data level tools) serve point-in-time values with no delta vs previous session, violating the project memory rule `feedback_market_data_direction.md`. The Go macro-indicators service (`apps/macro-indicators/`) is the zone for this change — the TypeScript MCP tool is a thin HTTP proxy that passes through JSON.

**ARCH-U4-1 RESOLVED — prev-session data availability per metric:**
- `vnIndex`: `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:84-115` confirms `daily_ohlcv` table has `(code, date, close)`. Prev-session close = `SELECT close FROM daily_ohlcv WHERE code='VNINDEX' ORDER BY date DESC LIMIT 2` (second row). **Persisted — delta is computable.**
- `oilUsd` (brent_crude_usd): `apps/macro-indicators/pkg/infrastructure/repositories.go:260-319` `FetchPrices` reads `commodity_prices` (single row per source, no history). Prev-session NOT persisted. Must emit `prev_session_delta: null`, `direction: "unknown"`.
- `goldUsd` (gold_usd_per_oz): same `commodity_prices` single-row pattern. NOT persisted. null/unknown.
- `usdVnd`: `sbv_rates` table has no history column per BA spec. NOT persisted. null/unknown.

**Fix seam — zone: `apps/macro-indicators/` (separate zone, dev-macro-indicators specialist):**
- `apps/macro-indicators/pkg/application/dtos.go` — extend `SnapshotDTO` struct: add `PrevSessionDelta *float64` and `Direction string` (enum "up"/"down"/"flat"/"unknown") for each of the 4 headline values. Additive only — no existing field renamed or removed (NFR-U4-2).
- `apps/macro-indicators/pkg/application/usecases.go` — delta computation: query `daily_ohlcv` for VNINDEX two-row prev-close; compute `delta = current - prev_close`; assign direction ("up"/"down"/"flat" if |delta| < threshold, "unknown" if prev data absent).
- `apps/macro-indicators/pkg/infrastructure/repositories.go:154-197` `FetchVNIndex` — extend to return prev-close row alongside current.
- TypeScript MCP tool `apps/mcp-server/src/interface/mcp/tools/macro/` — NO change needed. The tool is a passthrough proxy; new JSON fields from the Go service flow through automatically.

**Direction enum (NFR-U4-1):** `"up" | "down" | "flat" | "unknown"` — string, not boolean.

**Sweep verdict — other market-data get_* tools:**

| Tool | Serves level? | Current delta coverage | Required change |
|---|---|---|---|
| `get_market_snapshot` | YES (prices per ticker) | `change_pct` + `change_amt` already in market_prices schema | NONE |
| `get_sector_comparison` | YES (sector scores) | No delta | DEFER — sector composite scores have low delta value vs raw prices; known gap, future sprint |
| `get_technical_indicators` | YES (RSI, MACD) | Inherently directional momentum indicators | NONE |
| `get_carry_trade_signal` | Signal (not raw level) | Directional by design | NONE |
| `get_yield_spread_signal` | Signal | Directional by design | NONE |
| `get_fed_liquidity_spread` | YES (spread in bps) | No delta | DEFER — weekly cadence, low value; serve null delta + "unknown" if needed later |

**Zone flag for fan-out:** U4 is in `apps/macro-indicators/` zone (dev-macro-indicators). This is a SEPARATE zone from `apps/mcp-server/` and can run in parallel without consuming the mcp-server code-in-flight serialization slot.

**Per-unit DoD:**
- `SnapshotDTO` extended with delta+direction fields for all 4 metrics.
- VnIndex delta computed from `daily_ohlcv`; oil/gold/usdVnd emit null/unknown.
- Direction enum matches NFR-U4-1 spec.
- `get_macro_snapshot` response verified via gateway wrapper to include new fields.

---

## U5 — Foreign Flow Null Holding Ratio

**Root cause:** `get_foreign_flow` renders `Holding Ratio: 0.00%` for every ticker every day. The VPS ingest script `vps-scripts/fetch-foreign-flow.sh` fetches only `fBVol/fSVolume/fRoom` from `bgapidatafeed.vps.com.vn`. No `holding_ratio` field exists in the API response. `apps/mcp-server/src/infrastructure/db/vnstockStore.ts:561` falls back to `row.current_holding_ratio ?? 0` — fabricating zero as a real value. This is a DSI invariant violation (never serve fabricated data as real).

**ARCH-U5-1 RESOLVED:** VPS API `bgapidatafeed.vps.com.vn/getliststockdata/` does NOT return a `holding_ratio` or equivalent field. Confirmed by inline API field audit comment in `vps-scripts/fetch-foreign-flow.sh:42-48` (dated 2026-05-30). Ingest pipeline extracts only `fBVol/fSVolume/fRoom`. **Serve-null applies PERMANENTLY for this sprint.** `current_holding_ratio` and `max_holding_ratio` columns remain in schema (FR-U5-3 compliant — no migration).

**Fix seam — zone: `apps/mcp-server/src/interface/mcp/`:**

1. `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts`
   - Lines 89-96 (daily history table): add guard `const hasRealHoldingData = history.some(r => r.holdingRatio > 0)`. Omit `| Holding Ratio` column header and `fmtRatio(row.holdingRatio)` cell when `!hasRealHoldingData`.
   - Lines 78-80 (`holdingRatioChange5d` signal line): gate on `hasRealHoldingData` — omit entire line when false.
   - Line 186 (test path sets `holdingRatio: 0`): after fix, test assertions on holding ratio OUTPUT PRESENCE must assert absent, not present.
   - Remove "holding ratio change" from tool description string until data is real.

2. `apps/mcp-server/src/domain/services/foreignFlowAnalyzer.ts` (NFR-U5-2)
   - `holdingRatioChange5d` computation: add explicit guard `if (history.every(r => r.holdingRatio === 0)) { holdingRatioChange5d = null; }`. Add `is_holding_ratio_fabricated: true` flag to `ForeignFlowSignal` so consumers can gate on it.

3. `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts`
   - `foreign_holding_ratio` field (from `current_holding_ratio`): emit `null` if value is 0. Never emit `0` as a real ratio.

**DB seam (no migration):** `apps/mcp-server/src/infrastructure/db/vnstockStore.ts:561` — the `?? 0` fallback is the root fabrication point. The fix is at the output layer (serve-null) not at this seam; the store may keep returning 0 but the tool formatter and analyzer must not render it as a real ratio.

**Known data gap:** VPS API does not expose holding_ratio. A future sprint will require a dedicated source (vnstock holding-ratio API or manual feed). This is NOT a sprint failure per BA spec.

**Per-unit DoD:**
- `get_foreign_flow` output does NOT contain `Holding Ratio` column or `Holding ratio change (5d)` line when all holding ratios are 0.
- `get_company_profile` `foreign_holding_ratio` emits null (not 0) when `current_holding_ratio` is 0.
- `foreignFlowAnalyzer.ts` guard prevents fabricated `holdingRatioChange5d` from propagating.
- Test at `foreignFlowTools.ts:186` updated: asserts holding ratio column ABSENT.

---

## U6 — TSH Leftover Merge Verdicts

**Root cause:** TSH sprint (2026-05-31) produced written diffs for overlapping tool pairs but never executed the merges or description updates. ARCH-U6-1 requires architect rulings on 4 pairs/groups.

**ARCH-U6-1 RESOLVED — per-pair verdict with rationale:**

**FR-U6-1: `get_patterns` vs `get_technical_indicators`**
KEEP BOTH — DESCRIPTION UPDATE ONLY.
- `get_patterns`: RAG-backed (`rag_analyses`), semantic historical precedent lookup, natural-language pattern recognition.
- `get_technical_indicators`: Go TA microservice (port 5003), quantitative price-history derived indicators (RSI, MACD, Bollinger).
- Different data sources, different computation models, different consumer use cases. No merge. Description update: clarify "historical pattern match from RAG corpus" vs "quantitative momentum indicators from TA engine (port 5003)".

**FR-U6-2: `trigger_*_vps_fetch` x5**
KEEP SEPARATE — DESCRIPTION UPDATE ONLY.
Schema divergence precludes clean consolidation:
- `trigger_bctc_vps_fetch`: params `tickers`, `verbose`, `dry_run`; returns `{queued, attempted, success, failed, log_tail}`
- `trigger_price_vps_fetch`: params `tickers`, `verbose`, `dry_run`; returns `{service, attempted, success, failed, log_tail}` (different key: `service` not `queued`)
- `trigger_news_vps_fetch`: NO `tickers` param (source-based, no ticker scope); return schema different
- `trigger_sbv_vps_fetch`, `trigger_foreign_flow_vps_fetch`: distinct SSH scripts, distinct return shapes
A unified `trigger_vps_fetch(source: enum)` would require a typed union schema that is harder to consume than 5 distinct tools. Return-on-investment of consolidation is negative. Description update per tool: document the VPS script each invokes and the expected return shape.

**FR-U6-3: `get_market_summary` vs `generate_market_summary`**
KEEP BOTH — DESCRIPTION UPDATE ONLY.
Verified via `apps/mcp-server/src/interface/mcp/tools/briefings/summaryTools.ts:49-193`:
- `get_market_summary`: read-cache-first — if a cached summary exists, return it; else generate. Consumer: `digest-predict/daily.md` (cache-tolerant reads).
- `generate_market_summary`: force-regenerate always (cache bypassed). Consumer: `digest-predict/weekly.md` (forced fresh generation).
Both share the `generatePeriodicSummary()` use-case but have intentionally different cache semantics. No merge. Description update: clarify caching semantics ("read-cache-first" vs "force-regenerate").
Check cowork flow before any future removal — `get_market_summary` may be referenced in cowork flows per BA edge-case note.

**FR-U6-4: `get_insider_signals` vs `get_insider_transactions`**
KEEP BOTH — DESCRIPTION UPDATE ONLY.
Verified via:
- `apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts:100-152`: `get_insider_signals` = domain classifier, requires caller to provide `transactions[]` array as input parameter. No DB call. Test-first domain logic.
- `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts:79-175`: `get_insider_transactions` = DB-backed SSC disclosure lookup from `insiderStore` (max lookback 90d→180d, FIX-H in RAPID-DATA-LAYER). Returns raw rows with streak detection.
Different layers (domain vs infrastructure-backed), different inputs (caller-provided vs DB query), different outputs (classification digest vs raw rows). Description update: clarify "`get_insider_signals` is a classification engine — caller must provide `transactions[]`; `get_insider_transactions` is a DB reader from SSC disclosure store".

**Per-unit DoD:**
- Description strings updated on all 9 tools (2 patterns pairs + 5 triggers + market_summary pair + insider pair).
- No `server.tool()` blocks removed in U6 (all verdicts: keep separate).
- NFR-U6-3 not triggered (no removals in U6).

---

## Risk Flags

**R-1 (U2 count race):** U3 removes 5 tools; U6 removes 0. U2-PARITY test must run LAST. PM sequences TSU-DEV-U2-PARITY as final mcp-server commit.

**R-2 (U1 handler wrapping):** `server._registeredTools` is a private field. The pattern is already used in `server.ts:203-219` — safe to extend. Shim must be applied AFTER `registerAllTools(server)` completes; applying before will wrap an empty map.

**R-3 (U4 zone split):** `apps/macro-indicators/` is dev-macro-indicators territory. U4 dev-stub must NOT be assigned to dev-mcp-server. The mcp-server serialization slot is unaffected by U4 — both can run in parallel.

**R-4 (U5 test breakage):** `foreignFlowTools.ts:186` sets `holdingRatio: 0` explicitly. Post-fix, any assertion on holding ratio column PRESENCE will break. dev-mcp-server must update test assertions to assert ABSENT (not just "not broken").

**R-5 (U3 cowork signal):** 5 deregistrations require `docs/agents/tools/list/` entries removed. This is cowork-refactory-expert's lane. PM queues signal after U3 commit. Architect does not touch those paths.

---

## Fan-Out Dev-Task Stubs (AC8)

These are STUBS for PO to grind into READY next cycle. Architect does NOT dispatch or grind them.

mcp-server SERIALIZATION rule: one `apps/mcp-server/` code task in flight at a time. U4 is a separate zone (dev-macro-indicators) and can run in parallel. TSU-DEV-U2-PARITY must be sequenced LAST.

| Stub ID | Owner | Zone | Size | Scope | Sequencing |
|---|---|---|---|---|---|
| TSU-DEV-U1 | dev-mcp-server | `apps/mcp-server/src/infrastructure/telemetry/` + `src/interface/mcp/server.ts` + `src/scheduler/system/trackSessionToolUsageJob.ts` | M | Create `perCallCounterStore.ts`, hook proxy shim in server.ts post-registerAllTools, update trackSessionToolUsageJob to read from counter store, remove sessionCount field | First (parallel with TSU-DEV-U2-GEN) |
| TSU-DEV-U2-GEN | dev-mcp-server | `scripts/gen-tool-registry.ts` + `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts` + `scripts/gen-project-stats.ts` | L | Static-grep generator scanning both server.tool + server.registerTool APIs; parity test with deliberate-violation proof; gen-project-stats sync | First (parallel with TSU-DEV-U1) |
| TSU-DEV-U3 | dev-mcp-server | `apps/mcp-server/src/interface/mcp/tools/` | L | Deregister 5 tools (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day); integrate 7 tools (description updates + signal cowork lane) | After TSU-DEV-U1 + TSU-DEV-U2-GEN |
| TSU-DEV-U4 | dev-macro-indicators | `apps/macro-indicators/pkg/application/dtos.go` + `usecases.go` + `pkg/infrastructure/repositories.go:154-197` | M | Extend SnapshotDTO with prev_session_delta+direction; query daily_ohlcv LIMIT 2 for VNINDEX prev-close; null/unknown for oil/gold/usdVnd | Independent — runs in parallel (separate zone, no mcp-server slot consumed) |
| TSU-DEV-U5 | dev-mcp-server | `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts` + `src/domain/services/foreignFlowAnalyzer.ts` + `src/interface/mcp/tools/market-data/companyProfileTools.ts` | M | Serve-null gate for holding ratio: omit Holding Ratio column+signal line when no real data; foreignFlowAnalyzer guard; company profile null emit; update test assertions | After TSU-DEV-U1 + TSU-DEV-U2-GEN (parallel with TSU-DEV-U3 if mcp-server slot allows serial queueing) |
| TSU-DEV-U6 | dev-mcp-server | `apps/mcp-server/src/interface/mcp/tools/` (briefings/, market-data/, analysis/, sector/) | S | Description-only updates on 9 tools (get_patterns, get_technical_indicators, 5x trigger_*_vps_fetch, get_market_summary, generate_market_summary, get_insider_signals, get_insider_transactions) — no server.tool() removals | After TSU-DEV-U3 settles |
| **TSU-DEV-U2-PARITY** | **dev-mcp-server** | `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts` + `docs/data/tool-registry.json` | **S** | **Re-run generator + run parity test after all U3/U6 deregistrations committed; assert final count matches settled toolCount; update project-stats.json** | **LAST — after TSU-DEV-U3 and TSU-DEV-U6 committed** |

---

## [Architect] Brownfield Findings

**Zone:** `apps/mcp-server/src/` (primary — U1/U2/U3/U5/U6) + `apps/macro-indicators/pkg/` (U4 — separate zone) + `scripts/` (U2 generator)
**BUILD-STANDARD:** lean (existing service, new features/fixes across multiple subsystems — no new service scaffolding)

**Verified paths (from BA spec brownfield scan 2026-06-07T08:03:51Z):**
- `apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts:241` — `server.registerTool()` legacy API — root cause of 161 vs 162 delta
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts:303-344` — `buildToolNameMap` handles both APIs; runtime count 162 is correct
- `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts` — reads empty `sessionToolCache`
- `apps/mcp-server/src/infrastructure/cache/sessionToolCache.ts` — populated at SSE handshake only; never fires under gateway model
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:60-101` — `formatForeignFlowOutput` renders Holding Ratio unconditionally
- `apps/mcp-server/src/infrastructure/db/vnstockStore.ts:561` — `holdingRatio: row.current_holding_ratio ?? 0` — fabrication seam
- `vps-scripts/fetch-foreign-flow.sh:42-48` — API field audit comment confirms no holding_ratio in VPS response
- `apps/mcp-server/src/interface/mcp/tools/briefings/summaryTools.ts:49-193` — get_market_summary (read-cache) vs generate_market_summary (force-regenerate) confirmed DISTINCT
- `apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts:100-152` — get_insider_signals: domain classifier, caller-provided input
- `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts:79-175` — get_insider_transactions: DB-backed SSC lookup
- `apps/macro-indicators/pkg/infrastructure/repositories.go:154-197` — FetchVNIndex: single latest row, no prev-session
- `apps/macro-indicators/pkg/infrastructure/repositories.go:260-319` — FetchPrices: single row commodity_prices, no history
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:84-115` — daily_ohlcv: (code, date, close) — VNINDEX prev-session available via LIMIT 2
- `scripts/agents-flow/cowork-match-slots.js` — NO is_trading_day call on main branch (DWF-PHASE1 worktree only)
- `docs/agents/tools/package/tran-ngoc-bau.md:87` — get_public_contracts listed (Layer 4 confirmed)

**Scan clean:** true
