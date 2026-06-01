<!-- size-justification: 220L — requirement spec for 6-item sprint with DDD layer mappings, acceptance criteria, and source-diff gates; all content is load-bearing for architect briefing -->

# REQ_TOOL-SURFACE-HYGIENE

**Sprint:** TOOL-SURFACE-HYGIENE
**Date:** 2026-05-31
**Author:** BA (ba)
**Status:** READY — handoff to architect

---

## Context

Sprint goal: every registered vn-market MCP tool is either truly wired or absent. Six items. Source of truth: `docs/SPRINT_GOAL.md` § TOOL-SURFACE-HYGIENE. PO raw-source verified (not relayed).

Live tool count: **154** (PO-verified via `grep -ro 'server.tool(' apps/mcp-server/src/interface/mcp/tools/ | wc -l` + HC-EXIT container probe). `docs/data/project-stats.json` shows stale **146**.

---

## Requirements

### FR-1: Resolve `get_market_hexagram` live-but-501 oracle

**Status: CONFIRMED DEFECT — ships first.**

**Verified source chain:**
- Registration: `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts:510` — one `server.tool()` call, no duplicate.
- Delegation: calls `getMarketHexagram()` → `infrastructure/microservices/clients.ts:505` → `GET {kinhDich}/market` on **kinh-dich-service port 5005**.
- The `"Not implemented — pending B-bucket primitive wiring"` 501 is emitted by **kinh-dich-service**, not by mcp-server. mcp-server surfaces the error honestly.
- The other 5 kinhdich tools (`get_kinhdich_reading`, `get_hexagram_history`, and others) are wired and must NOT be touched.

**Two mutually-exclusive options — architect chooses exactly one:**

**Option 1a — WIRE (kinh-dich-service zone):**
- Owner: kinh-dich-service dev owner (different zone from dev-mcp-server).
- Scope: implement the `/market` endpoint in kinh-dich-service so it produces a real VN-Index + macro hexagram reading using existing primitives (hao 1-3 = VN-Index 5d/20d/60d momentum; hao 4-6 = USD/VND, oil, gold sigma deviations per the tool description at `kinhDichTools.ts:512`).
- AC-1a-1: `get_market_hexagram` via gateway returns a response with `hexagram`, `name`, `trend`, `signal`, `confidence`, `timestamp` — no 501, no error text.
- AC-1a-2: No change to `apps/mcp-server/` code or registration.
- AC-1a-3: Vietnamese user-facing strings in kinh-dich-service preserved.
- Zone in architect brief: `kinh-dich-service`.

**Option 1b — DEREGISTER (apps/mcp-server zone) — default lean:**
- Owner: dev-mcp-server.
- Scope: remove the `server.tool("get_market_hexagram", …)` block at `kinhDichTools.ts:510–546`. Remove any dead import of `getMarketHexagram` if it becomes orphaned.
- AC-1b-1: After rebuild, `get_market_hexagram` is absent from the gateway tool list (verified via `list_server_tools("vn-market")` in-container, raw list not a badge).
- AC-1b-2: The other 5 kinhdich tools remain registered and functional (spot-check `get_kinhdich_reading` via gateway).
- AC-1b-3: `mcp-server` container rebuilt (`build --no-cache` + `force-recreate`, never restart-stale) before QA verifies.
- Zone in architect brief: `apps/mcp-server/`.

**DDD layer:** Interface (tool registration removal or downstream service wiring).

**NFR-1:** WIP sequencing — FR-1 ships before FR-2/3/4/5 begin any merge action.

---

### FR-2: Clarify or merge `mark_alert_outcome` vs `write_alert_verdict`

**Status: SUSPECTED OVERLAP — source diff required before any action.**

**BA source findings (pre-diff, for architect):**
- `mark_alert_outcome` (`alertAccuracy.ts:494`) — writes to SQLite `alerts` table, column `outcome` (HIT/MISS/UNKNOWN) + `outcome_at` + `outcome_detail`. Reads via `writeAlertOutcome()` from `infrastructure/db/alertStore.ts`. Used post-hoc to manually record whether a rule-based or commander alert was correct.
- `write_alert_verdict` (`alertVerdictTools.ts:107`) — writes to `docs/data/alert-verdicts.json` (file store via `infrastructure/fileStore/alertVerdictStore.ts`). Writes a pending verdict row at alert-fire time with ticker, direction, conviction, alertSource, firedAt. Verdict starts as `"pending"`, resolved later by a separate job.

