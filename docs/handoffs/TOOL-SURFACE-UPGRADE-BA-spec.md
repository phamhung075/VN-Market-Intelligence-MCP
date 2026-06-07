<!-- size-justification: 310L — 6-unit sprint; each unit has FR+NFR+edge-cases+DDD layer; tool-count reconciliation table load-bearing for U2 generator; all content required for architect handoff -->

# REQ — TOOL-SURFACE-UPGRADE

**Sprint:** TOOL-SURFACE-UPGRADE
**Task:** BA-TSU-1
**Date:** 2026-06-07
**Author:** BA (ba)
**Status:** READY — handoff to architect

---

## Context

Sprint goal: the 162-tool vn-market surface is auditable and honest. Six sub-units ordered by priority: U1+U2 (P1, independent, both dev-mcp-server) → U3 (P2, can proceed on 4-layer matrix) → U4/U5 (P2) → U6 (P3).

**True tool count at spec time:**
- `/health` toolCount: **162**
- Source extraction (`server.tool()` unique names in `apps/mcp-server/src/interface/mcp/tools/**/*.ts`): **161**
- `project-stats.json` toolCount: **161**
- `docs/data/system-map.json` tools[]: **146** (stale — out of scope per scope_out; cowork-refactory-expert lane owns it)
- **Discrepancy: /health=162 vs source=161 (delta=1).** U2 registry generation MUST settle this by reading Object.keys(registeredToolsMap) at startup and comparing against source names. The generator is the arbiter; project-stats.json must sync to its output.

**Tools in source but NOT in system-map (17 net-new since 2026-05-03):**
backfill_bctc_scalars, emit_pressure_state, finalize_bctc_refine, get_agm_plan, get_bctc_page_image, get_bctc_page_text, get_bctc_pending_refine, get_bctc_refined, get_bctc_series, get_company_profile, get_market_cap, get_market_foreign_flow, is_trading_day, list_flagged_bctc_cells, push_bctc_refined_unit, submit_bctc_correction, task_force_release_orphan.
**Tools in system-map but NOT in source (2 ghosts):** get_market_hexagram (deregistered by TSH), sequential_market_analysis.

**Constraint respected:** `docs/agents/tools/{list,package}/` are owned by cowork-refactory-expert (concurrent lane) — BA and architect must NOT touch those paths in this sprint.

---

## Requirements

---

### U1: Per-call telemetry counter — DDD layer: Infrastructure + Interface

**Root cause:** `trackSessionToolUsageJob` aggregates `sessionToolCache` which is always empty because the gateway dials per-call and drops the SSE connection. No tool call is ever counted since the gateway cutover. `tool-usage-stats.json` always shows `sessionCount:0 / toolCounts:{}`.

**FR-U1-1 (INSTR):** Add a server-side per-tool invocation counter that increments on every tool handler entry — independent of session lifetime. The counter store must survive across the 8-hour aggregation job without resetting between gateway connections.

**FR-U1-2 (PERSIST):** The job `trackSessionToolUsageJob` (or a replacement) writes the accumulated counts to `docs/agent-memory/modules/tool-usage-stats.json` in the format `{ generatedAt, sessionCount, uniqueTools, toolCounts: { [toolName]: number } }`. `sessionCount` may be repurposed to count gateway call batches or dropped if semantically wrong post-fix — architect decides.

**FR-U1-3 (GATE):** A deliberate call_tool invocation (in-container) must increment its counter in `tool-usage-stats.json` within 8h. This is the QA verification bar.

**NFR-U1-1:** The counter must not block tool execution. Fire-and-forget increment (sync write to in-memory map; async flush to disk every N calls or at job interval).

**NFR-U1-2:** The counter resets across container restart — no persistence concern. Aggregation window = since last container start or last job run, whichever is shorter.

**Edge cases:**
- Tool name collision: if the counter key differs from the registered tool name, QA cannot verify. Use the exact string passed to `server.tool("name", …)` as key.
- The gateway strips session IDs — sessionCount will never reflect real user sessions. Either remove sessionCount or rename to `invocationBatches`.
- If a tool errors, count it anyway (the call reached the tool layer).

**DDD layer:** Infrastructure (new counter store / flush job); Interface (hook in MCP tool dispatch).

---

### U2: Registry generation from source + parity assertion — DDD layer: Infrastructure + Interface

**Root cause:** `docs/data/tool-registry.json` was last updated 2026-05-03 (hand-edited). It has decayed to 125 listed tools vs 162 live. TSH ran a manual reconcile on 2026-06-01 that settled to 154 within 6 days. Root cause = hand-maintenance; fix = generation.

**FR-U2-1 (GENERATOR):** A script (location: `scripts/gen-tool-registry.ts` or equivalent, matching `_generation_command` pattern in project-stats.json) generates `docs/data/tool-registry.json` by:
1. Reading all `server.tool("name", description, ...)` call-sites in `apps/mcp-server/src/interface/mcp/tools/**/*.ts`.
2. Grouping tools by their source file's category folder (e.g. market-data, sector, system, bctc, macro, etc.) to populate the `groups[]` array.
3. Writing `lastUpdated`, `totalCount` (= source extraction count), `groups[]`.

**FR-U2-2 (PARITY-TEST):** A test (location: `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts`) asserts that:
- `tool-registry.json` totalCount == source-extracted count (grep `server.tool(` unique names).
- Every tool name in the registry exists in the source.
- DELIBERATE VIOLATION PROOF: the test must be shown to fail when a new tool is added without regenerating the registry (inject one fake name; assert test fails; revert). This is the anti-false-green gate per NFR-FENCE.

**FR-U2-3 (COUNT-SETTLE):** After the generator runs, compare `totalCount` in the generated registry against `/health` toolCount. If they differ by more than 0, architect must diagnose before closing U2. The source of truth is the generator output, not `/health` — `/health` uses `Object.keys(registeredToolsMap)` at runtime which may include dynamically registered tools not caught by static grep. If static grep ≠ runtime, architect documents the delta in the brief.

