# po-s51-arch-tsu-fanout-materialize.jq
# Materialize the 7 ARCH-TSU fan-out dev-task STUBS (brief docs/architecture-briefs/2026-06-13-tool-surface-upgrade.md, commit 371437a7)
# from prose into REAL backlog tasks on .task_board.backlog.
#
# READY wave (dispatchable now):   TSU-DEV-U1, TSU-DEV-U2-GEN, TSU-DEV-U4
# BLOCKED (gated on deps):         TSU-DEV-U3 [U1,U2-GEN], TSU-DEV-U5 [U1,U2-GEN], TSU-DEV-U6 [U3], TSU-DEV-U2-PARITY [U3,U6]
#
# Idempotent: any task whose id already exists in ANY task_board lane is skipped (no dup, no count change).
# Atomic-write via wrapper (see Usage). Commit-mutex-guarded by dispatcher.
# Usage:
#   NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
#   jq -f scripts/po-s51-arch-tsu-fanout-materialize.jq --arg now "$NOW" docs/data/orch/orch-state.json > tmp \
#     && [ -s tmp ] && jq -e . tmp >/dev/null && mv tmp docs/data/orch/orch-state.json
# Owning flow pointer: docs/agents/po/flow/sprint-kickoff.md (fan-out STUB materialization) + dev-standards § Script Persistence
#
# SERIALIZATION NOTE (router-binding): U1 and U2-GEN are BOTH apps/mcp-server zone and BOTH READY,
# but the apps/mcp-server code-in-flight serialization rule means the router dispatches only ONE into
# the mcp-server slot. U4 (apps/macro-indicators, separate zone) runs in PARALLEL.