**BA preliminary read: these appear DISTINCT** — different datastore (SQLite alerts table vs JSON file), different lifecycle (post-hoc scoring vs fire-time pending write), different schema. The source diff may confirm this is a "clarify descriptions" case, not a merge.

**Acceptance criteria for architect:**
- AC-2-1: Architect produces a written source diff in the brief covering: datastore target, schema shape, write lifecycle (when called in the alert flow), which agent/job calls each, and whether any caller would need re-pointing if one were removed.
- AC-2-2: If diff shows genuine duplication → merge with zero caller breakage (cron jobs, alert-commander flow, other tools re-pointed + tested). No blind merge without the diff.
- AC-2-3: If diff shows genuine distinction → update tool descriptions to make the distinction explicit. No merge.
- AC-2-4: In either case, the outcome is committed: either a merge (with tests proving no regression) or a description update.

**DDD layer:** Interface (tool description or registration); Infrastructure (store targets differ).

---

### FR-3: Clarify or merge macro accuracy trio

**Status: SUSPECTED OVERLAP — source diff required before any action.**

**Tools:**
- `get_calibration_report` (`calibrationTools.ts:282`) — reads `calibration_snapshots` table via `getLatestCalibrationSnapshot`. Returns Brier score, calibration curve, breakdown by agent/stock/direction, trend vs last week. Weekly snapshot (Sunday 20:00 VN). Input: optional `date` param.
- `get_label_accuracy_report` (`calibrationTools.ts:348`) — reads `market_messages` table via `getLabelAccuracyReport`. Returns per-agent signal accuracy from human verdict labels (signal vs noise). Lookback window `since_days`.
- `get_prediction_accuracy` (`predictionTools.ts:165`) — reads computed accuracy for Polymarket prediction signals via `computePredictionAccuracy` from `scheduler/macro/predictionOutcomeJob.js`. Returns precision = confirmed / (confirmed + false_positive) for volume_spike or probability_shift signals. Lookback `days` param.

**BA preliminary read: likely DISTINCT** — three different data sources (calibration_snapshots, market_messages human labels, Polymarket prediction outcomes), different computation methods, different audiences. Diff may confirm "clarify descriptions" case.

**Acceptance criteria for architect:**
- AC-3-1: Architect produces a written source diff covering: data source table, computation method, output schema, caller/consumer, what question each answers for the operator.
- AC-3-2: If any pair is genuinely duplicate → merge with zero caller breakage, proven by tests.
- AC-3-3: If all three are distinct → update descriptions to differentiate them (e.g. clarify that `get_calibration_report` = Brier/prediction-market accuracy, `get_label_accuracy_report` = human-label signal quality, `get_prediction_accuracy` = Polymarket signal precision).
- AC-3-4: No merge unless the diff demonstrates identical data source + computation.

**DDD layer:** Interface (descriptions); Application (if merge requires consolidating use cases).

---

### FR-4: Clarify or merge `get_patterns` vs `get_technical_indicators`

**Status: SUSPECTED OVERLAP — source diff required before any action.**

**Tools:**
- `get_patterns` (`marketTools.ts:328`) — queries `rag_analyses` table for historical precedents matching a stock + event keyword. Returns aggregate stats (avg impact score, dominant direction, list of matching past analyses). Input: stockCode, eventKeyword, lookbackHours. DDD: reads from RAG memory (LanceDB/rag_analyses).
- `get_technical_indicators` (`technicalIndicatorTools.ts:513`) — calls Go TA microservice (port 5003) via HTTP POST `/ta/indicators`; falls back to local DB computation. Returns RSI(14), MACD(12,26,9), MA(5/20/50), Bollinger Bands(20,2σ). Input: code, days.

**BA preliminary read: DISTINCT** — completely different data sources, computation methods, and use cases. `get_patterns` = semantic historical precedent lookup; `get_technical_indicators` = quantitative price-history derived indicators. Very unlikely to be duplicates. Diff is still required per sprint constraint.