**FR-U2-4 (SYNC-PROJECT-STATS):** After U2 generator settles the true count, `project-stats.json` `toolCount` field must be updated to match. Generator command is already noted as `bun scripts/gen-project-stats.ts` — the `gen-project-stats` script must consume the registry output or share the same source-extraction logic.

**NFR-U2-1:** The generator is the ONLY way to update tool-registry.json. The file header must carry `"_maintained_by": "generator (do not hand-edit)"`.

**NFR-U2-2:** Scope: `apps/mcp-server/` and `scripts/` only. Do NOT touch `docs/agents/tools/{list,package}/` (cowork-refactory-expert owns those).

**Edge cases:**
- Tools registered outside `tools/**/*.ts` (e.g. directly in `server.ts`): architect must audit whether any exist; if so, generator must also scan `server.ts` registration calls.
- `get_market_hexagram` ghost: system-map still lists it but source no longer has it. Generator will naturally omit it. This is correct behavior, not a bug.
- `sequential_market_analysis` ghost in system-map: same handling — generator omits it if not in source.

**DDD layer:** Infrastructure (generator script, file write); Interface (parity test).

---

### U3: 12 weak-claim tools — integrate or deregister — DDD layer: Interface

**Root cause:** 12 tools have zero claims across all 4 usage layers (agents/flows/skills/cron). Each must be triaged using the 5-question checklist before any action.

**FR-U3-1 (CHECKLIST):** For each of the 12 tools, the architect brief must provide a written verdict using the 5-question audit:
1. Is the tool called by any agent/flow/skill file (beyond tests or bootstrap)?
2. Is the tool called internally by another tool (internal call chain)?
3. Does the tool serve live data that would be lost if removed?
4. Is there an overlap with an existing tool that already covers the use case?
5. Is there a concrete plan to wire the tool within this sprint?

Answer YES to any of 1/2/3/5 = INTEGRATE (wire into a named flow or agent package). Answer NO to all 5 = DEREGISTER.

