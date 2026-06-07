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