**Acceptance criteria for architect:**
- AC-4-1: Architect produces a written source diff covering: data source, computation, input parameters, output schema, consumer use case.
- AC-4-2: If diff shows genuine duplication (unlikely) → merge with no caller breakage.
- AC-4-3: If diff shows genuine distinction (expected) → confirm tool descriptions are already clear; update if ambiguous.

**DDD layer:** Interface (descriptions); Infrastructure (different backends: RAG vs Go TA service).

---

### FR-5: Optional consolidation of 5x `trigger_*_vps_fetch` tools

**Status: OPTIONAL / LOW — architect-discretion, may be dropped entirely.**

**Tools (all in `system/` zone):**
- `trigger_bctc_vps_fetch` — `bctcDebugTriggerTool.ts:28` — SSH → `/root/run-bctc-debug.sh`; params: tickers[], verbose, dry_run; returns {queued, attempted, success, failed, log_tail}.
- `trigger_price_vps_fetch` — `priceDebugTriggerTool.ts:23` — SSH → `/root/run-price-debug.sh`; params: tickers[], verbose, dry_run; returns {service, attempted, success, failed, log_tail}.
- `trigger_news_vps_fetch` — `newsDebugTriggerTool.ts:22` — SSH → VPS news fetch script.
- `trigger_foreign_flow_vps_fetch` — `foreignFlowDebugTriggerTool.ts:23` — SSH → VPS foreign flow script.
- `trigger_sbv_vps_fetch` — `sbvDebugTriggerTool.ts:24` — SSH → VPS SBV script.

**Pattern:** All 5 are thin SSH-trigger debug tools with similar param shapes (tickers/verbose/dry_run) but different VPS scripts and slightly different return schemas.

**Consolidation option:** Replace 5 tools with `trigger_vps_fetch(source: enum["bctc","price","news","foreign_flow","sbv"])`. Reduces surface by 4 tool slots.

**Risk:** Each tool invokes a different VPS script with possibly different parameter semantics. A unified `source` param loses per-source param extensions (e.g. `bctc` has queue-specific behavior). Callers that rely on the specific tool name would need re-pointing.

**Acceptance criteria (if architect chooses to implement):**
- AC-5-1: A single `trigger_vps_fetch(source, tickers?, verbose?, dry_run?)` replaces all 5 tools.
- AC-5-2: All 5 SSH scripts remain callable with the same arguments. No VPS-side change.
- AC-5-3: Return schemas unified or the `source`-specific portion preserved as a typed union.
- AC-5-4: Any cron or agent call to a specific trigger tool is re-pointed; zero silent breakage.

**If architect drops:** Mark as `WONTFIX-LOW` in brief with rationale. Do not block #1-#4 or #6.

**DDD layer:** Interface (registration consolidation); Infrastructure (SSH dispatch adapter).

---

### FR-6: Reconcile `toolCount` in `docs/data/project-stats.json`

**Status: STAT RECONCILE — runs LAST, after #1-#5 churn settles.**

**Current state:** Both `toolCount` (line 34) and `infrastructureStatus.toolCount` (line 55) in `docs/data/project-stats.json` read **146** (stale, dated 2026-05-20). Live count PO-verified = **154**.

**Sequencing:** This task runs LAST. After #1-#5 actions complete:
- If #1 = deregister: net 154 → 153.
- If #1 = wire: net stays 154.
- If #5 = consolidate: net drops by 4 more.
- Final live count = ground truth for this field.

**Owner:** system-auditor / PM (not dev-mcp-server).

**Acceptance criteria:**
- AC-6-1: `toolCount` and `infrastructureStatus.toolCount` in `docs/data/project-stats.json` match the live registration count after all sprint changes settle. Verified by re-running `grep -ro 'server.tool(' apps/mcp-server/src/interface/mcp/tools/ | wc -l` in-container (or against the rebuilt source).
- AC-6-2: Both fields updated atomically in a single commit (scoped `git add docs/data/project-stats.json`).
- AC-6-3: The date/version field in project-stats.json is bumped to 2026-05-31.

**DDD layer:** Infrastructure / documentation (SSOT data file, no code change).

---

## Non-Functional Requirements