**FR-U3-2 (ORDERED VERDICTS):** The 12 tools and their pre-BA read (subject to architect's 5-question confirmation):

| Tool | Pre-BA read | Likely verdict |
|---|---|---|
| `read_bctc_pdf` | Zero uses across ALL 4 layers confirmed (PO audit); no agent calls it | Deregister candidate — needs internal-call check first |
| `mark_alert_outcome` | TSH FR-2 wrote a diff; DISTINCT from `write_alert_verdict` (different datastore, lifecycle) — TSH verdict was "clarify descriptions", not merge | Integrate: update description; or merge if architect re-reads diff and finds genuine overlap |
| `get_market_foreign_flow` | Overlaps `get_foreign_flow` per PO scope; market-wide aggregate vs per-ticker | Architect diff required: if market-wide aggregate is genuinely distinct from per-ticker, keep+wire; if redundant, deregister |
| `backfill_bctc_scalars` | Admin/maintenance tool; no regular flow wire | Check internal call; if dev-only utility with no runtime use, deregister |
| `compute_accruals` | No flow/agent claim found | Check if analyst agents should wire it; if no concrete plan, deregister |
| `diagnose_foreign_flow_circuit_breaker` | Debug tool; `reset_foreign_flow_circuit_breaker` is its sibling | Keep paired with reset; wire both into ops flow or debug package |
| `get_accuracy_context` | No claim; accuracy tools have `get_calibration_report` + `get_label_accuracy_report` | Diff vs accuracy trio; integrate if distinct |
| `get_label_accuracy_report` | TSH FR-3 confirmed DISTINCT from `get_calibration_report`/`get_prediction_accuracy` | Integrate: wire into market-analyst or ops package |
| `get_public_contracts` | No flow claim; public investment data | Check if supply-chain flow or sector tools reference it; wire or deregister |
| `is_trading_day` | No agent claim but used internally by cowork-match-slots.js (DWF-PHASE1 FR-P1-4) | INTEGRATE: confirm internal use; add to cowork tool package |
| `list_flagged_bctc_cells` | No agent claim; BCTC debug utility | Wire into bctc-analyst flow or deregister if purely dev-debug |
| `submit_bctc_correction` | No agent claim; BCTC human corrections | Wire into bctc-analyst or ops flow; or confirm it is a human-UI-only tool (web endpoint covers it) |

**FR-U3-3 (VERDICT-WRITE):** After architect determines integrate vs deregister for each tool:
- INTEGRATE: PM must add the tool to the named agent's tools/package/*.md. Signal to cowork-refactory-expert lane for their doc-refresh.
- DEREGISTER: dev-mcp-server removes the `server.tool(…)` block + any orphaned imports. U2 generator re-run confirms count drop.

**NFR-U3-1:** `read_bctc_pdf` must be resolved FIRST before any other deregister action — it is the most likely removal candidate and settling it first stabilizes the count for U2.

**NFR-U3-2:** No tool removed off a single-layer grep. All 4 layers + internal-call check required per PO anti-pattern note (2026-05-03 failure: 6/6 false positives from single-layer grep).

**Edge cases:**
- `is_trading_day` may be called from JavaScript (cowork-match-slots.js) not TypeScript — the 4-layer grep may miss it. Architect must check `.js` files in the cowork pipeline.
- `mark_alert_outcome` TSH diff already written: architect can re-read `docs/REQ_TOOL-SURFACE-HYGIENE.md` FR-2 for the datastore diff. No re-diffing needed unless content changed since 2026-05-31.

**DDD layer:** Interface (tool registration + deregistration); Application (if integrate = wire into use case flow).

---

### U4: Direction+delta sweep — market-data get_* tools — DDD layer: Interface + Domain

**Root cause:** `get_macro_snapshot` (and other market-data level tools) serve point-in-time values with no delta vs previous session. Violates the "never snapshot-only" rule established in project memory `feedback_market_data_direction.md`.

**FR-U4-1 (MACRO-SNAPSHOT):** `get_macro_snapshot` must serve `prev_session_delta` and `direction` for all 4 headline values: `vnIndex`, `oilUsd`, `goldUsd`, `usdVnd`. Delta = current - prev_session close. Direction = "up"/"down"/"flat" (flat if |delta| < threshold).

**FR-U4-2 (SWEEP):** Architect must audit all `get_*` tools in the market-data group and produce a written sweep verdict:
- For each tool: does it serve numeric levels without direction/delta? If yes → add delta+direction.
- Candidate tools to sweep: `get_market_snapshot`, `get_sector_comparison`, `get_technical_indicators` (already serves deltas via RSI/MACD diffs — likely OK), `get_carry_trade_signal`, `get_yield_spread_signal`, `get_fed_liquidity_spread`.
- Any tool serving a level metric (price, rate, index) without a prev-session comparison must add one.

**FR-U4-3 (DATA-PATH):** The prev-session value must come from DB (persisted previous close), NOT re-computed at call time. If prev-session data is not persisted for a given metric, the field is `null` + `direction: "unknown"` — never fabricated.

**NFR-U4-1:** Direction field must be a string enum `"up" | "down" | "flat" | "unknown"` — not a boolean.

**NFR-U4-2:** Additive change only. No existing field renamed or removed. New fields appended to response JSON.

**NFR-U4-3:** Per `feedback_market_data_direction.md`: show direction+delta %, never snapshot only. Vietnamese user-facing strings (where applicable) must include the direction label.

**Edge cases:**
- `get_macro_snapshot` fetches live data from multiple sources (SBV, GSO, VPS). Prev-session may require a persisted snapshot job or reading the last DB row per metric. Architect must confirm which table to read prev-session from.
- `vnIndex` prev-session: likely in `daily_ohlcv` for the index code. Confirm code used.
- Currency rates (usdVnd): may not have a DB row for "yesterday". Architect documents fallback.

**DDD layer:** Interface (tool response schema extension); Domain (direction logic); Infrastructure (prev-session query).

---

### U5: get_foreign_flow dead holding_ratio field — DDD layer: Infrastructure + Interface

**Root cause:** `get_foreign_flow` renders `Holding Ratio: 0.00%` for every row every day. The VPS `fetch-foreign-flow.sh` script fetches `fBVol / fSVolume / fRoom` from `bgapidatafeed.vps.com.vn` but does NOT fetch a holding_ratio field. The `push-foreign-flow` endpoint receives records with no `holding_ratio`, so `vnstockStore.ts:561` falls back to `row.current_holding_ratio ?? 0` = always 0. The displayed ratio is fabricated (DSI invariant violation).

**FR-U5-1 (SERVE-NULL):** Until the ingest pipeline sends real holding ratio data, `get_foreign_flow` must NOT render `Holding Ratio` in the table and must NOT output a `Holding ratio change (5d)` line. Replace with null / omit the column and the signal line entirely.

**FR-U5-2 (INGEST-AUDIT):** Architect must audit whether the VPS API (`bgapidatafeed.vps.com.vn` batch endpoint) returns a holding_ratio field for each stock. Options:
- If the API returns a holding_ratio field: update `fetch-foreign-flow.sh` to extract and forward it, and update the mcp-server `push-foreign-flow` handler to persist it.
- If the API does NOT return holding_ratio: the column stays null in DB; FR-U5-1 serve-null applies permanently until an alternative source is wired.

**FR-U5-3 (DB-SCHEMA):** `current_holding_ratio` and `max_holding_ratio` columns in `vnstockStore.ts` remain in schema. No migration needed. Only the serving and display logic changes.

**NFR-U5-1:** DSI invariant: never serve a fabricated value as real. A `0.00%` holding ratio with no note is worse than `null`. Field must either carry `is_estimate: true` + note or be absent.

**NFR-U5-2:** `holdingRatioChange5d` in `ForeignFlowSignal` (domain/services/foreignFlowAnalyzer.ts) is computed from `holdingRatio` values which are all 0 → the change is always 0. After FR-U5-1, either remove this computation or gate it: skip if all holdingRatio values are 0.

**Edge cases:**
- Test path in `foreignFlowTools.ts:186` sets `holdingRatio: 0` explicitly. After fix, tests that assert on the holding ratio output must be updated to assert on null/absent.
- `formatForeignFlowOutput` currently has a "Holding Ratio" table column header and a `Holding ratio change (5d)` signal line. Both must be conditionally omitted when holdingRatio is null/unknown.
- `get_company_profile` also serves `foreign_holding_ratio` from `current_holding_ratio`. Same issue — serve null if 0. Add to sweep scope.

**DDD layer:** Infrastructure (ingest path + store query); Interface (output formatting + null handling); Domain (`foreignFlowAnalyzer.ts` guard).

---

### U6: Execute TSH leftover merges — DDD layer: Interface

**Root cause:** TSH sprint (2026-05-31) produced written diffs for overlapping tool pairs but the merges were never executed. U6 converts those diffs into implementations.

**FR-U6-1 (GET-PATTERNS vs GET-TECHNICAL-INDICATORS):** TSH FR-4 confirmed these are DISTINCT (different data sources: RAG rag_analyses vs Go TA microservice port 5003). Required action: update both tool descriptions to make the distinction explicit (semantic historical precedent lookup vs quantitative price-history derived indicators). No merge. This was scope-locked to "clarify descriptions" by the diff.

**FR-U6-2 (TRIGGER_*_VPS_FETCH x5 consolidation):** TSH FR-5 was architect-discretion OPTIONAL. U6 re-examines: the 5 tools are thin SSH triggers with similar shape but different VPS scripts and diverging return schemas (`bctc` returns `{queued, …}`, `price` returns `{service, …}`). Architect must now decide implement-or-keep-separate with a written rationale in the brief. If consolidated: `trigger_vps_fetch(source: enum["bctc","price","news","foreign_flow","sbv"])` — unified schema (typed union for source-specific fields). If kept separate: description update only.

**FR-U6-3 (GET-MARKET-SUMMARY vs GENERATE-MARKET-SUMMARY):** New in U6 scope (identified in PO sprint goal). Architect must diff: are `get_market_summary` and `generate_market_summary` genuinely distinct? If same — merge. If distinct — clarify descriptions.

**FR-U6-4 (GET-INSIDER-SIGNALS vs GET-INSIDER-TRANSACTIONS):** New in U6 scope. Architect must diff both tools and determine merge vs description-clarify. Note from prior BA work on DSI: `get_insider_transactions` extends max lookback 90d→180d (FIX-H in RAPID-DATA-LAYER). Check if `get_insider_signals` is a higher-level aggregation of `get_insider_transactions`.

**NFR-U6-1:** For each pair/group: written source diff in architect brief before any merge action. No blind merge.

**NFR-U6-2:** If merge executed: zero caller breakage proven by tests. Cron jobs and agent flows re-pointed.

**NFR-U6-3:** After any `server.tool()` removal: U2 generator re-run updates the registry and parity test confirms count.

**Edge cases:**
- `get_market_summary` may be called from cowork-team flow — check cowork flows before removing.
- `get_insider_signals` vs `get_insider_transactions` differ in output granularity (signals = digest, transactions = raw rows). If distinct, description update not merge.

**DDD layer:** Interface (registration consolidation or description update); Application (use-case merge if genuinely same).

---

## Non-Functional Requirements (cross-unit)

- **NFR-REBUILD:** Any `apps/mcp-server/` code change requires ops to rebuild the container (`build --no-cache` + `force-recreate`, never restart-stale). QA verifies via gateway wrapper, raw responses not badges.
- **NFR-FENCE:** "exit 0" is not acceptance. Parity test (U2) must have a deliberate-violation proof. For deregistrations (U3/U6): verify tool absence from gateway list via `list_server_tools("vn-market")` raw, not a count badge.
- **NFR-NO-BRANCH:** All work on `main`. Scoped `git add <file>` per file. Never `-A`.
- **NFR-ZONE:** Implementation zone = dev-mcp-server (zone: `apps/mcp-server/src/interface/mcp/`). Registry generator = `scripts/`. VPS ingest fix (U5, if needed) = ops lane + VPS scripts.
- **NFR-COMMIT-MUTEX:** dev-mcp-server must acquire commit-mutex before staging. Do not batch U1+U2+U3... in one commit — separate commits per unit.
- **NFR-COWORK-SIGNAL:** Any tool renamed or removed must be signalled to cowork-refactory-expert lane (they own `docs/agents/tools/{list,package}/`). BA notes: the 3 stale `fetch_ssc_reports` refs in `docs/agents/tools/list/` are THEIR files — do not touch here.
- **NFR-SEQUENCING:** U1+U2 parallel (independent). U3 can proceed on 4-layer matrix now; U1 telemetry improves it but is not a blocker. U4/U5 after U1+U2. U6 last (P3).

---

## Blockers for PO

None. All decisions are architect-level:

- **ARCH-U2-1:** Does static grep of `server.tool()` in tools/**/*.ts fully capture all registrations, or are there registrations in server.ts or elsewhere? Architect audits and documents.
- **ARCH-U2-2:** Source count (161) vs /health count (162) delta of 1 — architect resolves before closing U2.
- **ARCH-U3-1:** `is_trading_day` — confirm internal call path from cowork-match-slots.js before any deregister action.
- **ARCH-U4-1:** Prev-session data availability per metric (vnIndex, oilUsd, goldUsd, usdVnd) — confirm DB table and column before implementation.
- **ARCH-U5-1:** Does `bgapidatafeed.vps.com.vn` batch endpoint return a holding_ratio or equivalent field? Architect confirms via live curl or VPS API docs before implementing the ingest side.
- **ARCH-U6-1:** Architect rules on FR-U6-2 (5 triggers consolidate or keep) and FR-U6-3/4 (new pairs) before PM task breakdown.

---

## Edge Cases (cross-unit)

- **Tool count race (U2+U3+U6):** U3 and U6 deregistrations change the count. U2 parity test must be run AFTER all deregistrations settle. PM must sequence U2 parity-test commit last in the dev pipeline.
- **Gateway session blindness (U1):** sessionCount in tool-usage-stats.json is meaningless post-gateway-cutover. Architect must propose whether to repurpose, rename, or remove the field.
- **VPS holding_ratio (U5):** If the VPS API does not expose holding_ratio, this field will remain null permanently in this sprint. A future sprint will need a dedicated data source (vnstock holding-ratio API or manual feed). BA marks this as a known data gap, not a sprint failure.
- **TSH FR-2 resurface (U3):** `mark_alert_outcome` TSH diff said "distinct — clarify descriptions." If U3 audit finds a genuine merge case, that is new information — re-submit to architect. Do not merge blindly on the TSH diff alone.

---

## DDD Layer Summary

| Unit | Requirement | Layer |
|---|---|---|
| U1 | Per-call counter + flush job | Infrastructure + Interface |
| U2 | Registry generator + parity test | Infrastructure + Interface |
| U3 | 12 weak-claim tool verdicts | Interface (+ Application if wire) |
| U4 | Direction+delta sweep | Interface + Domain + Infrastructure |
| U5 | Foreign flow null holding ratio | Infrastructure + Interface + Domain |
| U6 | TSH leftover merges | Interface (+ Application if merge) |

---

## Architect Task

**Task to create:** ARCH-TSU in `docs/data/orch/orch-state.json .task_board.backlog[]`

Architect must produce:
1. Technical design for U1 counter hook (where in the MCP dispatch chain, counter store type, flush trigger).
2. Generator design for U2 (static grep vs startup dump — recommend static grep as it avoids boot-time dependency).
3. Written 5-question verdicts for all 12 U3 tools.
4. U4 sweep table: each market-data get_* tool, current delta coverage, required change.
5. U5 VPS API confirmation + ingest fix design or "serve null" permanent gate.
6. U6 diffs for get_market_summary/generate_market_summary and get_insider_signals/get_insider_transactions. Trigger consolidation ruling.

---

## [Architect] Brownfield Findings

**Brownfield scan completed:** 2026-06-07T08:03:51Z
**Zone:** `apps/mcp-server/` (primary) + `apps/macro-indicators/` (U4 Go service) + `vps-scripts/` (U5 ingest)
**BUILD-STANDARD:** lean (existing service, new features/fixes across multiple subsystems)

---

### Verified Paths

- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — toolRegistry array, 130 registryFns, centralised SSOT for all tool registrations
- `apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts:241` — uses `server.registerTool()` (legacy API), NOT `server.tool()` — **root cause of 161 vs 162 delta**
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts:303-344` — buildToolNameMap probe handles BOTH `server.tool()` AND `server.registerTool()` — runtime count of 162 is correct
- `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts` — aggregates `sessionToolCache` which is always empty post-gateway-cutover
- `apps/mcp-server/src/infrastructure/cache/sessionToolCache.ts` — populated via `sessionToolCache.set(sessionId, ...)` in server.ts:205 at SSE handshake — never triggered by gateway per-call model
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:60-101` — `formatForeignFlowOutput` renders Holding Ratio column + `holdingRatioChange5d` line unconditionally
- `apps/mcp-server/src/infrastructure/db/vnstockStore.ts:561` — `holdingRatio: row.current_holding_ratio ?? 0` — confirmed ?? 0 fabrication
- `vps-scripts/fetch-foreign-flow.sh:42-48` — API field audit comment (2026-05-30) documents `bgapidatafeed.vps.com.vn` returns ONLY `fBVol/fSVolume/fRoom` — no holding_ratio field
- `apps/mcp-server/src/interface/mcp/tools/briefings/summaryTools.ts:49-193` — get_market_summary and generate_market_summary are DISTINCT (read-cache-first vs force-regenerate)
- `apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts:100-152` — get_insider_signals = domain classifier, takes transactions as input parameter
- `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts:79-175` — get_insider_transactions = DB-backed SSC lookup from insiderStore
- `apps/macro-indicators/pkg/infrastructure/repositories.go:154-197` — FetchVNIndex reads market_prices WHERE code='VNINDEX' (latest only, no prev-session row)
- `apps/macro-indicators/pkg/infrastructure/repositories.go:260-319` — FetchPrices reads commodity_prices (single row, no history)
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:84-115` — daily_ohlcv has (code, date, close) — prev-session for VnIndex available via ORDER BY date DESC LIMIT 2
- `scripts/agents-flow/cowork-match-slots.js` — NO is_trading_day call found in current main branch script; BA spec cites worktree version
- `docs/agents/tools/package/tran-ngoc-bau.md:87` — get_public_contracts listed in package (Layer 4 confirmed)
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:270-295` — diagnose/reset circuit breaker pair: internally called via direct function call, not via MCP tool routing

---

### ARCH-BLOCKER RESOLUTIONS

**ARCH-U2-1 RESOLVED:** No tool registrations exist outside `tools/**/*.ts`. `server.ts` does not call `server.tool()` directly — it invokes `registerAllTools(server)` which runs the `toolRegistry` array from `registry.ts`. The only non-standard registration is `server.registerTool()` in `sequential-market-analysis.ts`, which IS under `tools/`. Generator scope = `tools/**/*.ts`, scanning for both `server.tool(` and `server.registerTool(` patterns.

**ARCH-U2-2 RESOLVED:** Source count 161 = count of `server.tool()` calls. Runtime count 162 = 161 + 1 (`sequential_market_analysis` via `server.registerTool()`). Both are correct. Generator must scan BOTH APIs to output totalCount=162. No mystery registration exists outside the tools/ directory.

**ARCH-U3-1 RESOLVED:** `scripts/agents-flow/cowork-match-slots.js` (main branch) does NOT call `is_trading_day`. The BA spec cited a worktree version (`DWF-PHASE1`). In the current main codebase, `is_trading_day` has zero agent/flow/skill calls outside the tools list docs/ and test files. Verdict: DEREGISTER — see U3 verdicts below.

**ARCH-U4-1 RESOLVED:** VnIndex prev-session = `daily_ohlcv ORDER BY date DESC LIMIT 2` (second row = previous trading day close). Oil/gold prev-session = not persisted (commodity_prices has single row per source, no history). UsdVnd prev-session = not persisted (sbv_rates has no history column). Delta can only be served honestly for VnIndex this sprint; Oil/Gold/UsdVnd must emit `direction: "unknown"`, `prev_session_delta: null`.

**ARCH-U5-1 RESOLVED:** VPS API `bgapidatafeed.vps.com.vn/getliststockdata/` does NOT return a holding_ratio field. Confirmed via inline API field audit comment in `vps-scripts/fetch-foreign-flow.sh:42-48` (dated 2026-05-30). The ingest pipeline extracts only `fBVol/fSVolume/fRoom`. Serve-null applies PERMANENTLY for this sprint. `current_holding_ratio` and `max_holding_ratio` columns remain in schema (FR-U5-3 compliant).

**ARCH-U6-1 RESOLVED:** (a) 5 triggers = KEEP SEPARATE (schema diverges: bctc has {queued,...}, news has no tickers param, price returns {service,...}); description updates only. (b) get_market_summary vs generate_market_summary = KEEP BOTH (read-cache-first vs force-regenerate, distinct consumer use cases confirmed in digest-predict flows). (c) get_insider_signals vs get_insider_transactions = KEEP BOTH (domain classifier with caller-provided data vs DB-backed SSC lookup — different layers, different inputs).

---

### U1: Per-Call Counter Design

**Root cause confirmed:** `sessionToolCache` is never populated in the gateway model. Gateway dials SSE per-call; `server.ts:205` sets `sessionToolCache.set(sessionId, ...)` at SSE handshake — that handshake never fires for gateway calls.

**Design — server proxy shim:**
- New file: `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts`
  - Exports singleton `const perCallCounterStore: Map<string, number>` (tool name → invocation count)
  - Exports `function incrementTool(name: string): void` — fire-and-forget sync write to Map
  - Exports `function getSnapshot(): Record<string, number>` — shallow copy for job reads
  - Exports `function resetCounters(): void` — called by job after flush (or at container start)
  - DDD layer: Infrastructure
- Hook location: `apps/mcp-server/src/interface/mcp/server.ts` — after `registerAllTools(server)` runs, wrap the registered tool handlers. Pattern: iterate `Object.entries(server._registeredTools)`, replace each `handler` with `(args) => { incrementTool(name); return originalHandler(args); }`.
  - Alternative (cleaner): in `registry.ts`, wrap each `registryFn` call in a proxy. But `_registeredTools` access is already used in `server.ts:203-219` — same pattern.
  - Recommended: minimal shim in `server.ts` immediately after `registerAllTools()` (line ~220). One loop, 5 lines.
- Modified file: `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts`
  - Replace `sessionToolCache.snapshot()` logic with `perCallCounterStore.getSnapshot()`
  - `sessionCount`: rename to `invocationBatches` with value `1` (one batch = one container lifetime since last job run). Or remove field if semantically wrong — **architect decision: REMOVE `sessionCount` field from output schema**. The field is meaningless post-gateway. `uniqueTools` = Object.keys(toolCounts).length, remains valid.
- QA gate: invoke any tool via gateway wrapper once; wait ≤8h (or force-run the job); assert `tool-usage-stats.json toolCounts[<toolName>] >= 1`.
- NFR-U1-1 satisfied: `incrementTool()` is synchronous Map write — zero blocking I/O.
- NFR-U1-2 satisfied: Map is in-memory, resets on container restart.

---

### U2: Registry Generator Design

**Design — static grep generator:**
- New file: `scripts/gen-tool-registry.ts`
  - Scans `apps/mcp-server/src/interface/mcp/tools/**/*.ts`
  - Extracts tool names from BOTH `server.tool("name",` AND `server.registerTool("name",` patterns using regex
  - Groups by source folder (category = parent directory name of the source file, e.g. `market-data`, `financial-reports`, `system`, `alerts`, `macro`, `briefings`, `sector`, `portfolio`, `backtesting`, `news-analysis`, `kinhdich`, `analysis`)
  - Writes `docs/data/tool-registry.json` with: `_maintained_by: "generator (do not hand-edit)"`, `lastUpdated`, `totalCount`, `groups[]`
  - Expected output: totalCount=162 (161 server.tool + 1 server.registerTool)
- New file: `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts`
  - Reads `docs/data/tool-registry.json`
  - Runs same static grep on `tools/**/*.ts`
  - Asserts: `registry.totalCount == source-extracted count`; `every registry tool name exists in source`
  - Deliberate-violation proof: insert fake name `"__test_fake_tool__"` into registry; assert test goes RED; revert
- `gen-project-stats.ts` update: import registry totalCount from `tool-registry.json` (or run the same extractor) to sync `project-stats.json toolCount`
- NFR-U2-1: `_maintained_by` header in JSON output
- NFR-U2-2: scope = `apps/mcp-server/` + `scripts/` only

---

### U3: 12 Weak-Claim Tool Verdicts

4-layer check completed (agents/flows/skills/cron). Internal-call check completed. Verdicts:

| Tool | Q1 agent/flow | Q2 internal call | Q3 live data | Q4 overlap | Q5 sprint plan | VERDICT |
|---|---|---|---|---|---|---|
| `read_bctc_pdf` | NO (zero across all layers in main) | NO (no tool calls read_bctc_pdf) | NO (only reads static PDFs) | YES (get_bctc_page_text/get_bctc_page_image now cover PDF analysis via OCR/PEK pipeline) | NO | **DEREGISTER** |
| `mark_alert_outcome` | NO agent claims | NO | YES (SQLite alerts table post-hoc scoring) | DISTINCT from write_alert_verdict (different store: alerts table vs pending_verdicts table; different lifecycle: post-hoc vs at-fire-time) | NO | **INTEGRATE: update description to clarify write_alert_verdict=at-fire-time, mark_alert_outcome=post-hoc scoring. Add to alert-commander or ops package.** |
| `get_market_foreign_flow` | NO | NO | YES (market-wide aggregate from daily_ohlcv) | DISTINCT from get_foreign_flow (market-wide SUM vs per-ticker; different source table: daily_ohlcv vs vnstock_trading_stats) | NO | **INTEGRATE: wire into market-analyst or ops package. Description already honest (limitation note about watchlist coverage).** |
| `backfill_bctc_scalars` | NO | NO | NO (admin backfill only) | NO | NO | **DEREGISTER** |
| `compute_accruals` | NO | NO | NO (domain calculation, no live data store dependency) | NO | NO | **DEREGISTER** |
| `diagnose_foreign_flow_circuit_breaker` | NO agent claims | YES — `foreignFlowTools.ts:277` calls `diagnose_foreign_flow_circuit_breaker()` as an internal function (same file, not via MCP routing) | YES (circuit breaker state) | SIBLING with reset tool | NO | **INTEGRATE: Q2 internal call is direct function call in same file, not MCP-to-MCP. Tool itself has zero MCP-layer claims. Wire both diagnose+reset into ops or foreign-flow debug package.** |
| `get_accuracy_context` | NO | NO | NO (reads RAG analysis context, no live stream) | Has siblings get_calibration_report + get_label_accuracy_report | NO | **DEREGISTER — no concrete plan to wire within sprint; calibration_report covers the use case** |
| `get_label_accuracy_report` | NO agent claims | NO | YES (label accuracy DB) | DISTINCT from get_calibration_report (TSH FR-3 confirmed) | NO | **INTEGRATE: wire into market-analyst accuracy package. Description: label-level breakdown vs calibration curve.** |
| `get_public_contracts` | PARTIAL — docs/agents/tools/package/tran-ngoc-bau.md:87 lists it (Layer 4: agent package claim) | NO | YES (public investment data) | NO | Q5 conditional yes (tran-ngoc-bau agent exists) | **INTEGRATE: already in tran-ngoc-bau package (Q1 partial YES via agent package). Confirm tran-ngoc-bau flow references it; if yes = ALREADY INTEGRATED (cowork-refactory-expert to update list/ doc). If flow does not reference it, add it.** |
| `is_trading_day` | NO (cowork-match-slots.js main branch does NOT call is_trading_day; DWF-PHASE1 worktree is not shipped) | NO | YES (trading calendar SSOT) | NO | NO (DWF-PHASE1 not in current sprint scope) | **DEREGISTER from this sprint. Tool was designed for DWF-PHASE1 which is not active. If DWF-PHASE2 is planned, re-register then.** |
| `list_flagged_bctc_cells` | NO | NO | YES (BCTC DB) | NO overlap; complements submit_bctc_correction | NO | **INTEGRATE: wire into bctc-analyst flow (human-inspect path). Pairs with submit_bctc_correction.** |
| `submit_bctc_correction` | NO | NO | YES (writes to bctc_corrections table) | NO | NO | **INTEGRATE: wire into bctc-analyst flow (human correction path). Confirmed it is the MCP entry point for the human-confirm pipeline (BCTC-HUMAN-CONFIRM sprint).** |

**NFR-U3-1 applied:** read_bctc_pdf resolved FIRST (DEREGISTER). Stabilises U2 count (count drops by 1 to 161 after this deregistration; generator re-run needed after U3 settles).

**Deregister list (3 tools):** read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day — **5 tools to deregister** (note: get_accuracy_context added).

**Integrate list (7 tools):** mark_alert_outcome (ops/alert package), get_market_foreign_flow (market-analyst), diagnose_foreign_flow_circuit_breaker + reset_foreign_flow_circuit_breaker (ops debug package), get_label_accuracy_report (market-analyst accuracy package), get_public_contracts (confirm tran-ngoc-bau flow), list_flagged_bctc_cells + submit_bctc_correction (bctc-analyst flow).

**Signal to cowork-refactory-expert:** 5 tools removed → their docs/agents/tools/list/ entries must be deleted; 7 tools wired → their packages must be updated. PM to send signal per NFR-COWORK-SIGNAL.

---

### U4: Direction+Delta Sweep — Market-Data get_* Tools

**Prev-session data availability (ARCH-U4-1 confirmed):**
- VnIndex: `daily_ohlcv` table has (code='VNINDEX', date, close) — prev-session close available via ORDER BY date DESC LIMIT 2
- Oil (brent_crude_usd): `commodity_prices` single row, no history → `prev_session_delta: null, direction: "unknown"`
- Gold (gold_usd_per_oz): same → null/unknown
- UsdVnd: `sbv_rates` single row, no history column → null/unknown

**Sweep verdict table:**

| Tool | Serves level? | Current delta coverage | Required change |
|---|---|---|---|
| `get_macro_snapshot` | YES (vnIndex, oilUsd, goldUsd, usdVnd) | None | Add `prev_session_delta` + `direction` for all 4 headline values. VnIndex = daily_ohlcv; Oil/Gold/UsdVnd = null + "unknown". **This change is in macro-indicators Go service response DTO** (the TS tool is a thin HTTP proxy — it passes through the JSON). Go service must query daily_ohlcv for VNINDEX prev-close and add delta fields to SnapshotDTO. |
| `get_market_snapshot` | YES (prices per ticker) | change_pct already served | NONE — change_pct and change_amt are already in market_prices schema; tool already returns them |
| `get_sector_comparison` | YES (sector scores/levels) | No delta | Add relative change vs prior period. Source: aggregate from daily_ohlcv sector grouping. **LOW PRIORITY — sector scores are composite indices not raw prices; delta less meaningful than for raw levels. DEFER to future sprint. Document in handoff as known gap.** |
| `get_technical_indicators` | YES (RSI, MACD) | RSI/MACD are already change-based (momentum) | NONE — RSI and MACD are inherently directional indicators |
| `get_carry_trade_signal` | NO (signal not a raw level) | Signal is directional by design | NONE |
| `get_yield_spread_signal` | NO (signal) | Signal is directional by design | NONE |
| `get_fed_liquidity_spread` | YES (spread value in bps) | No delta | Prev-session spread not persisted. Add `direction` only (computed from current vs threshold, not vs prev). Or serve null delta + "unknown" direction. **DEFER: spread data cadence is weekly not daily; prev-session delta has low value.** |

**Net required changes for U4:** Only `get_macro_snapshot` requires delta+direction. The change is in the **Go macro-indicators service** (apps/macro-indicators/pkg/application/dtos.go SnapshotDTO + usecases.go), not in the TS tool layer (TS tool is a thin proxy). The TS tool response schema extension (new fields appended, additive) requires no TS code change — JSON is passed through as-is.

**DDD layer for U4:** macro-indicators Go service — Infrastructure (daily_ohlcv query for VNINDEX prev-close) + Application (delta computation in usecases.go) + Interface (SnapshotDTO field extension). Zone: `apps/macro-indicators/`.

---

### U5: Foreign Flow Null Holding Ratio Design

**ARCH-U5-1 confirmed:** VPS API does not return holding_ratio. Serve-null applies permanently this sprint.

**Files to modify:**
1. `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts`
   - `formatForeignFlowOutput`: conditionally omit `Holding Ratio` table column header and column data when `row.holdingRatio === 0` (or null-check). Add helper `const hasRealHoldingData = history.some(r => r.holdingRatio > 0)`.
   - Lines 89-96 (daily history table): omit `| Holding Ratio` column header and `fmtRatio(row.holdingRatio)` cell when `!hasRealHoldingData`.
   - Lines 78-80 (`holdingRatioChange5d` line): gate on `signal.holdingRatioChange5d !== 0` OR gate on `hasRealHoldingData`.
   - Tool description string: remove "holding ratio change" from description until data is real.
2. `apps/mcp-server/src/domain/services/foreignFlowAnalyzer.ts` (NFR-U5-2)
   - `holdingRatioChange5d` computation: gate with `if (all holdingRatio values === 0) { holdingRatioChange5d = 0; }` — already effectively 0 but add explicit guard + `is_holding_ratio_fabricated: true` flag in ForeignFlowSignal.
3. `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts`
   - `foreign_holding_ratio` field from `current_holding_ratio`: emit `null` if value is 0.
4. Test: `foreignFlowTools.ts:186` — test path sets `holdingRatio: 0`; after fix, assert holding ratio column is ABSENT from output.

---

### U6: TSH Leftover Merge Verdicts

**get_market_summary vs generate_market_summary:** KEEP BOTH. `get_market_summary` = read-cache-first (if cached summary exists, return it; else generate). `generate_market_summary` = force-regenerate always. Both share `generatePeriodicSummary()` use-case. Consumers differentiated: `digest-predict/daily.md` calls `get_market_summary`; `digest-predict/weekly.md` calls `generate_market_summary`. **Required action: description update only** — clarify caching semantics in both tool descriptions.

**get_insider_signals vs get_insider_transactions:** KEEP BOTH. `get_insider_transactions` = DB-backed, returns raw SSC disclosure rows with streak detection (call without providing data). `get_insider_signals` = domain classifier, requires caller to provide `transactions[]` array as input (test-first design, no DB call). **Required action: description update only** — clarify that get_insider_signals is a classification engine (requires input transactions) while get_insider_transactions is a DB reader.

**5x trigger_*_vps_fetch:** KEEP SEPARATE. Schema divergence precludes clean consolidation:
- `trigger_bctc_vps_fetch`: has `tickers`, `verbose`, `dry_run` params; returns `{queued, attempted, success, failed, log_tail}`
- `trigger_price_vps_fetch`: has `tickers`, `verbose`, `dry_run` params; returns `{service, attempted, success, failed, log_tail}`
- `trigger_news_vps_fetch`: NO `tickers` param (source-based); returns `{service, attempted, success, failed, log_tail}`
- `trigger_sbv_vps_fetch`, `trigger_foreign_flow_vps_fetch`: separate SSH scripts
**Required action: description update** on all 5 to clarify the VPS script each invokes and expected return shape.

---

### Risk Flags

**R-1 (U2 count race):** U3 deregistrations (5 tools) + U6 description-only changes (no removal) will change tool count after U3 completes. U2 parity test must be run LAST (after all U3 deregistrations are committed). PM must sequence U2 parity-test commit as final step.

**R-2 (U1 handler wrapping):** `server._registeredTools` is a private field accessed via type cast in `server.ts:203`. This pattern is already used in production — safe to extend for the counter shim. The shim must be applied AFTER `registerAllTools(server)` completes.

**R-3 (U4 Go service change):** `apps/macro-indicators/` is a separate zone (dev-macro-indicators specialist). The U4 delta fix is NOT in dev-mcp-server's zone — PM must split U4 into its own subtask for dev-macro-indicators. The TS tool in mcp-server needs no change (passthrough proxy).

**R-4 (U5 test breakage):** `foreignFlowTools.ts:186` test sets `holdingRatio: 0` explicitly. Post-fix, assertions on holding-ratio output presence will break. dev-mcp-server must update test assertions.

**R-5 (U3 cowork-refactory-expert signal):** 5 deregistrations require their docs/agents/tools/list/ entries removed. This is cowork-refactory-expert's lane. PM must queue a signal to that lane after U3 commit.

---

### PM Task Split Recommendation

| Subtask | Assignee | Zone | Priority | Sequencing |
|---|---|---|---|---|
| TSU-DEV-U1 | dev-mcp-server | apps/mcp-server/ | P1 | First (parallel with TSU-DEV-U2-GEN) |
| TSU-DEV-U2-GEN | dev-mcp-server | apps/mcp-server/ + scripts/ | P1 | First (parallel with TSU-DEV-U1) |
| TSU-DEV-U3 | dev-mcp-server | apps/mcp-server/ | P2 | After U1+U2-GEN (count must be stable before parity test) |
| TSU-DEV-U2-PARITY | dev-mcp-server | apps/mcp-server/ | P1 | LAST — after all U3 deregistrations committed |
| TSU-DEV-U4 | dev-macro-indicators | apps/macro-indicators/ | P2 | Independent; parallel with U3 |
| TSU-DEV-U5 | dev-mcp-server | apps/mcp-server/ | P2 | Independent; parallel with U3 |
| TSU-DEV-U6 | dev-mcp-server | apps/mcp-server/ | P3 | After U3 settles |

**Rebuild required:** Each dev-mcp-server commit requires ops REBUILD (build --no-cache + force-recreate). dev-macro-indicators commit requires separate REBUILD of macro-indicators container.

**Scan clean:** true