. as $root
# --- set of ids already present anywhere on the board (idempotency guard) ---
| ([ $root.task_board | to_entries[] | .value | if type=="array" then .[] else empty end | (.id // empty) ]) as $existing
# --- candidate tasks (full groom from brief seams + per-unit DoD) ---
| [
    {
      "id": "TSU-DEV-U1",
      "title": "TSU-DEV-U1 — Per-call telemetry counter: replace dead sessionToolCache (never populated under gateway per-call model) with a synchronous per-call invocation counter; flush to docs/agent-memory/modules/tool-usage-stats.json; REMOVE sessionCount (semantically undefined post-gateway).",
      "owner": "dev-mcp-server",
      "status": "READY",
      "type": "FIX",
      "zone": "apps/mcp-server/",
      "priority": "high",
      "size": "M",
      "created_at": $now,
      "created_by": "po",
      "depends_on": [],
      "blocked_by": [],
      "files": [
        "apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts",
        "apps/mcp-server/src/interface/mcp/server.ts",
        "apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts",
        "docs/agent-memory/modules/tool-usage-stats.json"
      ],
      "baseline_pass": "Live mcp-server suite floor per project-stats.json: 9408 pass / 348 fail (testBaseline). Post-fix: no NET regression below floor; new perCallCounterStore unit test added (counter increments + getSnapshot shallow-copy + resetCounters).",
      "verification_gate": "no_cached_pass_bun_isolation",
      "verification_gate_detail": "QA via gateway: (1) invoke ANY tool via call_tool(server=vn-market) once; (2) force-run trackSessionToolUsageJob; (3) assert docs/agent-memory/modules/tool-usage-stats.json toolCounts[<invokedTool>] >= 1 AND sessionCount field ABSENT AND uniqueTools == Object.keys(toolCounts).length. Run bun test in ISOLATION (no cached pass) — verify the new perCallCounterStore test actually executed (deliberate-fail proof: break increment, confirm test goes red, revert).",
      "root_cause_requirement": "Root cause (brief U1): sessionToolCache is populated only at the SSE handshake (server.ts:205) which NEVER fires under the gateway per-call dial-drop model, so trackSessionToolUsageJob reads an always-empty snapshot -> sessionCount:0/toolCounts:{} permanently. FIX the cause: new singleton perCallCounterStore.ts (Map<string,number>, exports incrementTool/getSnapshot/resetCounters, no I/O); wrap each handler in server.ts AFTER registerAllTools(server) completes (~L220, same _registeredTools private-field pattern already used at server.ts:203-219 — R-2: applying BEFORE registerAllTools wraps an empty map, FORBIDDEN) with a proxy that calls incrementTool(name) then delegates; trackSessionToolUsageJob reads perCallCounterStore.getSnapshot(). FORBIDDEN: keeping sessionToolCache read-path or renaming sessionCount to a still-meaningless field — REMOVE it. Output schema: { generatedAt, uniqueTools, toolCounts:{[name]:number} }.",
      "note": "[po fan-out 2026-06-13] Materialized from ARCH-TSU brief §U1 (docs/architecture-briefs/2026-06-13-tool-surface-upgrade.md, commit 371437a7). FIRST WAVE — READY. apps/mcp-server SERIALIZATION: U1 + U2-GEN both READY + both mcp-server zone; router dispatches ONLY ONE into the mcp-server slot. PO RECOMMENDATION: dispatch U1 FIRST (smaller M-size, isolated telemetry seam, unblocks nothing downstream so lowest-risk to start while U2-GEN's larger generator+parity work queues next into the freed slot). U4 (macro-indicators) runs in PARALLEL.",
      "dispatch_note": "READY. mcp-server zone serialization: ONE of {U1,U2-GEN} into the slot. PO recommends U1 first. Router raw-verifies + claims."
    },
    {
      "id": "TSU-DEV-U2-GEN",
      "title": "TSU-DEV-U2-GEN — Tool-registry generator from source + parity test: static-grep generator scanning BOTH server.tool( AND server.registerTool( in tools/**/*.ts; deliberate-violation parity test (NFR-FENCE); sync project-stats.json toolCount from generator output (generator is the SSOT arbiter, not /health, not a hardcoded literal).",
      "owner": "dev-mcp-server",
      "status": "READY",
      "type": "IMPL",
      "zone": "apps/mcp-server/",
      "priority": "high",
      "size": "L",
      "created_at": $now,
      "created_by": "po",
      "depends_on": [],
      "blocked_by": [],
      "files": [
        "scripts/gen-tool-registry.ts",
        "apps/mcp-server/src/__tests__/tool-registry-parity.test.ts",
        "scripts/gen-project-stats.ts",
        "docs/data/tool-registry.json",
        "docs/data/project-stats.json"
      ],
      "baseline_pass": "Live mcp-server suite floor 9408 pass / 348 fail. Post-impl: parity test PASSES; +1 new test file (tool-registry-parity). Generator output totalCount=162 pre-U3 (162 runtime = 161 server.tool + 1 server.registerTool).",
      "verification_gate": "no_cached_pass_bun_isolation",
      "verification_gate_detail": "QA: (1) run `bun scripts/gen-tool-registry.ts` -> valid JSON at docs/data/tool-registry.json with _maintained_by header + totalCount==162 (pre-U3) grouped by source folder; (2) bun test tool-registry-parity in ISOLATION -> PASS; (3) deliberate-violation proof: inject fake name '__test_fake_tool__' into registry, assert parity test goes RED, revert -> GREEN (this is NOT a skip-the-proof exit-0 fence); (4) `bun scripts/gen-project-stats.ts` -> project-stats.json toolCount == generator totalCount.",
      "root_cause_requirement": "Root cause (brief U2): docs/data/tool-registry.json hand-decayed (125 listed 2026-05-03 vs 162 live); no generator existed. FIX: scripts/gen-tool-registry.ts scans apps/mcp-server/src/interface/mcp/tools/**/*.ts, regex-extracts names from BOTH `server.tool(\"name\",` AND `server.registerTool(\"name\",` (the registerTool API at analysis/sequential-market-analysis.ts:241 is the 161->162 delta-of-1 per ARCH-U2-2; ARCH-U2-1 confirmed no registrations live outside tools/**), groups by parent-folder category, writes {_maintained_by:'generator (do not hand-edit)', lastUpdated, totalCount, groups}. Parity test re-runs the same extraction and asserts registry.totalCount==source count AND every registry name exists in source. scripts/gen-project-stats.ts imports totalCount to populate project-stats.json toolCount (FR-U2-4). FORBIDDEN: single-API grep (would miss registerTool and undercount by 1); hardcoding 162; hand-editing tool-registry.json.",
      "note": "[po fan-out 2026-06-13] Materialized from ARCH-TSU brief §U2 (commit 371437a7). FIRST WAVE — READY. mcp-server SERIALIZATION peer of U1 — only ONE into the slot. PO recommends U1 first (this L-size generator queues next into the freed mcp-server slot). NFR-U2-1: _maintained_by header mandatory. This task ESTABLISHES the generator that U2-PARITY re-runs LAST.",
      "dispatch_note": "READY. mcp-server zone serialization peer of U1. PO recommends U1 first; U2-GEN next into freed slot. Router raw-verifies + claims."
    },
    {
      "id": "TSU-DEV-U4",
      "title": "TSU-DEV-U4 — get_macro_snapshot prev-session delta+direction: extend SnapshotDTO with prev_session_delta (*float64) + direction enum (up/down/flat/unknown) for the 4 headline metrics; compute VNINDEX delta from daily_ohlcv LIMIT 2; emit null/unknown for oil/gold/usdVnd (prev-session NOT persisted). SEPARATE ZONE — parallel-eligible.",
      "owner": "dev-macro-indicators",
      "status": "READY",
      "type": "IMPL",
      "zone": "apps/macro-indicators/",
      "priority": "high",
      "size": "M",
      "created_at": $now,
      "created_by": "po",
      "depends_on": [],
      "blocked_by": [],
      "files": [
        "apps/macro-indicators/pkg/application/dtos.go",
        "apps/macro-indicators/pkg/application/usecases.go",
        "apps/macro-indicators/pkg/infrastructure/repositories.go"
      ],
      "baseline_pass": "Go macro-indicators suite green at HEAD. Post-impl: additive struct fields only (NFR-U4-2, no rename/removal); new usecase delta-computation test.",
      "verification_gate": "no_cached_pass_go_count_1",
      "verification_gate_detail": "QA: (1) `go test ./... -count=1` in apps/macro-indicators (NO cached pass) -> green incl. new delta test; (2) call_tool(server=vn-market, tool=get_macro_snapshot) RAW response includes prev_session_delta + direction for all 4 metrics; VNINDEX shows a real delta+direction (up/down/flat), oil/gold/usdVnd show prev_session_delta:null + direction:'unknown' (NEVER fabricated). direction is a STRING enum not boolean (NFR-U4-1).",
      "root_cause_requirement": "Root cause (brief U4): get_macro_snapshot serves point-in-time values with no delta vs previous session (violates feedback_market_data_direction.md). FIX in the Go macro-indicators zone (the TS MCP tool is a passthrough proxy — NO change there, new JSON fields flow through automatically): dtos.go extend SnapshotDTO additively with PrevSessionDelta *float64 + Direction string for each of 4 headline values; usecases.go compute delta = current - prev_close from daily_ohlcv VNINDEX two-row (assign up/down/flat; flat if |delta|<threshold; unknown if prev absent); repositories.go:154-197 FetchVNIndex extend to return prev-close row alongside current (ARCH-U4-1: daily_ohlcv has (code,date,close) -> prev-session computable for VNINDEX only; oilUsd/goldUsd/usdVnd sit in single-row commodity_prices/sbv_rates with NO history -> emit null/unknown). FORBIDDEN: fabricating a delta for oil/gold/usdVnd; renaming/removing existing SnapshotDTO fields; touching the TS macro tool.",
      "note": "[po fan-out 2026-06-13] Materialized from ARCH-TSU brief §U4 (commit 371437a7). FIRST WAVE — READY + PARALLEL-ELIGIBLE. R-3: apps/macro-indicators/ is dev-macro-indicators territory, a SEPARATE zone from apps/mcp-server/ — it does NOT consume the mcp-server serialization slot and runs in PARALLEL with whichever single mcp-server task (U1 or U2-GEN) the router dispatches. MUST NOT be assigned to dev-mcp-server.",
      "dispatch_note": "READY + PARALLEL. Separate zone (macro-indicators) — independent of the mcp-server slot. Router may dispatch this concurrently with the chosen mcp-server task. Router raw-verifies + claims."
    },
    {
      "id": "TSU-DEV-U3",
      "title": "TSU-DEV-U3 — 12 weak-claim tool verdicts: DEREGISTER 5 zero-claim tools (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day) + INTEGRATE 7 (description updates) per brief 4-layer verdict matrix. Signal cowork-refactory-expert (PM lane) after commit.",
      "owner": "dev-mcp-server",
      "status": "BLOCKED",
      "type": "FIX",
      "zone": "apps/mcp-server/",
      "priority": "high",
      "size": "L",
      "created_at": $now,
      "created_by": "po",
      "depends_on": ["TSU-DEV-U1", "TSU-DEV-U2-GEN"],
      "blocked_by": ["TSU-DEV-U1", "TSU-DEV-U2-GEN"],
      "files": [
        "apps/mcp-server/src/interface/mcp/tools/"
      ],
      "baseline_pass": "Live mcp-server suite floor 9408 pass / 348 fail. Post-fix: settled runtime tool count drops 162->157 (5 deregistered). Removed-tool tests pruned; no NET regression on remaining suite.",
      "verification_gate": "no_cached_pass_bun_isolation",
      "verification_gate_detail": "QA after rebuild: (1) list_server_tools('vn-market') RAW response does NOT contain ANY of the 5 deregistered names (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day); (2) the 7 integrated tools' descriptions updated per matrix (mark_alert_outcome 'post-hoc; complements write_alert_verdict'; get_market_foreign_flow 'market-wide SUM; distinct from get_foreign_flow per-ticker'; diagnose+reset_foreign_flow_circuit_breaker paired; get_label_accuracy_report 'per-label; complement to get_calibration_report'; get_public_contracts; list_flagged_bctc_cells + submit_bctc_correction BCTC human-inspect); (3) bun test ISOLATION green (no cached pass). Count-drop parity is verified LATER by U2-PARITY (sequenced last), NOT here.",
      "root_cause_requirement": "Root cause (brief U3): 12 tools have zero usage claims across all 4 layers; single-layer grep is FORBIDDEN (NFR-U3-2, 2026-05-03 = 6/6 false positives). Verdicts already adjudicated in the brief via full 4-layer + internal-call sweep (ARCH-U3-1: is_trading_day NOT called on main, only in unmerged DWF-PHASE1 worktree -> DEREGISTER; NFR-U3-1: read_bctc_pdf settled FIRST -> DEREGISTER, overlaps get_bctc_page_text/image). FIX: remove the 5 server.tool() blocks + orphaned imports; update the 7 integrate-target descriptions. FORBIDDEN: re-litigating verdicts with a fresh single-layer grep; deregistering any of the 7 integrate tools; removing diagnose/reset circuit-breaker (paired INTEGRATE). PM (NFR-COWORK-SIGNAL/R-5) queues cowork-refactory-expert signal after THIS commit: 5 list/ entries removed + 7 package/*.md updates. Architect/dev do NOT touch docs/agents/tools/{list,package}/.",
      "note": "[po fan-out 2026-06-13] Materialized from ARCH-TSU brief §U3 (commit 371437a7). BLOCKED on U1+U2-GEN (both must commit first — mcp-server serialization + U2 generator must exist before tool removals so count is measurable). Unblocks after both deps DONE.",
      "dispatch_note": "BLOCKED — do NOT dispatch until TSU-DEV-U1 AND TSU-DEV-U2-GEN are DONE. Then enters mcp-server slot (serialized)."
    },
    {
      "id": "TSU-DEV-U5",
      "title": "TSU-DEV-U5 — Foreign-flow fabricated holding_ratio (DSI defect, SAME CLASS as the FDA-9 fail-open just shipped): kill `current_holding_ratio ?? 0` fabrication (vnstockStore.ts:561) at the OUTPUT layer — serve-null gates so get_foreign_flow / get_company_profile NEVER render 0.00% as a real ratio. HIGH-VALUE correctness/DSI-fabrication fix.",
      "owner": "dev-mcp-server",
      "status": "BLOCKED",
      "type": "FIX",
      "zone": "apps/mcp-server/",
      "priority": "high",
      "size": "M",
      "created_at": $now,
      "created_by": "po",
      "depends_on": ["TSU-DEV-U1", "TSU-DEV-U2-GEN"],
      "blocked_by": ["TSU-DEV-U1", "TSU-DEV-U2-GEN"],
      "files": [
        "apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts",
        "apps/mcp-server/src/domain/services/foreignFlowAnalyzer.ts",
        "apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts"
      ],
      "baseline_pass": "Live mcp-server suite floor 9408 pass / 348 fail. Post-fix: foreignFlowTools.ts:186 test UPDATED to assert Holding Ratio column ABSENT (R-4 — was asserting presence with holdingRatio:0); no NET regression.",
      "verification_gate": "no_cached_pass_bun_isolation",
      "verification_gate_detail": "QA: (1) call_tool get_foreign_flow RAW output does NOT contain a 'Holding Ratio' column NOR a 'Holding ratio change (5d)' line when all holding ratios are 0; (2) call_tool get_company_profile foreign_holding_ratio emits null (NOT 0) when current_holding_ratio is 0; (3) foreignFlowAnalyzer holdingRatioChange5d == null when history.every(r=>r.holdingRatio===0) AND is_holding_ratio_fabricated:true flag present on ForeignFlowSignal; (4) bun test ISOLATION green incl. the UPDATED foreignFlowTools.ts:186 assert-ABSENT test (deliberate-fail proof it runs). HIGH-VALUE: same fail-open/fabrication class as FDA-9.",
      "root_cause_requirement": "Root cause (brief U5): get_foreign_flow renders 'Holding Ratio: 0.00%' for every ticker daily. VPS ingest (vps-scripts/fetch-foreign-flow.sh) fetches only fBVol/fSVolume/fRoom; bgapidatafeed.vps.com.vn exposes NO holding_ratio field (ARCH-U5-1 confirmed, audit comment L42-48). vnstockStore.ts:561 `row.current_holding_ratio ?? 0` fabricates 0 as real -> DSI invariant violation. FIX at the OUTPUT layer (serve-null), NOT a migration (FR-U5-3: columns stay): foreignFlowTools.ts add hasRealHoldingData guard -> omit Holding Ratio column header+cell (L89-96) and the holdingRatioChange5d signal line (L78-80) when false; foreignFlowAnalyzer.ts guard holdingRatioChange5d=null when all-zero + add is_holding_ratio_fabricated flag (NFR-U5-2); companyProfileTools.ts emit null not 0; update foreignFlowTools.ts:186 test to assert ABSENT (R-4); strip 'holding ratio change' from tool description until data is real. FORBIDDEN: keep serving 0 as real; a schema migration; symptom-patch at the store ?? 0 alone without the output gates.",
      "note": "[po fan-out 2026-06-13] Materialized from ARCH-TSU brief §U5 (commit 371437a7). FLAGGED HIGH-VALUE — LAST-SHIP CORRECTNESS / DSI-FABRICATION defect, same class as the FDA-9 fail-open just shipped (never serve fabricated data as real). BLOCKED on U1+U2-GEN. May run in the mcp-server slot in serial queue after U3 (per brief stub: parallel-with-U3 if mcp-server slot allows serial queueing) — router serializes the slot.",
      "dispatch_note": "BLOCKED — do NOT dispatch until TSU-DEV-U1 AND TSU-DEV-U2-GEN are DONE. High-value DSI fix. Then enters mcp-server slot (serialized with U3)."
    },
    {
      "id": "TSU-DEV-U6",
      "title": "TSU-DEV-U6 — TSH leftover merge verdicts: DESCRIPTION-ONLY updates on 9 tools (get_patterns/get_technical_indicators, 5x trigger_*_vps_fetch, get_market_summary/generate_market_summary, get_insider_signals/get_insider_transactions). NO server.tool() removals (all verdicts: keep separate, clarify).",
      "owner": "dev-mcp-server",
      "status": "BLOCKED",
      "type": "FIX",
      "zone": "apps/mcp-server/",
      "priority": "medium",
      "size": "S",
      "created_at": $now,
      "created_by": "po",
      "depends_on": ["TSU-DEV-U3"],
      "blocked_by": ["TSU-DEV-U3"],
      "files": [
        "apps/mcp-server/src/interface/mcp/tools/"
      ],
      "baseline_pass": "Live mcp-server suite floor 9408 pass / 348 fail. Post-fix: description-string changes only; NO tool count change (NFR-U6-3 not triggered); no NET regression.",
      "verification_gate": "no_cached_pass_bun_isolation",
      "verification_gate_detail": "QA: (1) the 9 tool description strings updated per brief FR-U6-1..4 (get_patterns 'RAG corpus historical pattern' vs get_technical_indicators 'quantitative momentum, TA engine port 5003'; 5x trigger_*_vps_fetch document each VPS script + return shape; get_market_summary 'read-cache-first' vs generate_market_summary 'force-regenerate'; get_insider_signals 'classification engine, caller provides transactions[]' vs get_insider_transactions 'DB reader from SSC disclosure store'); (2) NO server.tool() block removed; (3) list_server_tools count UNCHANGED vs post-U3; (4) bun test ISOLATION green.",
      "root_cause_requirement": "Root cause (brief U6): TSH sprint (2026-05-31) produced written merge diffs for overlapping tool pairs but never executed description updates. ARCH-U6-1 RESOLVED all 4 pairs = KEEP BOTH/SEPARATE, description-update only (verified distinct data sources / cache semantics / layers per brief). FIX: update the 9 description strings only. FORBIDDEN: removing any server.tool() block (NFR-U6-3 must NOT trigger); merging any pair (architect ruled keep-separate); touching get_market_summary registration (may be referenced in cowork flows — description only).",
      "note": "[po fan-out 2026-06-13] Materialized from ARCH-TSU brief §U6 (commit 371437a7). BLOCKED on U3 (description updates must land AFTER U3 deregistrations settle so the surface is stable). Unblocks after U3 DONE.",
      "dispatch_note": "BLOCKED — do NOT dispatch until TSU-DEV-U3 is DONE. Description-only, mcp-server slot (serialized)."
    },
    {
      "id": "TSU-DEV-U2-PARITY",
      "title": "TSU-DEV-U2-PARITY — FINAL registry/count parity: re-run gen-tool-registry + parity test AFTER all U3 (5 deregistrations) + U6 commits land; assert final settled count == 157; update docs/data/tool-registry.json + project-stats.json toolCount to generator output. MUST BE LAST mcp-server task (R-1).",
      "owner": "dev-mcp-server",
      "status": "BLOCKED",
      "type": "FIX",
      "zone": "apps/mcp-server/",
      "priority": "high",
      "size": "S",
      "created_at": $now,
      "created_by": "po",
      "depends_on": ["TSU-DEV-U3", "TSU-DEV-U6"],
      "blocked_by": ["TSU-DEV-U3", "TSU-DEV-U6"],
      "files": [
        "apps/mcp-server/src/__tests__/tool-registry-parity.test.ts",
        "docs/data/tool-registry.json",
        "docs/data/project-stats.json"
      ],
      "baseline_pass": "Live mcp-server suite floor 9408 pass / 348 fail. Post-task: parity test GREEN at settled count 157; project-stats.json toolCount==157 (generator-arbitrated).",
      "verification_gate": "no_cached_pass_bun_isolation",
      "verification_gate_detail": "QA: (1) `bun scripts/gen-tool-registry.ts` -> docs/data/tool-registry.json totalCount==157 (162 minus 5 U3 deregistrations; U6 removed 0); (2) bun test tool-registry-parity in ISOLATION -> PASS at 157 (no cached pass — confirm it re-ran against the post-U3/U6 source); (3) list_server_tools('vn-market') RAW count == 157; (4) `bun scripts/gen-project-stats.ts` -> project-stats.json toolCount==157. This is the count-drop confirmation deferred from U3.",
      "root_cause_requirement": "Sequencing (brief R-1 / U2 sequencing constraint): a parity test run BEFORE U3 deregistrations + U6 settle FAILS on count mismatch (stale 162 vs 157). This stub is pinned the FINAL mcp-server task. FIX: re-run the U2-GEN generator against the post-U3/post-U6 source, confirm totalCount==157, update tool-registry.json + project-stats.json toolCount. FORBIDDEN: running this before U3 AND U6 are committed; hardcoding 157 (generator must derive it).",
      "note": "[po fan-out 2026-06-13] Materialized from ARCH-TSU brief §U2 sequencing + AC8 (commit 371437a7). MUST BE LAST — depends on U3 AND U6 deregistration/description commits. The U2-GEN generator (built first wave) is RE-RUN here against the settled surface.",
      "dispatch_note": "BLOCKED — do NOT dispatch until BOTH TSU-DEV-U3 AND TSU-DEV-U6 are DONE. LAST mcp-server task. Router serializes."
    }
  ] as $candidates
# --- keep only candidates not already on the board (idempotent) ---
# NB: capture candidate .id into $cid BEFORE `$existing | index($cid)` — inside index() the `.` is $existing, not the candidate.
| ([ $candidates[] | . as $c | ($c.id) as $cid | select(($existing | index($cid)) | not) ]) as $toadd
| .task_board.backlog += $toadd
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
| ._updated_at = $now
| ._updated_by = "po"