- **NFR-1 (sequencing):** FR-1 ships first. FR-2/3/4 each require a written source diff in the architect brief before any merge action. FR-5 is architect-discretion. FR-6 runs last.
- **NFR-2 (no-blind-merge):** For FR-2/3/4, if the diff shows genuine distinction, the AC is "clarify tool description" not "merge." If the diff shows genuine duplication, merge with zero caller breakage proven by tests. No merge without the diff.
- **NFR-3 (rebuild):** After any `apps/mcp-server/` code change (FR-1b, FR-2/3/4 merge, FR-5), ops rebuilds the container (`build --no-cache` + `force-recreate`, never `restart`). QA verifies the tool surface in-container via gateway wrapper, raw responses not badges.
- **NFR-4 (fence-false-green):** "exit 0" is not acceptance. For FR-1b: verify tool absence from gateway list. For merges: a deliberate test that the removed/merged tool path returns the correct response (or is absent). Per `feedback_fence_false_green`.
- **NFR-5 (scope):** BCTC tools not touched. The 3 cleared pairs not touched (`get_vps_proxy_health`/`get_vps_service_health`, `get_cron_health`/`get_pipeline_health`, `get_positions`/`get_user_positions_for_analysis`). The other 5 kinhdich tools not touched.
- **NFR-6 (main only):** No branches. Scoped `git add <file>` per file. Never `-A`.
- **NFR-7 (language):** All sprint artifacts in English. Vietnamese user-facing strings in kinhdich preserved if FR-1a chosen.

---

## Edge Cases

- **FR-1 zone mismatch:** If architect picks 1a (wire), the resulting task `zone:` must be `kinh-dich-service`, NOT `apps/mcp-server/`. Dev owner differs. Architect names this explicitly in the brief.
- **FR-2 different datastore:** `mark_alert_outcome` writes SQLite; `write_alert_verdict` writes JSON file. A merge would require a datastore decision — may be architecturally significant, not just a description change.
- **FR-3 calibration_snapshots vs market_messages:** Both are accuracy tools but read different tables populated by different jobs (weekly prediction-resolution job vs human label job). A merge would lose the distinction between machine-calibrated accuracy and human-labeled accuracy.
- **FR-5 param schema divergence:** `trigger_bctc_vps_fetch` returns `{queued, …}` while `trigger_price_vps_fetch` returns `{service, …}`. Unification of return schema is a breaking change for any caller parsing specific fields.
- **FR-6 count race:** If FR-5 is partially done (some tools removed, others pending), the count is not final. PM must sequence FR-6 AFTER all tool changes are committed and container is rebuilt.

---

## Blockers

None for PO. All ODs pre-resolved in sprint goal. The following are architect-level decisions, not PO blockers:

- **ARCH-DECIDE-1:** Wire vs deregister for `get_market_hexagram`. Default lean = deregister (PO-stated). Architect finalizes and names the zone explicitly.
- **ARCH-DECIDE-2:** For FR-2/3/4, architect runs the source diffs and determines merge vs description-clarify per pair.
- **ARCH-DECIDE-3:** For FR-5, architect decides whether the churn of consolidation is worth it given the thin harmless nature of the 5 triggers.

---

## DDD Layer Summary

| Item | Layer |
|---|---|
| FR-1a (wire) | Interface (mcp registration unchanged) + Application (kinh-dich-service endpoint) |
| FR-1b (deregister) | Interface (remove server.tool block) |
| FR-2 (diff first) | Interface (descriptions or registration); Infrastructure (different stores) |
| FR-3 (diff first) | Interface (descriptions); Application (use-case consolidation if merge) |
| FR-4 (diff first) | Interface (descriptions); Infrastructure (RAG vs Go TA) |
| FR-5 (optional) | Interface (registration consolidation); Infrastructure (SSH dispatch) |
| FR-6 (stat) | Documentation / Infrastructure (SSOT JSON) |

---

## Acceptance summary (architect brief must include)

1. FR-1: architect picks 1a or 1b; names zone explicitly; task zone matches choice.
2. FR-2/3/4: written source diff per pair/trio in the brief; merge only if diff proves duplication; description update if distinct.
3. FR-5: implement or drop with rationale.
4. FR-6: toolCount fields match live count post-churn, committed last.
5. ops rebuild after any mcp-server code change; QA raw-verifies tool surface in-container.
6. BCTC tools, 3 cleared pairs, 5 other kinhdich tools: zero diff.
